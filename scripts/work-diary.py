#!/usr/bin/env python3
"""Work-diary generator and plan-filename hygiene.

    ./scripts/work-diary.py                 # today's entry + a hygiene dry-run
    ./scripts/work-diary.py 2026-09-14      # a specific day
    ./scripts/work-diary.py --hygiene       # report misnamed plan files only
    ./scripts/work-diary.py --hygiene --apply   # rename them and rewrite every reference

Layout is detected, not configured: `.cursor/plans/` + `.cursor/work-diary/` if they exist,
otherwise `plans/` + `work-diary/` at the repo root.

The diary's "Plans & commits" section is regenerated from git: each day's commits grouped under
the plan named in their `Plan:` trailer, with untagged work under "Unplanned". Nothing outside
the generated markers is ever touched, so the section can be refreshed at any time.
"""
import argparse
import glob
import os
import re
import subprocess
import sys
from datetime import date, datetime

MARK_OPEN = "<!-- generated: work-diary.py -->"
MARK_CLOSE = "<!-- /generated -->"
SEP = "\x1e"
DATED = re.compile(r"^\d{4}-\d{2}-\d{2}_")
UNDERSCORE_DATED = re.compile(r"^(\d{4})_(\d{2})_(\d{2})_")


def git(*args, check=True):
    r = subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True)
    if check and r.returncode:
        sys.exit(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout


def repo_root():
    r = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True
    )
    if r.returncode:
        sys.exit("not inside a git repository")
    return r.stdout.strip()


ROOT = repo_root()


def layout():
    """(plans_dir, diary_dir) relative to the repo root."""
    for plans, diary in ((".cursor/plans", ".cursor/work-diary"), ("plans", "work-diary")):
        if os.path.isdir(os.path.join(ROOT, plans)):
            return plans, diary
    sys.exit(
        "no plans directory found — expected .cursor/plans/ or plans/.\n"
        "Run the project-diary skill's init to scaffold one."
    )


PLANS_DIR, DIARY_DIR = layout()


# ---------------------------------------------------------------- plan lookup

def plan_files():
    """Real plans only — a leading underscore marks a template, never a plan."""
    return sorted(
        p for p in glob.glob(os.path.join(ROOT, PLANS_DIR, "*.plan.md"))
        if not os.path.basename(p).startswith("_")
    )


def resolve_plan(slug):
    """A `Plan:` trailer value -> a plan file. Accepts the full slug or the bare name."""
    files = plan_files()
    for want in (f"{slug}.plan.md",):
        for p in files:
            if os.path.basename(p) == want:
                return p
    for p in files:  # bare name: match after the date prefix
        base = os.path.basename(p).removesuffix(".plan.md")
        if base == slug or re.sub(r"^\d{4}-\d{2}-\d{2}_", "", base) == slug:
            return p
    return None


def plan_meta(path):
    """(title, status) from the first `# ` heading and any frontmatter `status:`."""
    text = open(path, encoding="utf-8").read()
    title = next(
        (m.group(1).strip() for m in re.finditer(r"^# (.+)$", text, re.M)),
        os.path.basename(path).removesuffix(".plan.md"),
    )
    status = next(
        (m.group(1).strip() for m in re.finditer(r"^status:\s*(.+)$", text, re.M)), ""
    )
    return title, status


# ------------------------------------------------------------------- commits

def commits_on(day):
    """[(hash, time, subject, plan_slug_or_None)] authored that calendar day, oldest first."""
    out = git(
        "log", "--all", "--no-merges",
        f"--since={day} 00:00", f"--until={day} 23:59:59",
        "--date=format:%H:%M",
        f"--pretty=format:%h{SEP}%ad{SEP}%s{SEP}"
        f"%(trailers:key=Plan,valueonly,separator=%x2C){SEP}",
    )
    rows = []
    for record in out.split(SEP + "\n"):
        parts = record.strip("\n").split(SEP)
        if len(parts) < 4 or not parts[0].strip():
            continue
        rows.append((parts[0].strip(), parts[1], parts[2], parts[3].strip() or None))
    rows.reverse()  # git log is newest-first; a diary reads better in the order it happened
    return rows


def table(rows):
    if not rows:
        return "_No commits yet._"
    lines = ["| Hash | Time | Subject |", "|---|---|---|"]
    lines += [f"| `{h}` | {t} | {s} |" for h, t, s, _ in rows]
    return "\n".join(lines)


def canonical(slug):
    """Trailer value -> the plan's real slug, so a bare name and a full slug group together."""
    path = resolve_plan(slug)
    return os.path.basename(path).removesuffix(".plan.md") if path else slug


def build_body(day):
    rows = [(h, t, s, canonical(slug) if slug else None) for h, t, s, slug in commits_on(day)]

    slugs = []
    for _, _, _, slug in rows:
        if slug and slug not in slugs:
            slugs.append(slug)
    for path in plan_files():  # plans started today appear before they have commits
        slug = os.path.basename(path).removesuffix(".plan.md")
        if slug.startswith(day) and slug not in slugs:
            slugs.append(slug)
    slugs.sort(key=lambda s: resolve_plan(s) is None)  # known plans first

    blocks = []
    for slug in slugs:
        path = resolve_plan(slug)
        if path:
            title, status = plan_meta(path)
            rel = os.path.relpath(path, os.path.join(ROOT, DIARY_DIR))
            heading = f"### [{title}]({rel})" + (f" · {status}" if status else "")
        else:
            heading = (
                f"### {slug}  \n"
                "_No plan file found — check the `Plan:` trailer or add the plan._"
            )
        blocks.append(f"{heading}\n\n{table([r for r in rows if r[3] == slug])}")

    loose = [r for r in rows if r[3] is None]
    if loose:
        blocks.append(f"### Unplanned\n\n{table(loose)}")

    return "\n\n".join(blocks) if blocks else "_No plans in play and no commits._"


