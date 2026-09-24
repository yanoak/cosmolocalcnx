#!/usr/bin/env python3
"""Promote chosen icon candidates to committed assets.

    scripts/keep-icons.py [--size 1024] [--ids kae,wat-umong]

Reads scripts/icons/keepers.json (hotspot id -> candidate stem under data/icons/candidates/<id>/),
keys out the white studio background by flood-filling from the corners, trims to the object,
downscales to --size on the long edge, and writes public/icons/<id>.webp with alpha. A sidecar,
src/content/icons.json, records each sprite's size and its ground anchor — the bottom-centre of
the trimmed image, which is where the isometric base meets the map — so the renderer never has
to guess. Re-running on the same candidates is byte-identical, like every other generator here.

The flood fill is from the border, so cream walls inside the object survive: only white that is
connected to the edge of the frame is removed. A one-pixel feather softens the cut edge.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts" / "icons" / "manifest.json"
KEEPERS = ROOT / "scripts" / "icons" / "keepers.json"
CANDIDATES = ROOT / "data" / "icons" / "candidates"
OUT = ROOT / "public" / "icons"
SIDECAR = ROOT / "src" / "content" / "icons.json"

# Pixels at least this close to white (per channel) may be background.
WHITE_TOL = 18
PAD = 8


def _fill_runs(mask: np.ndarray, near_white: np.ndarray) -> np.ndarray:
    """Along each row, every near-white run that already holds a masked pixel becomes fully
    masked — for the whole frame in one vectorised step. Runs are labelled by a cumulative
    count of run starts over the flattened array (a row boundary always starts a new run), and
    reduceat takes the max of the mask per run."""
    nw = np.ascontiguousarray(near_white)
    m = np.ascontiguousarray(mask)
    prev = np.zeros_like(nw)
    prev[:, 1:] = nw[:, :-1]
    start = nw & ~prev
    flat_start = start.ravel()
    starts = np.flatnonzero(flat_start)
    if starts.size == 0:
        return m
    hit = np.maximum.reduceat(m.ravel().astype(np.uint8), starts)
    run_id = np.cumsum(flat_start) - 1
    filled = nw.ravel() & (hit[np.clip(run_id, 0, None)] > 0)
    return filled.reshape(nw.shape)


def background_mask(rgb: np.ndarray) -> np.ndarray:
    """True where a pixel is near-white AND connected to the frame border (4-connected)."""
    near_white = (rgb >= 255 - WHITE_TOL).all(axis=2)
    mask = np.zeros_like(near_white)
    mask[0, :] = near_white[0, :]
    mask[-1, :] = near_white[-1, :]
    mask[:, 0] = near_white[:, 0]
    mask[:, -1] = near_white[:, -1]
    # Alternate row fills and column fills until nothing grows. Each pass floods whole runs,
    # so a frame converges in a handful of passes rather than thousands.
    while True:
        grown = _fill_runs(mask, near_white)
        grown = _fill_runs(grown.T, near_white.T).T
        if np.array_equal(grown, mask):
            return mask
        mask = grown


def cut_out(png: Path) -> Image.Image:
    im = Image.open(png).convert("RGB")
    rgb = np.asarray(im)
    bg = background_mask(rgb)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # Feather: pixels on the object side of the cut take an alpha from how white they are,
    # so anti-aliased edges do not carry a white fringe.
    a = Image.fromarray(alpha, "L").filter(ImageFilter.MinFilter(3))
    a_soft = a.filter(ImageFilter.GaussianBlur(0.7))
    out = im.convert("RGBA")
    out.putalpha(Image.fromarray(np.minimum(np.asarray(a_soft), np.where(bg, 0, 255)).astype(np.uint8), "L"))
    return out


def promote(icon: dict, stem: str, size: int) -> dict:
    src = CANDIDATES / icon["id"] / f"{stem}.png"
    if not src.exists():
        raise FileNotFoundError(src)
    im = cut_out(src)
    bbox = im.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"{src}: nothing left after keying")
    l, t, r, b = bbox
    im = im.crop((max(0, l - PAD), max(0, t - PAD), min(im.width, r + PAD), min(im.height, b + PAD)))
    scale = size / max(im.width, im.height)
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    dst = OUT / f"{icon['id']}.webp"
    im.save(dst, "WEBP", quality=88, method=4, exact=False)
    return {
        "id": icon["id"],
        "chapter": icon["chapter"],
        "file": f"/icons/{dst.name}",
        "width": im.width,
        "height": im.height,
        # Ground anchor as a fraction of the image: bottom-centre, where the base meets the map.
        "anchor": [0.5, 1.0],
        "source": f"{stem}",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--ids")
    args = ap.parse_args()
    icons = json.loads(MANIFEST.read_text())["icons"]
    keep = json.loads(KEEPERS.read_text())["keep"]
    want = set(args.ids.split(",")) if args.ids else {i["id"] for i in icons}
    sidecar_path = SIDECAR
    existing = {e["id"]: e for e in json.loads(sidecar_path.read_text())["icons"]} if sidecar_path.exists() else {}
    for icon in icons:
        if icon["id"] not in want:
            continue
        stem = keep.get(icon["id"])
        if not stem:
            print(f"[skip] {icon['id']}: no keeper chosen", file=sys.stderr)
            continue
        existing[icon["id"]] = promote(icon, stem, args.size)
        e = existing[icon["id"]]
        size_kb = (OUT / Path(e['file']).name).stat().st_size // 1024
        print(f"[ok] {e['id']} {e['width']}x{e['height']} {size_kb} KB")
    ordered = [existing[i["id"]] for i in icons if i["id"] in existing]
    sidecar_path.write_text(json.dumps({
        "_about": "Written by scripts/keep-icons.py. anchor is the ground point as a fraction of width and height.",
        "size": args.size,
        "icons": ordered,
    }, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
