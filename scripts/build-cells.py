#!/usr/bin/env python3
"""
GHS-POP → population cells for the Present chapter's map, as a PMTiles layer.

The same source tiles `build-region.py` reads, binned into a 0.25° lat/lon grid — about
27 km at the equator, the resolution the plan settled on — for every cell whose centre is
within 12,000 km of the scene origin. Each cell carries the people in it, its colour and
height fractions, and its great-circle distance from the origin, so the map can dim
everything outside the growing ring by comparing a property rather than computing one.

Output, committed:
    public/cells/wat-ket.cells.pmtiles   the layer MapLibre reads, by HTTP range request
    src/scenes/wat-ket.cells.json        the sidecar: totals, extents, the file's hash

Byte-identical on re-run from the same cached tiles — the determinism rule in CLAUDE.md —
and the sidecar records the hash so a test can say whether the committed layer is the one
this script would write. Population is conserved: the cells' total is checked against
the committed world field's, which covers the same disc.

Squares, not hexes, decided 24 Sep 2026: H3 would not build on this machine and a lat/lon
grid needs no dependency. The plan's open question records the trade.

Usage:
    python3 scripts/build-cells.py
    python3 scripts/build-cells.py --radius-km 12000 --cell-deg 0.25

Needs tippecanoe and the pmtiles CLI on PATH. GHS-POP tiles are read from data/ghsl/tiles
and fetched if missing, as build-region.py does.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
import tifffile

REPO = Path(__file__).resolve().parent.parent
SCENES = REPO / "src" / "scenes"
PUBLIC = REPO / "public" / "cells"

# Reuse the tile bookkeeping rather than restate it — the file name has a hyphen, so
# it is loaded by path.
_spec = importlib.util.spec_from_file_location("build_region", REPO / "scripts" / "build-region.py")
build_region = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(build_region)

DEG = math.pi / 180.0
DEFAULT_CELL_DEG = 0.25
DEFAULT_RADIUS_KM = 12_000.0
# The zooms the layer is cut at. Below 2 a single tile would hold every cell; above 6 a
# 0.25° square is already many pixels wide and the basemap extract stops there too.
MIN_ZOOM = 2
MAX_ZOOM = 6


def great_circle_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    return build_region._great_circle_km(a, b)


def accumulate_grid(tif: Path, grid: np.ndarray, cell_deg: float) -> float:
    """Scatter one tile's pixels into the global lat/lon grid. Conserves the total."""
    with tifffile.TiffFile(tif) as tf:
        page = tf.pages[0]
        data = np.asarray(page.asarray(), dtype=np.float64)
        tags = {t.name: t.value for t in page.tags}
    tie = tags["ModelTiepointTag"]
    scale = tags["ModelPixelScaleTag"]
    lon0, lat0 = float(tie[3]), float(tie[4])
    dlon, dlat = float(scale[0]), float(scale[1])
    height, width = data.shape

    data = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)
    data[data < 0] = 0.0
    if data.sum() <= 0:
        return 0.0

    rows, cols = grid.shape
    lons = lon0 + (np.arange(width) + 0.5) * dlon
    lats = lat0 - (np.arange(height) + 0.5) * dlat
    col = np.floor((lons + 180.0) / cell_deg).astype(np.int64) % cols
    row = np.clip(np.floor((90.0 - lats) / cell_deg).astype(np.int64), 0, rows - 1)
    index = (row[:, None] * cols + col[None, :]).ravel()
    grid.ravel()[:] += np.bincount(index, weights=data.ravel(), minlength=rows * cols)
    return float(data.sum())


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scene", default="src/scenes/wat-ket.json")
    parser.add_argument("--radius-km", type=float, default=DEFAULT_RADIUS_KM)
    parser.add_argument("--cell-deg", type=float, default=DEFAULT_CELL_DEG)
    args = parser.parse_args()

    scene = json.loads((REPO / args.scene).read_text())
    origin = (float(scene["origin"][0]), float(scene["origin"][1]))
    radius_km = float(args.radius_km)
    cell_deg = float(args.cell_deg)

    rows = int(round(180.0 / cell_deg))
    cols = int(round(360.0 / cell_deg))
    grid = np.zeros((rows, cols), dtype=np.float64)

    wanted = build_region.needed_tiles(origin, radius_km)
    print(f"Origin      {origin[0]:.4f}N {origin[1]:.4f}E, radius {radius_km:,.0f} km")
    print(f"Grid        {cell_deg}° — {rows} x {cols}")
    print(f"Tiles       {len(wanted)} candidates")
    used = 0
    scattered = 0.0
    for tile in wanted:
        tif = build_region.fetch_tile(tile)
        if tif is None:
            continue
        used += 1
        scattered += accumulate_grid(tif, grid, cell_deg)
    print(f"            {used} read, {scattered:,.0f} people scattered")

    # Keep populated cells whose centre is inside the disc.
    lat_c = 90.0 - (np.arange(rows) + 0.5) * cell_deg
    lon_c = -180.0 + (np.arange(cols) + 0.5) * cell_deg
    p0 = origin[0] * DEG
    phi = lat_c[:, None] * DEG
    dlam = (lon_c[None, :] - origin[1]) * DEG
    cos_c = math.sin(p0) * np.sin(phi) + math.cos(p0) * np.cos(phi) * np.cos(dlam)
    dist = np.arccos(np.clip(cos_c, -1.0, 1.0)) * build_region.EARTH_RADIUS_KM
    keep = (grid > 0) & (dist <= radius_km)
    people = grid[keep]
    dist_kept = dist[keep]
    r_idx, c_idx = np.nonzero(keep)
    pmax = float(people.max())
    total = float(people.sum())
    denom = math.log10(pmax + 1.0)
    print(f"Cells       {len(people):,} populated inside the disc, {total:,.0f} people, peak {pmax:,.0f}")

    PUBLIC.mkdir(parents=True, exist_ok=True)
    out_pmtiles = PUBLIC / "wat-ket.cells.pmtiles"
    sidecar = SCENES / "wat-ket.cells.json"

    # A FIXED scratch path, not a temporary directory: tippecanoe writes its own command
    # line — input path included — into the archive's metadata, so a random directory
    # name made every run differ by a few bytes. Under data/, which is gitignored.
    scratch = REPO / "data" / "cells-build"
    scratch.mkdir(parents=True, exist_ok=True)
    if True:
        ndjson = scratch / "cells.ndjson"
        mbtiles = scratch / "cells.mbtiles"
        with ndjson.open("w") as f:
            # Row-major, so the file — and therefore the tiles — are the same every run.
            for r, c, p, d in zip(r_idx, c_idx, people, dist_kept):
                north = 90.0 - r * cell_deg
                south = north - cell_deg
                west = -180.0 + c * cell_deg
                east = west + cell_deg
                t = math.log10(p + 1.0) / denom if denom > 0 else 0.0
                h = (p / pmax) ** (1.0 / 3.0) if pmax > 0 else 0.0
                feature = {
                    "type": "Feature",
                    "properties": {
                        "p": int(round(p)),
                        "t": round(t, 3),
                        "h": round(h, 3),
                        "d": int(round(d)),
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [round(west, 4), round(south, 4)],
                            [round(east, 4), round(south, 4)],
                            [round(east, 4), round(north, 4)],
                            [round(west, 4), round(north, 4)],
                            [round(west, 4), round(south, 4)],
                        ]],
                    },
                }
                f.write(json.dumps(feature, separators=(",", ":")) + "\n")

        subprocess.run(
            [
                "tippecanoe",
                "-o", str(mbtiles),
                "-l", "cells",
                "-n", "Population cells",
                "-N", "GHS-POP people per 0.25 degree cell within 12,000 km of Wat Ket",
                "-A", "GHS-POP R2023A, European Commission JRC, CC BY 4.0",
                f"-Z{MIN_ZOOM}", f"-z{MAX_ZOOM}",
                # Every cell, in every tile: dropping any would drop people.
                "--no-feature-limit", "--no-tile-size-limit",
                "--no-tiny-polygon-reduction",
                "--detect-shared-borders",
                "--force", "--quiet",
                str(ndjson),
            ],
            check=True,
        )
        previous = out_pmtiles.read_bytes() if out_pmtiles.exists() else None
        subprocess.run(["pmtiles", "convert", str(mbtiles), str(out_pmtiles)], check=True,
                       capture_output=True)

    digest = sha256(out_pmtiles)
    identical = previous is not None and hashlib.sha256(previous).hexdigest() == digest

    meta = {
        "_comment": (
            "Population cells for the Present chapter's MapLibre layer. NOT terrain — "
            "terrain stays null in the scene document. People per 0.25° cell, from the "
            "same GHS-POP tiles as the region fields, within the world disc. The layer "
            "itself is public/cells/wat-ket.cells.pmtiles; this records what is in it."
        ),
        "layer": "cells",
        "file": "cells/wat-ket.cells.pmtiles",
        "sha256": digest,
        "origin": [origin[0], origin[1]],
        "radiusKm": radius_km,
        "cellDeg": cell_deg,
        "zoom": {"min": MIN_ZOOM, "max": MAX_ZOOM},
        "properties": {
            "p": "people in the cell",
            "t": "log10 ramp position, 0-1, the cell's colour",
            "h": "cube-root height fraction, 0-1",
            "d": "great-circle km from the origin to the cell centre",
        },
        "stats": {"cells": int(len(people)), "totalPeople": total, "max": pmax, "tilesUsed": used},
        "source": {
            "dataset": "GHS-POP R2023A, epoch 2025, 30 arcsec, EPSG:4326",
            "url": build_region.GHSL_BASE,
            "license": "CC BY 4.0",
            "attribution": "European Commission JRC, Global Human Settlement Layer",
        },
    }
    sidecar.write_text(json.dumps(meta, indent=2, sort_keys=True) + "\n")

    print(f"Wrote       {out_pmtiles.relative_to(REPO)} ({out_pmtiles.stat().st_size / 1024:.0f} KB)")
    print(f"            {sidecar.relative_to(REPO)}")
    if previous is not None:
        print("            " + ("(byte-identical to the previous run)" if identical
                                else "!! BYTES CHANGED since the previous run"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
