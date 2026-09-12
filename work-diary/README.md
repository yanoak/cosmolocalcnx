# Work diary

One file per working day, `YYYY-MM-DD.md`. Days with no work get no file — gaps are information,
not something to backfill.

| Section | What goes in it |
|---|---|
| **Tasks due today** | Written *first thing*. With a tracker, the issue table; without one, the plan of attack as bullets. Never edited later to match what happened — the gap between this and the work log is the useful part. |
| **Work log** | Chronological, written as you go. What was done and why, with commit refs and links. Prose beats a checklist: this is the part you actually reread months later. |
| **Plans & commits** | Generated. The day's commits grouped under the plan each belongs to, plus untagged work under **Unplanned**. |
| **Ad hoc todos** | Things that surfaced today and are in no tracker or plan. One `###` heading plus a collapsed `<details>` block each, so a future session can pick one up cold. |
| **Notes** | Decisions, lessons, blockers, carry-forward. Anything that changes the project's direction belongs in `CLAUDE.md` or the architecture docs as well — the diary is the trail, not the source of truth. |

## Running it

```sh
./scripts/work-diary.py              # today's entry, plus a filename hygiene check
./scripts/work-diary.py 2026-09-14   # a specific day
./scripts/work-diary.py --hygiene --apply   # fix misnamed plan files and their links
```

It creates the file from `_template.md` if missing, then regenerates **Plans & commits**. Safe to
re-run at the end of the day — it only touches text between the `<!-- generated -->` markers, so
everything written by hand is left alone.

## How plans, tasks and commits link up

1. **Plan → tasks** — the `## Tasks` checklist inside the plan file.
2. **Plan → commits** — a `Plan:` trailer on the commit naming the plan's slug.
3. **Day → plans** — this diary, generated from those trailers.

A plan also appears in the entry for the day it was *started*, before it has any commits, so the
trail begins at the moment of deciding rather than at the first commit. A trailer naming a plan
file that does not exist is flagged rather than silently dropped.

Work that does not deserve a plan lands under **Unplanned**. That is a normal outcome, not a
failure to plan — a diary where nothing is ever unplanned is a diary someone is gaming.

## Amending after generating

`work-diary.py` writes commit hashes into the entry. **Do not `git commit --amend` after running
it** — amending changes the hash, and the diary is left naming a commit that no longer exists.

Commit the diary as its own commit instead. That commit will not appear in its own table, which is
a one-commit lag rather than an error; the next run picks it up. A lagging table is fine; a table
pointing at a dead hash is not.

Note that `git cat-file -e <hash>` will still succeed for such a commit, because the object lingers
unreachable until garbage collection. To check reachability properly:

```sh
git merge-base --is-ancestor <hash> HEAD
```

## Ad hoc todo format

```markdown
### 1. Short title describing the todo

<details>
<summary>One-sentence summary of the issue</summary>

- **Current state:** ...
- **What's needed:** ...
- **Relevant files:** ...

</details>
```

When one is fixed, strike the title through and note the resolution in the work log
(`### ~~1. Short title~~ FIXED`). If one turns out to be substantial — multi-day, needs design, or
blocks other work — promote it to a plan or a tracker issue and link it here.
