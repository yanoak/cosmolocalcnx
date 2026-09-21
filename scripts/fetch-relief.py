#!/usr/bin/env python3
"""
Distil the Copernicus 30 m DEM around a scene into a committed relief backdrop.

    npm run fetch:relief
    npm run fetch:relief -- --half-km 24 --grid 256

Writes `src/scenes/<scene>.relief.png` and `.relief.json`, both committed, both
byte-identical on a re-run — the same contract as build-region.py. The raw DEM
window under data/relief-cache/ is gitignored.

THIS IS NOT TERRAIN, and the distinction is the whole point. `terrain` stays null
in the scene document and `validateScene` keeps asserting it: no building, road or
water polygon ever sits on a sampled surface. What this writes is the land AROUND
the scene — the plain the diorama sits on and the mountains beyond it — rendered
by `src/engine/Relief.tsx` as a mesh that is flattened under the scene rectangle
at draw time. See "Relief is a backdrop, terrain stays null" in
docs/architecture.md and plans/2026-09-19_relief-backdrop.plan.md.

Source: Copernicus DEM GLO-30, the 1 arc-second DSM, as cloud-optimised GeoTIFFs in
the public `copernicus-dem-30m` bucket on AWS. Read as HTTP-range windows with
rasterio (same reasoning as fetch-buildings.py: the tiles are 3600² and range reads
are what GDAL is for). Heights are metres above the EGM2008 geoid; the sidecar
carries the plain's median as `base` so the renderer can put it at y = 0.

Licence: free to use, reproduce and redistribute, with the notice below. It is the
one line the README and the footer must carry verbatim:

    © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided
    under COPERNICUS by the European Union and ESA; all rights reserved.

    python3 -m pip install rasterio numpy
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent

BUCKET = "https://copernicus-dem-30m.s3.amazonaws.com"
DATASET = "Copernicus DEM GLO-30 (2021 release), 1 arc-second DSM, EGM2008"
ATTRIBUTION = (
    "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided "
    "under COPERNICUS by the European Union and ESA; all rights reserved"
)

# The box, in kilometres each way from the scene origin, and the grid it is
# distilled to. 24 km reaches Doi Pui to the west and the Doi Saket hills to the
# north-east; 256 cells of 187.5 m is a finer mesh than any zoom this is seen at
# needs, and 130k triangles is nothing on the installation surfaces.
DEFAULT_HALF_KM = 24.0
DEFAULT_GRID = 256

# Matches src/engine/project.ts exactly — the mesh has to land on the same metres
# the buildings use, so the projection is copied rather than approximated.
EARTH_R = 6_378_137.0


def tile_name(lat: int, lon: int) -> str:
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM"


def local_to_latlon(x: float, y: float, origin: tuple[float, float]) -> tuple[float, float]:
    lat0, lon0 = origin
    d = math.pi / 180
    return lat0 + y / (d * EARTH_R), lon0 + x / (d * EARTH_R * math.cos(lat0 * d))


def fetch_window(origin, half_km: float, cache: Path, refresh: bool) -> Path:
    """The DEM under the box, merged across tiles, at native resolution."""
    if cache.exists() and not refresh:
        print(f"  dem       {cache.relative_to(REPO)} (cached)")
        return cache

    import rasterio
    from rasterio.merge import merge
    from rasterio.windows import from_bounds
    from rasterio.windows import transform as window_transform

    m = half_km * 1000
    south, west = local_to_latlon(-m, -m, origin)
    north, east = local_to_latlon(m, m, origin)

    parts = []
    cache.parent.mkdir(parents=True, exist_ok=True)
    for lat in range(math.floor(south), math.floor(north) + 1):
        for lon in range(math.floor(west), math.floor(east) + 1):
            name = tile_name(lat, lon)
            url = f"{BUCKET}/{name}/{name}.tif"
            with rasterio.open(url) as ds:
                b = ds.bounds
                w, s, e, n = max(west, b.left), max(south, b.bottom), min(east, b.right), min(north, b.top)
                if w >= e or s >= n:
                    continue
                win = from_bounds(w, s, e, n, ds.transform)
                arr = ds.read(1, window=win)
                profile = ds.profile.copy()
                profile.update(
                    driver="GTiff", width=arr.shape[1], height=arr.shape[0],
                    transform=window_transform(win, ds.transform), compress="deflate", tiled=False,
                )
                for k in ("blockxsize", "blockysize"):
                    profile.pop(k, None)
                part = cache.with_name(f"{cache.stem}.{name}.tif")
                with rasterio.open(part, "w", **profile) as out:
                    out.write(arr, 1)
                parts.append(part)
                print(f"  dem       {name}  {arr.shape[1]}×{arr.shape[0]} px")

    datasets = [rasterio.open(p) for p in parts]
    mosaic, tfm = merge(datasets)
    profile = datasets[0].profile.copy()
    profile.update(width=mosaic.shape[2], height=mosaic.shape[1], transform=tfm)
    for ds in datasets:
        ds.close()
    with rasterio.open(cache, "w", **profile) as out:
        out.write(mosaic)
        out.update_tags(source=DATASET, attribution=ATTRIBUTION)
    for p in parts:
        p.unlink()
    return cache


def distil(dem: Path, origin, half_km: float, grid: int) -> tuple[np.ndarray, np.ndarray]:
    """Block-mean the DEM onto a grid of local-metre cells. Returns (heights, counts)."""
    import rasterio

    with rasterio.open(dem) as ds:
        z = ds.read(1).astype(np.float64)
        nodata = ds.nodata
        tfm = ds.transform
        rows, cols = np.indices(z.shape)
        lon = tfm.c + (cols + 0.5) * tfm.a
        lat = tfm.f + (rows + 0.5) * tfm.e

    lat0, lon0 = origin
    d = math.pi / 180
    x = (lon - lon0) * d * EARTH_R * math.cos(lat0 * d)
    y = (lat - lat0) * d * EARTH_R

    m = half_km * 1000
    cell = 2 * m / grid
    # Row 0 is the NORTH edge, as in a PNG and as in the region field.
    j = np.floor((x + m) / cell).astype(np.int64)
    i = np.floor((m - y) / cell).astype(np.int64)
    ok = (j >= 0) & (j < grid) & (i >= 0) & (i < grid) & np.isfinite(z)
    if nodata is not None:
        ok &= z != nodata

    flat = (i[ok] * grid + j[ok])
    sums = np.bincount(flat, weights=z[ok], minlength=grid * grid)
    counts = np.bincount(flat, minlength=grid * grid)
    heights = np.where(counts > 0, sums / np.maximum(counts, 1), np.nan).reshape(grid, grid)
    return heights, counts.reshape(grid, grid)


def base_level(heights: np.ndarray, scene_ring_m, half_km: float, grid: int) -> float:
    """Median height of cells whose centre lies inside the scene boundary."""
    m = half_km * 1000
    cell = 2 * m / grid
    xs = -m + (np.arange(grid) + 0.5) * cell
    ys = m - (np.arange(grid) + 0.5) * cell
    inside = []
    ring = scene_ring_m
    for i, y in enumerate(ys):
        for j, x in enumerate(xs):
            if _point_in_ring(x, y, ring) and np.isfinite(heights[i, j]):
                inside.append(heights[i, j])
    return float(np.median(inside)) if inside else float(np.nanmedian(heights))


def _point_in_ring(x, y, ring) -> bool:
    inside = False
    n = len(ring)
    for a in range(n):
        x1, y1 = ring[a]
        x2, y2 = ring[(a + 1) % n]
        if (y1 > y) != (y2 > y):
            t = (y - y1) / (y2 - y1)
            if x < x1 + t * (x2 - x1):
                inside = not inside
    return inside


def write_png(path: Path, rgb: np.ndarray) -> None:
    """By hand, as build-region.py does: an image library's bytes drift between versions."""
    height, width, channels = rgb.shape
    assert channels == 3
    raw = bytearray()
    for row in range(height):
        raw.append(0)
        raw.extend(rgb[row].tobytes())

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scene", default="src/scenes/wat-ket.json")
    parser.add_argument("--half-km", type=float, default=DEFAULT_HALF_KM)
    parser.add_argument("--grid", type=int, default=DEFAULT_GRID)
    parser.add_argument("--refresh", action="store_true")
    # The city view keeps its own close relief backdrop while the VALLEY view needs a
    # far wider, coarser field. Two fields, two names, one generator — added
    # 21 Sep 2026 with the three-view split. See plans/2026-09-21_three-views.plan.md.
    parser.add_argument("--field", default="relief",
                        help="output suffix: writes <scene>.<field>.png/.json")
    args = parser.parse_args()

    scene_path = REPO / args.scene
    scene = json.loads(scene_path.read_text())
    origin = (float(scene["origin"][0]), float(scene["origin"][1]))
    name = scene_path.stem
    cache = REPO / "data" / "relief-cache" / f"{name}.copernicus-glo30.tif"
    png_path = scene_path.with_name(f"{name}.{args.field}.png")
    meta_path = scene_path.with_name(f"{name}.{args.field}.json")

    print(f"{name} relief")
    print(f"  box       ±{args.half_km:g} km about {origin[0]}, {origin[1]}; grid {args.grid} ({2000 * args.half_km / args.grid:.1f} m cells)")

    dem = fetch_window(origin, args.half_km, cache, args.refresh)
    heights, counts = distil(dem, origin, args.half_km, args.grid)

    # The scene boundary in local metres, for the base level.
    lat0, lon0 = origin
    d = math.pi / 180
    ring = [
        ((lon - lon0) * d * EARTH_R * math.cos(lat0 * d), (lat - lat0) * d * EARTH_R)
        for lon, lat in scene["boundary"]["coordinates"][0]
    ]
    base = base_level(heights, ring, args.half_km, args.grid)

    filled = np.where(np.isfinite(heights), heights, base)
    lo, hi = float(np.floor(filled.min())), float(np.ceil(filled.max()))
    code = np.round((filled - lo) / max(1e-9, hi - lo) * 65535).astype(np.uint16)
    rgb = np.zeros((args.grid, args.grid, 3), dtype=np.uint8)
    rgb[..., 0] = code >> 8
    rgb[..., 1] = code & 0xFF

    m = args.half_km * 1000
    meta = {
        "_comment": (
            "Relief backdrop: the land AROUND the scene, NOT terrain under it. `terrain` stays null "
            "in the scene document and nothing in the baseline sits on this surface. The renderer "
            "flattens it under the scene rectangle. See docs/architecture.md."
        ),
        "encoding": {"channels": "r*256+g", "min": lo, "max": hi, "units": "metres above EGM2008"},
        "grid": {"size": args.grid, "cellM": 2 * m / args.grid, "bboxM": [-m, -m, m, m], "rowZeroIs": "north"},
        "base": round(base, 1),
        "stats": {
            "min": lo, "max": hi,
            "cellsWithData": int((counts > 0).sum()),
            "reliefAboveBase": round(hi - base, 1),
        },
        "source": {"dataset": DATASET, "attribution": ATTRIBUTION, "url": BUCKET},
    }

    png_bytes_before = png_path.read_bytes() if png_path.exists() else None
    write_png(png_path, rgb)
    meta_text = json.dumps(meta, indent=2, sort_keys=True) + "\n"
    meta_before = meta_path.read_text() if meta_path.exists() else None
    meta_path.write_text(meta_text)

    same = png_bytes_before == png_path.read_bytes() and meta_before == meta_text
    print(f"  heights   {lo:.0f}–{hi:.0f} m; plain (base) {base:.1f} m; relief above base {hi - base:.0f} m")
    print(f"  wrote     {png_path.relative_to(REPO)} ({png_path.stat().st_size / 1024:.0f} KB), {meta_path.relative_to(REPO)}"
          f"{' — byte-identical to the previous run' if same else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
