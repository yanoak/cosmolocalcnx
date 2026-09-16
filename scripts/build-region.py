#!/usr/bin/env python3
"""
Distil a global population raster into one committed height field for the REGION register.

    npm run build:region
    npm run build:region -- --centre 21.00,100.29 --radius-km 3437

Run once per circle. The output — a 512x512 PNG and a JSON sidecar — is committed;
the ~250 MB of GHS-POP tiles it reads are not. A re-run against the same tiles must
produce a BYTE-IDENTICAL pair, the same invariant `npm run fetch:osm` carries.

THIS IS NOT TERRAIN. `terrain` stays null in the scene document, permanently, and
`validateScene` keeps asserting it — see "Skip elevation entirely" in
docs/architecture.md. What this writes is people per cell, in a different coordinate
frame, and the renderer reads it on purpose. The resemblance to a heightmap is
exactly how elevation would creep back in, so the distinction is laboured here and
in the sidecar rather than left to be inferred.

Needs `numpy` and `tifffile`. Deliberately NOT rasterio or GDAL: the tiles are small
enough to read whole, their georeferencing is four numbers in a TIFF tag, and
`scripts/extract-boundary.py` already set the precedent that a system dependency
which breaks is worse than a little arithmetic. The PNG is written by hand for the
same reason — and because an image library's output varies by version, which would
quietly destroy byte-identity.

    python3 -m pip install numpy tifffile imagecodecs

Source: GHS-POP R2023A, epoch 2025, 30 arcsec, EPSG:4326. European Commission JRC,
Global Human Settlement Layer. Licensed CC BY 4.0 — see the licensing table in
README.md. This is the same product family the printed A0 in the exhibition uses,
which is not a coincidence: the screen and the wall have to agree.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
import urllib.request
import zipfile
import zlib
from pathlib import Path

import numpy as np
import tifffile

REPO = Path(__file__).resolve().parent.parent
TILE_DIR = REPO / "data" / "ghsl" / "tiles"
CITY_DIR = REPO / "data" / "geonames"
OUT_DIR = REPO / "src" / "scenes" / "regions"

# ---------------------------------------------------------------------------
# The circle.
#
# The default centre is the scene's own origin, so ANY neighbourhood gets a
# credible region register from `npm run fetch:osm && npm run build:region`. Wat Ket
# overrides it, because the Valeriepieris circle is an authored geographic claim
# rather than something derivable from where the diorama happens to be. Same shape
# as DEFAULT_EXTENT in fetch-osm.ts: derivable by default, authored where it matters.
# ---------------------------------------------------------------------------

VALERIEPIERIS_CENTRE = (21.00, 100.29)
VALERIEPIERIS_RADIUS_KM = 3437.0

# Mirrors src/engine/aeqd.ts exactly — the MEAN radius, not project.ts's equatorial
# one. See the header of that file for why the codebase carries two.
EARTH_RADIUS_KM = 6371.0088
DEG = math.pi / 180.0

# ---------------------------------------------------------------------------
# Output grid.
#
# 512 gives 13.4 km cells. Chosen because it is finer than anything the renderer
# will ever draw and because 256 and 128 are exact integer block-sums off it —
# population is additive, so block-summing is lossless. That makes cell size a
# RUNTIME decision forever: December's extruded columns never need these tiles
# again, and neither does a change of mind about how coarse the mountains should be.
# ---------------------------------------------------------------------------

DEFAULT_GRID = 512

# Store the cube root rather than the count. Population spans six orders of
# magnitude per cell; linear 16-bit quantisation erases genuinely inhabited
# Himalayan and Pacific cells to zero, which in a piece about where people are is a
# legibility loss rather than a rounding error.
STORAGE_GAMMA = 3.0

# ---------------------------------------------------------------------------
# Cities.
#
# The poster labels the handful of cities sitting on the circle's rim, which is its
# argument in miniature: Karachi, Changchun, Surabaya and Fukuoka are all ~3,430 km
# out. The app can be more expansive, so this ships every city over the threshold
# inside the circle and lets the viewer decide which to label and which to reveal on
# demand.
#
# 100,000 gives ~2,220 cities inside the circle at ~120 KB, which is enough that
# almost every bright cell in the field has a name attached. Lowering it to 50,000
# nearly doubles the file for places that are not legible at 13 km per cell anyway.
#
# ENGLISH NAMES ONLY for now. GeoNames ships localised names in a separate 200 MB
# dump; for a bilingual piece the Thai names matter, but the always-on labels are a
# dozen cities and hand-authoring those beats a second large download. Revisit if
# the label set grows.
# ---------------------------------------------------------------------------

GEONAMES_URL = "https://download.geonames.org/export/dump/cities15000.zip"
GEONAMES_FILE = "cities15000.txt"
MIN_POPULATION = 100_000

GHSL_BASE = (
    "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/"
    "GHS_POP_E2025_GLOBE_R2023A_4326_30ss/V1-0/tiles"
)
GHSL_TILE = "GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0_{tile}"

# The 4326 tile grid is regular 10x10 degree, but offset from round degrees — so a
# tile's extent cannot be guessed from its name alone. These constants only pick
# WHICH tiles to fetch; the extent actually used is read from each tile's own
# ModelTiepoint tag, so a change upstream shows up as a wrong answer here rather
# than a silently misplaced continent.
TILE_LON0_C28 = 89.992083
TILE_LAT0_R7 = 29.099583
TILE_SPAN_DEG = 10.0


def tile_bounds(row: int, col: int) -> tuple[float, float]:
    """Nominal upper-left lon/lat of a tile, for choosing what to download."""
    return (
        TILE_LON0_C28 + (col - 28) * TILE_SPAN_DEG,
        TILE_LAT0_R7 + (7 - row) * TILE_SPAN_DEG,
    )


def circle_envelope(centre: tuple[float, float], radius_km: float):
    """
    The lat/lon box a spherical cap of this radius needs.

    Longitude is not radius/(111 km * cos(lat_centre)): the cap is widest away from
    its own centre latitude, and using the centre's cosine clips the east and west
    edges off the circle. The spherical formula below is the actual maximum.
    """
    lat_c, lon_c = centre
    ang = radius_km / EARTH_RADIUS_KM

    lat_min = max(-90.0, (lat_c * DEG - ang) / DEG)
    lat_max = min(90.0, (lat_c * DEG + ang) / DEG)

    # A cap of a quarter-circumference or more reaches a pole, and past a pole every
    # longitude is inside it. Falling through to the formula below would be wrong in
    # the worst way: sin(ang) heads back toward ZERO as the cap approaches the whole
    # globe, so a world-sized radius would report a narrow strip and fetch almost no
    # tiles. Caught by build-region's own totals — half a world of people went
    # missing — but it would have looked like a plausible map.
    if ang >= math.pi / 2 or lat_max >= 90.0 or lat_min <= -90.0:
        return lat_min, lat_max, -180.0, 180.0

    denom = math.cos(lat_c * DEG)
    if denom <= 0 or math.sin(ang) / denom >= 1:
        return lat_min, lat_max, -180.0, 180.0

    dlon = math.asin(math.sin(ang) / denom) / DEG
    return lat_min, lat_max, lon_c - dlon, lon_c + dlon


def needed_tiles(centre, radius_km) -> list[str]:
    lat_min, lat_max, lon_min, lon_max = circle_envelope(centre, radius_km)
    tiles = []
    for row in range(1, 19):
        for col in range(1, 37):
            lon0, lat0 = tile_bounds(row, col)
            if lon0 + TILE_SPAN_DEG < lon_min or lon0 > lon_max:
                continue
            if lat0 < lat_min or lat0 - TILE_SPAN_DEG > lat_max:
                continue
            tiles.append(f"R{row}_C{col}")
    return tiles


def fetch_tile(tile: str) -> Path | None:
    """
    Download and unpack one tile if it is not already here.

    Ocean-only tiles are simply absent upstream, and a 404 is the normal way to
    discover that — so it is not an error, it is the answer.
    """
    tif = TILE_DIR / f"{GHSL_TILE.format(tile=tile)}.tif"
    if tif.exists():
        return tif

    url = f"{GHSL_BASE}/{GHSL_TILE.format(tile=tile)}.zip"
    archive = TILE_DIR / f"{tile}.zip"
    try:
        with urllib.request.urlopen(url, timeout=180) as response:
            archive.write_bytes(response.read())
    except Exception as exc:  # noqa: BLE001 - a 404 here is data, not a failure
        if "404" in str(exc):
            return None
        print(f"  ! {tile}: {exc}", file=sys.stderr)
        return None

    with zipfile.ZipFile(archive) as zf:
        for name in zf.namelist():
            if name.endswith(".tif"):
                tif.write_bytes(zf.read(name))
    archive.unlink()
    return tif if tif.exists() else None


def accumulate(tif: Path, centre, radius_km, acc: np.ndarray, grid: int) -> float:
    """
    Scatter one tile's population into the output grid.

    FORWARD, not inverse. Every source pixel is projected to its output cell and
    added, rather than each output cell sampling the source — because population is
    a COUNT, not a density. Sampling would drop whatever fell between samples and
    silently lose tens of millions of people; scattering conserves the total
    exactly, which is the property the tests pin.
    """
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

    # Pixel CENTRES, not corners.
    lons = lon0 + (np.arange(width) + 0.5) * dlon
    lats = lat0 - (np.arange(height) + 0.5) * dlat

    lat_c, lon_c = centre
    p0 = lat_c * DEG
    phi = lats[:, None] * DEG
    dlam = (lons[None, :] - lon_c) * DEG

    sin_phi = np.sin(phi)
    cos_phi = np.cos(phi)

    # Great-circle distance and bearing from the centre — aeqd.ts, vectorised.
    cos_c = np.sin(p0) * sin_phi + np.cos(p0) * cos_phi * np.cos(dlam)
    ang = np.arccos(np.clip(cos_c, -1.0, 1.0))
    dist = ang * EARTH_RADIUS_KM

    y = np.sin(dlam) * cos_phi
    x = np.cos(p0) * sin_phi - np.sin(p0) * cos_phi * np.cos(dlam)
    theta = np.arctan2(y, x)

    east = dist * np.sin(theta)
    north = dist * np.cos(theta)

    half = radius_km
    cell = (2 * half) / grid
    col = np.floor((east + half) / cell).astype(np.int64)
    row = np.floor((half - north) / cell).astype(np.int64)

    inside = (
        (dist <= radius_km)
        & (col >= 0)
        & (col < grid)
        & (row >= 0)
        & (row < grid)
        & (data > 0)
    )
    if not inside.any():
        return 0.0

    flat = (row[inside] * grid + col[inside]).astype(np.int64)
    weights = data[inside]
    # bincount over float64 — deterministic for a fixed input order, which is what
    # the byte-identical invariant rests on.
    acc += np.bincount(flat, weights=weights, minlength=grid * grid).reshape(grid, grid)
    return float(weights.sum())


def build_cities(centre, radius_km: float, min_population: int) -> list[dict]:
    """
    Every city over the threshold inside the circle, projected onto it.

    Stores only what cannot be recomputed: name, country, population, and the AEQD
    position. Distance from the centre and which grid cell a city falls in are both
    one line of arithmetic in the viewer, and storing them would be a second source
    of truth that goes stale the moment GRID changes.
    """
    source = CITY_DIR / GEONAMES_FILE
    if not source.exists():
        print(
            f"error: {source.relative_to(REPO)} is missing. Download it first "
            f"(it is gitignored):\n\n"
            f"    mkdir -p {CITY_DIR.relative_to(REPO)} && \\\n"
            f"      curl -L -o {(CITY_DIR / 'cities15000.zip').relative_to(REPO)} "
            f"'{GEONAMES_URL}' && \\\n"
            f"      unzip -o -d {CITY_DIR.relative_to(REPO)} "
            f"{(CITY_DIR / 'cities15000.zip').relative_to(REPO)}\n",
            file=sys.stderr,
        )
        raise SystemExit(1)

    cities: list[dict] = []
    with source.open(encoding="utf-8") as handle:
        for line in handle:
            fields = line.rstrip("\n").split("\t")
            if len(fields) < 15:
                continue
            try:
                lat, lon, population = float(fields[4]), float(fields[5]), int(fields[14])
            except ValueError:
                continue
            if population < min_population:
                continue

            distance = _great_circle_km(centre, (lat, lon))
            if distance > radius_km:
                continue

            bearing = _bearing_deg(centre, (lat, lon))
            theta = bearing * DEG
            cities.append(
                {
                    "name": fields[1],
                    "country": fields[8],
                    "population": population,
                    "km": [
                        round(distance * math.sin(theta), 2),
                        round(distance * math.cos(theta), 2),
                    ],
                }
            )

    # Descending population, so the viewer can take the top N for always-on labels
    # without sorting 2,000 entries on a phone at load.
    cities.sort(key=lambda c: (-c["population"], c["name"]))
    return cities


def write_png(path: Path, rgb: np.ndarray) -> None:
    """
    A PNG writer, by hand, in about twenty lines.

    Not PIL: an image library's byte output drifts between versions, and this file's
    whole contract is that the same tiles produce the same bytes. zlib at a fixed
    level is reproducible; `PIL.Image.save` is not promised to be.
    """
    height, width, channels = rgb.shape
    assert channels == 3

    raw = bytearray()
    for row in range(height):
        raw.append(0)  # filter type 0 (None) — keeps the writer trivial
        raw.extend(rgb[row].tobytes())

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scene", default="src/scenes/wat-ket.json")
    parser.add_argument(
        "--centre",
        default=None,
        help="lat,lon of the circle. Defaults to the Valeriepieris centre.",
    )
    parser.add_argument("--radius-km", type=float, default=VALERIEPIERIS_RADIUS_KM)
    parser.add_argument("--min-population", type=int, default=MIN_POPULATION)
    parser.add_argument("--grid", type=int, default=DEFAULT_GRID)
    parser.add_argument(
        "--no-cities",
        action="store_true",
        help="Skip the city file. The world field does not need its own copy.",
    )
    args = parser.parse_args()

    scene_path = REPO / args.scene
    scene = json.loads(scene_path.read_text())
    origin = tuple(scene["origin"])

    if args.centre:
        lat, lon = (float(v) for v in args.centre.split(","))
        centre = (lat, lon)
    else:
        centre = VALERIEPIERIS_CENTRE
    radius_km = float(args.radius_km)

    from_centre = _great_circle_km(centre, origin)
    if from_centre > radius_km:
        print(
            f"error: the scene origin is {from_centre:,.0f} km from the circle centre, "
            f"outside its own {radius_km:,.0f} km circle. The handover would have "
            f"nowhere to land.",
            file=sys.stderr,
        )
        return 1

    TILE_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    wanted = needed_tiles(centre, radius_km)
    print(f"Circle      {centre[0]:.2f}N {centre[1]:.2f}E, radius {radius_km:,.0f} km")
    print(f"Scene       {scene['id']} at {origin[0]:.4f},{origin[1]:.4f}")
    print(f"            {from_centre:,.1f} km from the centre "
          f"({from_centre / radius_km * 100:.2f}% of the radius)")
    print(f"Tiles       {len(wanted)} candidates")

    grid = int(args.grid)
    acc = np.zeros((grid, grid), dtype=np.float64)
    used = 0
    total_scattered = 0.0
    for tile in wanted:
        tif = fetch_tile(tile)
        if tif is None:
            continue
        used += 1
        total_scattered += accumulate(tif, centre, radius_km, acc, grid)
        print(f"  + {tile:<10} running total {acc.sum():>16,.0f}")

    inside_total = float(acc.sum())
    populated = int((acc > 0).sum())
    pmax = float(acc.max())

    if pmax <= 0:
        print("error: no population landed in the grid.", file=sys.stderr)
        return 1

    # Encode: cube root, 16 bits split across two 8-bit channels. NOT a 16-bit PNG —
    # createImageBitmap and getImageData both hand back 8-bit clamped RGBA, so a
    # browser silently truncates the low byte and the field quantises to 256 levels.
    # That would pass a unit test in node and be wrong only in production.
    norm = np.clip(acc / pmax, 0.0, 1.0) ** (1.0 / STORAGE_GAMMA)
    value = np.rint(norm * 65535.0).astype(np.uint32)
    value[acc <= 0] = 0

    rgb = np.zeros((grid, grid, 3), dtype=np.uint8)
    rgb[:, :, 0] = (value >> 8).astype(np.uint8)
    rgb[:, :, 1] = (value & 0xFF).astype(np.uint8)
    # Blue is reserved for a land mask, so one can be added later without changing
    # the format or invalidating a decoder.

    stem = (
        f"aeqd_{centre[0]:.3f}_{centre[1]:.3f}"
        f"_r{int(round(radius_km))}_n{grid}"
    )
    png_path = OUT_DIR / f"{stem}.png"
    meta_path = OUT_DIR / f"{stem}.json"

    previous = png_path.read_bytes() if png_path.exists() else None
    write_png(png_path, rgb)
    identical = previous is not None and previous == png_path.read_bytes()

    # Cities are a property of the CIRCLE, not of the grid, so they are named
    # without the cell count — changing GRID must not orphan them.
    cities = [] if args.no_cities else build_cities(centre, radius_km, args.min_population)
    city_stem = f"aeqd_{centre[0]:.3f}_{centre[1]:.3f}_r{int(round(radius_km))}"
    city_path = OUT_DIR / f"{city_stem}.cities.json"
    city_lines = ",\n".join(
        "    " + json.dumps(c, ensure_ascii=False, sort_keys=True) for c in cities
    )
    if not args.no_cities:
        city_path.write_text(
            "{\n"
            '  "_comment": "Cities inside the circle, for the REGION register\'s labels. '
            'Positions are km east/north of the circle centre in the same azimuthal '
            'equidistant frame as the population field. Sorted by population, descending.",\n'
            f'  "minPopulation": {args.min_population},\n'
            f'  "count": {len(cities)},\n'
            '  "source": {\n'
            '    "dataset": "GeoNames cities15000",\n'
            f'    "url": "{GEONAMES_URL}",\n'
            '    "license": "CC BY 4.0",\n'
            '    "attribution": "GeoNames"\n'
            '  },\n'
            '  "cities": [\n' + city_lines + "\n  ]\n}\n",
            encoding="utf-8",
        )

    cell_km = (2 * radius_km) / grid
    meta = {
        "_comment": (
            "Population height field for the REGION register. NOT terrain — terrain "
            "stays null in the scene document, permanently. This is people per cell "
            "in an azimuthal equidistant frame. See docs/architecture.md."
        ),
        "projection": {
            "kind": "aeqd",
            "centre": [round(centre[0], 6), round(centre[1], 6)],
            "radiusKm": radius_km,
            "earthRadiusKm": EARTH_RADIUS_KM,
        },
        "grid": {
            "size": grid,
            "cellKm": round(cell_km, 6),
            "bboxKm": [-radius_km, -radius_km, radius_km, radius_km],
        },
        "encoding": {
            "channels": "r*256+g",
            "blue": "reserved for a land mask",
            "gamma": STORAGE_GAMMA,
            "max": pmax,
            "units": "people per cell",
        },
        "stats": {
            "cells": grid * grid,
            "populated": populated,
            "totalInside": inside_total,
            "tilesUsed": used,
        },
        "source": {
            "dataset": "GHS-POP R2023A, epoch 2025, 30 arcsec, EPSG:4326",
            "url": GHSL_BASE,
            "license": "CC BY 4.0",
            "attribution": "European Commission JRC, Global Human Settlement Layer",
        },
    }
    meta_path.write_text(json.dumps(meta, indent=2, sort_keys=True) + "\n")

    print()
    print(f"Grid        {grid}x{grid} at {cell_km:.2f} km per cell")
    print(f"Populated   {populated:,} cells of {grid * grid:,}")
    print(f"Inside      {inside_total:,.0f} people")
    print(f"Peak cell   {pmax:,.0f} people")
    if not args.no_cities:
        print(f"Cities      {len(cities):,} over {args.min_population:,} inside the circle")
    if cities:
        biggest = cities[0]
        rim = min(cities, key=lambda c: abs(math.hypot(*c["km"]) - radius_km))
        print(f"            largest {biggest['name']} ({biggest['population']:,})")
        print(f"            nearest the rim {rim['name']}, "
              f"{math.hypot(*rim['km']):,.0f} km out")
    print(f"Wrote       {png_path.relative_to(REPO)} "
          f"({png_path.stat().st_size / 1024:.0f} KB)")
    print(f"            {meta_path.relative_to(REPO)}")
    if not args.no_cities:
        print(f"            {city_path.relative_to(REPO)} "
              f"({city_path.stat().st_size / 1024:.0f} KB)")
    if previous is not None:
        print("            " + ("(byte-identical to the previous run)" if identical
                                else "!! BYTES CHANGED since the previous run"))
    return 0


def _bearing_deg(a, b) -> float:
    """Initial bearing from a to b, degrees clockwise from north. Mirrors aeqd.ts."""
    lat1, lon1 = a
    lat2, lon2 = b
    p1, p2 = lat1 * DEG, lat2 * DEG
    dl = (lon2 - lon1) * DEG
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.atan2(y, x) / DEG + 360) % 360


def _great_circle_km(a, b) -> float:
    lat1, lon1 = a
    lat2, lon2 = b
    p1, p2 = lat1 * DEG, lat2 * DEG
    dp = (lat2 - lat1) * DEG
    dl = (lon2 - lon1) * DEG
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


if __name__ == "__main__":
    sys.exit(main())