# ------------------------------------------------------------------- hygiene

def first_commit_date(rel_path):
    out = git("log", "--diff-filter=A", "--follow", "--format=%ad", "--date=short",
              "--", rel_path, check=False)
    dates = [l for l in out.splitlines() if l.strip()]
    return dates[-1] if dates else date.today().isoformat()


def hygiene(apply_changes):
    """Plan and diary filenames must be date-prefixed with hyphens. Rename and fix links."""
    renames = []

    for path in plan_files():
        base = os.path.basename(path)
        rel = os.path.join(PLANS_DIR, base)
        if DATED.match(base):
            continue
        m = UNDERSCORE_DATED.match(base)
        if m:  # 2026_09_12_slug -> 2026-09-12_slug
            new = f"{m.group(1)}-{m.group(2)}-{m.group(3)}_" + base[m.end():]
        else:  # undated -> prefix with the date it entered git
            new = f"{first_commit_date(rel)}_{base}"
        renames.append((rel, os.path.join(PLANS_DIR, new), base, new))

    for path in sorted(glob.glob(os.path.join(ROOT, DIARY_DIR, "*.md"))):
        base = os.path.basename(path)
        m = re.fullmatch(r"(\d{4})_(\d{2})_(\d{2})\.md", base)
        if m:
            new = f"{m.group(1)}-{m.group(2)}-{m.group(3)}.md"
            renames.append((os.path.join(DIARY_DIR, base), os.path.join(DIARY_DIR, new), base, new))

    if not renames:
        print("hygiene: all plan and diary filenames conform.")
        return
    print(f"hygiene: {len(renames)} file(s) to rename")
    for _, _, old, new in renames:
        print(f"  {old}  ->  {new}")
    if not apply_changes:
        print("dry run. Re-run with --apply to rename and rewrite references.")
        return

    for old_rel, new_rel, _, _ in renames:
        tracked = subprocess.run(
            ["git", "-C", ROOT, "ls-files", "--error-unmatch", old_rel],
            capture_output=True,
        ).returncode == 0
        if tracked:
            git("mv", old_rel, new_rel)
        else:
            os.rename(os.path.join(ROOT, old_rel), os.path.join(ROOT, new_rel))

    targets = sorted(
        glob.glob(os.path.join(ROOT, DIARY_DIR, "*.md")) + plan_files()
    ) + [p for p in (os.path.join(ROOT, "CLAUDE.md"), os.path.join(ROOT, "AGENTS.md"))
         if os.path.exists(p)]
    touched = 0
    for target in targets:
        text = original = open(target, encoding="utf-8").read()
        for _, _, old, new in renames:
            text = text.replace(old, new)
        if text != original:
            open(target, "w", encoding="utf-8").write(text)
            touched += 1
    print(f"renamed {len(renames)} file(s); rewrote references in {touched} file(s).")


# ---------------------------------------------------------------------- main

def write_entry(day):
    path = os.path.join(ROOT, DIARY_DIR, f"{day}.md")
    if not os.path.exists(path):
        tpl_path = os.path.join(ROOT, DIARY_DIR, "_template.md")
        if not os.path.exists(tpl_path):
            sys.exit(f"missing {DIARY_DIR}/_template.md — run the project-diary skill's init")
        dayname = datetime.strptime(day, "%Y-%m-%d").strftime("%A")
        tpl = open(tpl_path, encoding="utf-8").read()
        open(path, "w", encoding="utf-8").write(
            tpl.replace("YYYY-MM-DD (Dayname)", f"{day} ({dayname})")
        )
        print(f"created {os.path.relpath(path, ROOT)}")

    src = open(path, encoding="utf-8").read()
    new, n = re.subn(
        rf"({re.escape(MARK_OPEN)}\n).*?(\n{re.escape(MARK_CLOSE)})",
        lambda m: m.group(1) + build_body(day).replace("\\", "\\\\") + m.group(2),
        src, flags=re.S,
    )
    if not n:
        sys.exit(f"no generated block in {os.path.relpath(path, ROOT)} — restore the markers")
    open(path, "w", encoding="utf-8").write(new)
    print(f"updated plans & commits in {os.path.relpath(path, ROOT)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("day", nargs="?", default=date.today().isoformat())
    ap.add_argument("--hygiene", action="store_true", help="check plan/diary filenames only")
    ap.add_argument("--apply", action="store_true", help="with --hygiene, perform the renames")
    args = ap.parse_args()

    if args.hygiene:
        hygiene(args.apply)
        return
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.day):
        ap.error("day must be YYYY-MM-DD")
    write_entry(args.day)
    hygiene(False)


if __name__ == "__main__":
    main()
