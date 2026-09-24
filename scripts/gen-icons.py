#!/usr/bin/env python3
"""Generate candidate pin icons through the Higgsfield CLI.

    scripts/gen-icons.py [--ids kae,wat-umong] [--n 1] [--round r1] [--dry-run]

Reads scripts/icons/manifest.json, builds one prompt per icon from the shared STYLE block plus
the icon's subject, and runs Nano Banana 2 with the KV reference images. Results land in
data/icons/candidates/<id>/<round>-<n>.png with the prompt beside each, and a labelled contact
sheet is written to data/icons/contact-sheet.png. Nothing here is committed: data/icons/ is
gitignored, and a chosen candidate is copied by hand to public/icons/<id>.png.

The style block is here rather than in the manifest so the set cannot drift icon by icon. The
camera figures are the renderer's own (src/engine/camera.ts): yaw π/4, pitch atan(1/√2).

Requires `higgsfield` on PATH (under nvm here) and an authenticated session. Each image costs
credits; the script prints the count before it starts.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlretrieve

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts" / "icons" / "manifest.json"
OUT = ROOT / "data" / "icons"
REFS = [OUT / "refs" / f for f in ("chedi.webp", "palms.webp", "pavilion.webp")]

MODEL = "nano_banana_2"

STYLE = (
    "True isometric landmark icon for a map: the camera is turned 45 degrees from north so the "
    "two visible side faces are equal, and pitched 35 degrees above the ground plane, exactly as a "
    "cube in isometric projection. One freestanding object, centred, filling most of the frame. "
    "It stands directly on a pure white background: no ground tile, no plinth, no base, no cast "
    "shadow, only a thin sliver of purple ground planting where it meets the ground. "
    "No text, no lettering, no signs with writing, no people. "
    "Material language: layered paper-cut and felt relief with fine textured surfaces, exactly like "
    "the reference images. Palette strictly: deep purple #2B184C, violet #6E4FD3, lilac #B7A7E8, "
    "warm cream #F7F4EE, with small gold #FFC72C accents. Buildings are cream with purple and gold "
    "detail; vegetation and ground are the purple family. Soft even light from the upper left. "
    "Clean silhouette, no colours outside the palette, no brick red or terracotta."
)


def prompt_for(icon: dict) -> str:
    return f"{STYLE} Subject: {icon['subject']}."


def run_one(icon: dict, rnd: str, n: int, dry: bool) -> Path | None:
    out_dir = OUT / "candidates" / icon["id"]
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = out_dir / f"{rnd}-{n}"
    prompt = prompt_for(icon)
    stem.with_suffix(".prompt.txt").write_text(prompt + "\n")
    if dry:
        print(f"[dry] {icon['id']} -> {stem}.png")
        return None
    cmd = ["higgsfield", "generate", "create", MODEL, "--prompt", prompt]
    for r in REFS:
        cmd += ["--image-references", str(r)]
    cmd += ["--aspect_ratio", "1:1", "--resolution", "2k", "--wait", "--json"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[fail] {icon['id']}: {res.stderr.strip()[:300]}", file=sys.stderr)
        return None
    try:
        data = json.loads(res.stdout)
    except json.JSONDecodeError:
        print(f"[fail] {icon['id']}: no JSON in output", file=sys.stderr)
        return None
    stem.with_suffix(".job.json").write_text(json.dumps(data, indent=2))
    url = find_result_url(data)
    if not url:
        print(f"[fail] {icon['id']}: no result_url", file=sys.stderr)
        return None
    png = stem.with_suffix(".png")
    urlretrieve(url, png)
    print(f"[ok] {icon['id']} -> {png.relative_to(ROOT)}")
    return png


def find_result_url(obj) -> str | None:
    if isinstance(obj, dict):
        if isinstance(obj.get("result_url"), str):
            return obj["result_url"]
        for v in obj.values():
            if (u := find_result_url(v)):
                return u
    elif isinstance(obj, list):
        for v in obj:
            if (u := find_result_url(v)):
                return u
    return None


def contact_sheet(icons: list[dict]) -> Path:
    from PIL import Image, ImageDraw

    cell, pad, cap = 420, 12, 40
    rows = []
    for icon in icons:
        pngs = sorted((OUT / "candidates" / icon["id"]).glob("*.png"))
        if pngs:
            rows.append((icon, pngs))
    cols = max((len(p) for _, p in rows), default=1)
    w = 260 + cols * (cell + pad)
    h = max(1, len(rows)) * (cell + cap + pad)
    sheet = Image.new("RGB", (w, h), "white")
    draw = ImageDraw.Draw(sheet)
    for r, (icon, pngs) in enumerate(rows):
        y = r * (cell + cap + pad)
        draw.text((pad, y + pad), f"{icon['id']}\n{icon['chapter']}\n{icon['label']}", fill="#1F1F1F")
        for c, png in enumerate(pngs):
            im = Image.open(png).convert("RGBA")
            im.thumbnail((cell, cell))
            bg = Image.new("RGB", (cell, cell), "white")
            bg.paste(im, ((cell - im.width) // 2, (cell - im.height) // 2), im)
            x = 260 + c * (cell + pad)
            sheet.paste(bg, (x, y))
            draw.text((x, y + cell + 4), png.stem, fill="#555B66")
    out = OUT / "contact-sheet.png"
    sheet.save(out)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", help="comma-separated hotspot ids; default all")
    ap.add_argument("--n", type=int, default=1, help="candidates per icon")
    ap.add_argument("--round", default="r1", help="label for this batch, e.g. r2")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sheet-only", action="store_true", help="just rebuild the contact sheet")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    icons = json.loads(MANIFEST.read_text())["icons"]
    if args.ids:
        want = set(args.ids.split(","))
        icons = [i for i in icons if i["id"] in want]
        missing = want - {i["id"] for i in icons}
        if missing:
            print(f"unknown ids: {sorted(missing)}", file=sys.stderr)
            return 2

    if not args.sheet_only:
        for r in REFS:
            if not r.exists():
                print(f"missing reference image {r}", file=sys.stderr)
                return 2
        jobs = [(i, args.round, n + 1) for i in icons for n in range(args.n)]
        print(f"{len(jobs)} images on {MODEL} (~2 credits each)")
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            list(ex.map(lambda j: run_one(j[0], j[1], j[2], args.dry_run), jobs))

    if not args.dry_run:
        print(f"contact sheet: {contact_sheet(json.loads(MANIFEST.read_text())['icons']).relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
