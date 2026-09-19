#!/usr/bin/env python3
"""
Satellite-derived building footprints and observed heights for a scene.

    npm run fetch:buildings                 # uses the caches under data/buildings-cache/
    npm run fetch:buildings -- --refresh    # re-downloads Overture and the height raster

Writes ONE file, `data/buildings-cache/<scene>.buildings.json`, which is gitignored.
`scripts/fetch-osm.ts` reads it next to the Overpass cache and merges it into the
committed scene document. Nothing at build or run time reads this cache; the
exhibition never touches a network. Re-running against the same downloads must
produce a BYTE-IDENTICAL file, and the script says so when it does.

Two sources, both chosen on 19 Sep 2026 after comparing four
(plans/2026-09-19_satellite-footprints.plan.md):

- **Overture Maps `buildings`** for footprints. Overture conflates OpenStreetMap,
  Google Open Buildings and Microsoft's ML footprints and carries the OSM record id,
  so the join back to the Overpass cache is exact. The release is PINNED below;
  bumping it is a deliberate commit, because Overture ids are meant to be stable
  across releases but are not guaranteed to be.
- **Google Open Buildings 2.5D Temporal** for heights. A yearly raster at 4 m
  effective resolution (served at 0.5 m) with building presence and height bands.
  Read as HTTP-range windows straight out of the 12.5 km GeoTIFF tiles: the tiles
  are cloud-optimised, so a 3 km scene costs a few tens of MB, not a few GB.

Licences: Overture buildings ODbL (crediting OSM, Google and Microsoft); Open
Buildings 2.5D Temporal CC BY 4.0 / ODbL. Both are in the README table and the
viewer's footer.

Dependencies, none of which the app needs:

    python3 -m pip install duckdb rasterio shapely pyproj s2sphere numpy

`build-region.py` avoids rasterio on purpose and this script does not, and the
difference is deliberate: those tiles are small enough to read whole, and these are
25,000 × 25,000 pixels each. Range-reading a window out of a cloud-optimised
GeoTIFF is exactly what GDAL exists for, and the pip wheel bundles it, so it is a
Python dependency rather than a system one.

The path arithmetic worth knowing: a temporal manifest's `uriPrefix` ends in a
partial S2 token (`…/geotiffs/3`) and each tile URI begins with the rest of it
(`0da4_2023_06_30/tile_….tif`). They concatenate with NO separator.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------- constants

OVERTURE_RELEASE = "2026-08-19.0"
OVERTURE_S3 = f"s3://overturemaps-us-west-2/release/{OVERTURE_RELEASE}/theme=buildings/type=building/*"

TEMPORAL_BUCKET = "open-buildings-temporal-data"
TEMPORAL_VERSION = "v1"
TEMPORAL_MANIFEST_S2_LEVEL = 2
TEMPORAL_NODATA = -99.0
# The raster is 4 m effective; sampling at 1 m keeps every footprint edge honest
# without reading four times the pixels the data actually holds.
SAMPLE_RES_M = 1.0

# Slightly wider than the scene, so a building straddling the boundary is whole.
QUERY_MARGIN_M = 150

# A pixel is "building" above this presence probability. The dataset's own
# convention for a binary footprint.
PRESENCE_THRESHOLD = 0.5


# ------------------------------------------------------------------ helpers

def log(msg: str = "") -> None:
    print(msg, flush=True)


def scene_bbox(scene: dict) -> tuple[float, float, float, float]:
    """(west, south, east, north) in degrees, from the committed boundary plus a margin."""
    ring = scene["boundary"]["coordinates"][0]
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    lat0 = scene["origin"][0]
    dlat = QUERY_MARGIN_M / 111_320
    dlon = QUERY_MARGIN_M / (111_320 * math.cos(math.radians(lat0)))
    return (min(lons) - dlon, min(lats) - dlat, max(lons) + dlon, max(lats) + dlat)


def utm_epsg(lon: float, lat: float) -> int:
    zone = int((lon + 180) // 6) + 1
    return (32600 if lat >= 0 else 32700) + zone


def osm_scene_id(record_id: str | None) -> str | None:
    """Overture's OSM record id ('w123@4') to the scene's id ('osm/way/123')."""
    if not record_id:
        return None
    kind = {"w": "way", "r": "relation", "n": "node"}.get(record_id[0])
    number = record_id[1:].split("@")[0]
    if kind is None or not number.isdigit():
        return None
    return f"osm/{kind}/{number}"


# ----------------------------------------------------------------- overture

def fetch_overture(bbox, cache: Path, refresh: bool) -> Path:
    if cache.exists() and not refresh:
        log(f"  overture  {cache.relative_to(REPO)} (cached — --refresh to re-query)")
        return cache

    import duckdb

    west, south, east, north = bbox
    log(f"  overture  querying release {OVERTURE_RELEASE} … ", )
    t = time.time()
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
    cache.parent.mkdir(parents=True, exist_ok=True)
    con.execute(
        f"""
        COPY (
          SELECT id, sources, height, num_floors, subtype, class, names.primary AS name,
                 ST_AsText(geometry) AS wkt
          FROM read_parquet('{OVERTURE_S3}', filename=true, hive_partitioning=1)
          WHERE bbox.xmin > {west} AND bbox.xmax < {east}
            AND bbox.ymin > {south} AND bbox.ymax < {north}
          ORDER BY id
        ) TO '{cache}' (FORMAT parquet)
        """
    )
    log(f"            {time.time() - t:.0f} s")
    return cache


def load_overture(cache: Path) -> list[dict]:
    import duckdb

    rows = duckdb.connect().execute(
        "SELECT id, sources, height, num_floors, name, wkt FROM read_parquet(?) ORDER BY id",
        [str(cache)],
    ).fetchall()
    out = []
    for id_, sources, height, num_floors, name, wkt in rows:
        src = sources[0] if sources else {}
        out.append(
            {
                "overture_id": id_,
                "dataset": src.get("dataset") or "",
                "record_id": src.get("record_id"),
                "confidence": src.get("confidence"),
                "height": height,
                "num_floors": num_floors,
                "name": name,
                "wkt": wkt,
            }
        )
    return out


# ----------------------------------------------------------------- temporal

def gcs_list(prefix: str) -> list[str]:
    url = (
        f"https://storage.googleapis.com/storage/v1/b/{TEMPORAL_BUCKET}/o"
        f"?prefix={urllib.parse.quote(prefix)}&maxResults=100"
    )
    with urllib.request.urlopen(url, timeout=60) as r:
        return [i["name"] for i in json.load(r).get("items", [])]


def fetch_height_raster(bbox, year: int, cache: Path, refresh: bool) -> Path:
    if cache.exists() and not refresh:
        log(f"  heights   {cache.relative_to(REPO)} (cached)")
        return cache

    import numpy as np
    import pyproj
    import rasterio
    import s2sphere
    from rasterio.enums import Resampling
    from rasterio.merge import merge
    from rasterio.windows import from_bounds
    from rasterio.windows import transform as window_transform

    west, south, east, north = bbox
    lon_c, lat_c = (west + east) / 2, (south + north) / 2
    epsg = utm_epsg(lon_c, lat_c)
    token = s2sphere.CellId.from_lat_lng(s2sphere.LatLng.from_degrees(lat_c, lon_c)).parent(
        TEMPORAL_MANIFEST_S2_LEVEL
    ).to_token()

    names = gcs_list(f"{TEMPORAL_VERSION}/manifests/{token}_EPSG_{epsg}_{year}")
    if not names:
        raise SystemExit(f"no temporal manifest for S2 cell {token}, EPSG:{epsg}, {year}")
    manifest_url = f"https://storage.googleapis.com/{TEMPORAL_BUCKET}/{names[0]}"
    log(f"  heights   manifest {names[0].split('/')[-1]}")
    with urllib.request.urlopen(manifest_url, timeout=120) as r:
        manifest = json.load(r)

    to_utm = pyproj.Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    x0, y0 = to_utm.transform(west, south)
    x1, y1 = to_utm.transform(east, north)

    prefix = manifest["uriPrefix"].replace("gs://", "https://storage.googleapis.com/")
    tiles = []
    for source in manifest["tilesets"][0]["sources"]:
        a, d = source["affineTransform"], source["dimensions"]
        tx0, ty1 = a["translateX"], a["translateY"]
        tx1, ty0 = tx0 + a["scaleX"] * d["width"], ty1 + a["scaleY"] * d["height"]
        if tx0 < x1 and tx1 > x0 and ty0 < y1 and ty1 > y0:
            tiles.append((f"{prefix}{source['uris'][0]}", (tx0, ty0, tx1, ty1)))
    if not tiles:
        raise SystemExit("no temporal tiles intersect the scene")

    cache.parent.mkdir(parents=True, exist_ok=True)
    parts = []
    for url, (tx0, ty0, tx1, ty1) in tiles:
        t = time.time()
        with rasterio.open(url) as ds:
            bx0, by0, bx1, by1 = max(x0, tx0), max(y0, ty0), min(x1, tx1), min(y1, ty1)
            win = from_bounds(bx0, by0, bx1, by1, ds.transform)
            factor = SAMPLE_RES_M / ds.res[0]
            h, w = int(round(win.height / factor)), int(round(win.width / factor))
            arr = ds.read(window=win, out_shape=(ds.count, h, w), resampling=Resampling.average)
            tfm = window_transform(win, ds.transform)
            tfm = rasterio.Affine(tfm.a * factor, tfm.b, tfm.c, tfm.d, tfm.e * factor, tfm.f)
            profile = ds.profile.copy()
            profile.update(
                driver="GTiff", width=w, height=h, transform=tfm, compress="deflate",
                tiled=False, nodata=TEMPORAL_NODATA,
            )
            for k in ("blockxsize", "blockysize"):
                profile.pop(k, None)
            part = cache.with_name(f"{cache.stem}.part{len(parts)}.tif")
            with rasterio.open(part, "w", **profile) as out:
                out.write(arr)
            parts.append(part)
            log(f"            {url.split('/')[-1]}  {arr.shape[2]}×{arr.shape[1]} px, {time.time() - t:.0f} s")

    datasets = [rasterio.open(p) for p in parts]
    mosaic, tfm = merge(datasets, nodata=TEMPORAL_NODATA)
    profile = datasets[0].profile.copy()
    profile.update(width=mosaic.shape[2], height=mosaic.shape[1], transform=tfm)
    for ds in datasets:
        ds.close()
    with rasterio.open(cache, "w", **profile) as out:
        out.write(mosaic)
        out.update_tags(
            source="Google Open Buildings 2.5D Temporal v1", year=str(year),
            licence="CC BY 4.0 / ODbL", manifest=names[0],
        )
    for p in parts:
        p.unlink()
    return cache


def sample_heights(raster: Path, footprints: list[tuple[str, object]]) -> dict[str, dict]:
    """Per id: mean height over pixels where presence > threshold, and how many there were."""
    import numpy as np
    import pyproj
    import rasterio
    from rasterio.features import rasterize
    from shapely.ops import transform as shp_transform

    with rasterio.open(raster) as ds:
        bands = ds.read()
        to_utm = pyproj.Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True)
        shapes = []
        ids = []
        for id_, geom in footprints:
            g = shp_transform(lambda x, y, z=None: to_utm.transform(x, y), geom)
            if g.is_valid and not g.is_empty:
                shapes.append((g, len(ids) + 1))
                ids.append(id_)
        index = rasterize(shapes, out_shape=bands.shape[1:], transform=ds.transform,
                          fill=0, dtype="int32", all_touched=False)

    height, presence = bands[1].ravel(), bands[2].ravel()
    index = index.ravel()
    n = len(ids) + 1
    valid = (index > 0) & (presence > TEMPORAL_NODATA)
    built = valid & (presence > PRESENCE_THRESHOLD)
    px = np.bincount(index[valid], minlength=n)
    built_px = np.bincount(index[built], minlength=n)
    height_sum = np.bincount(index[built], weights=height[built], minlength=n)

    out = {}
    for i, id_ in enumerate(ids, start=1):
        if px[i] == 0 or built_px[i] == 0:
            continue
        out[id_] = {
            "height": round(float(height_sum[i] / built_px[i]), 2),
            "presence": round(float(built_px[i] / px[i]), 3),
            "px": int(built_px[i]),
        }
    return out


# --------------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scene", default="src/scenes/wat-ket.json")
    parser.add_argument("--year", type=int, default=2023, help="temporal raster year (2016–2023)")
    parser.add_argument("--refresh", action="store_true", help="re-download Overture and the raster")
    args = parser.parse_args()

    from shapely import wkt as shapely_wkt

    scene_path = REPO / args.scene
    scene = json.loads(scene_path.read_text())
    name = scene_path.stem
    cache_dir = REPO / "data" / "buildings-cache"
    overture_cache = cache_dir / f"{name}.overture-{OVERTURE_RELEASE}.parquet"
    raster_cache = cache_dir / f"{name}.height-{args.year}.tif"
    out_path = cache_dir / f"{name}.buildings.json"

    bbox = scene_bbox(scene)
    log(f"{name} buildings")
    log(f"  bbox      {bbox[0]:.5f},{bbox[1]:.5f} → {bbox[2]:.5f},{bbox[3]:.5f} (scene boundary + {QUERY_MARGIN_M} m)")

    rows = load_overture(fetch_overture(bbox, overture_cache, args.refresh))
    raster = fetch_height_raster(bbox, args.year, raster_cache, args.refresh)

    # Scene ids: OSM-sourced rows keep the OSM id so heights join onto the Overpass
    # geometry; everything else is namespaced by its Overture id.
    DATASETS = {"OpenStreetMap": "osm", "Google Open Buildings": "google", "Microsoft ML Buildings": "microsoft"}
    buildings = []
    counts: dict[str, int] = {}
    for row in rows:
        source = DATASETS.get(row["dataset"], "other")
        osm_id = osm_scene_id(row["record_id"]) if source == "osm" else None
        if source == "osm" and osm_id is None:
            continue
        geom = shapely_wkt.loads(row["wkt"])
        if geom.geom_type == "MultiPolygon":
            geom = max(geom.geoms, key=lambda g: g.area)
        if geom.geom_type != "Polygon" or geom.is_empty:
            continue
        counts[source] = counts.get(source, 0) + 1
        rnd = lambda ring: [[round(x, 7), round(y, 7)] for x, y in ring.coords]
        buildings.append(
            {
                "id": osm_id or f"overture/{row['overture_id']}",
                "source": source,
                "confidence": round(row["confidence"], 4) if row["confidence"] is not None else None,
                "footprint": rnd(geom.exterior),
                "holes": [rnd(i) for i in geom.interiors],
                "_geom": geom,
            }
        )
    log(f"  footprints {len(buildings):,} — " + ", ".join(f"{k} {v:,}" for k, v in sorted(counts.items())))

    t = time.time()
    observed = sample_heights(raster, [(b["id"], b["_geom"]) for b in buildings])
    for b in buildings:
        b["observed"] = observed.get(b["id"])
        del b["_geom"]
    heights = sorted(o["height"] for o in observed.values())
    log(
        f"  observed  {len(observed):,} of {len(buildings):,} have building presence under them "
        f"({len(observed) / max(1, len(buildings)):.0%}); median {heights[len(heights) // 2]:.1f} m, "
        f"max {heights[-1]:.1f} m; {time.time() - t:.0f} s"
    )

    buildings.sort(key=lambda b: b["id"])
    doc = {
        "_bbox": [round(v, 7) for v in bbox],
        "overture_release": OVERTURE_RELEASE,
        "height_year": args.year,
        "buildings": buildings,
    }
    text = json.dumps(doc, separators=(",", ":"), sort_keys=True) + "\n"
    unchanged = out_path.exists() and out_path.read_text() == text
    out_path.write_text(text)
    log(
        f"\n  wrote {out_path.relative_to(REPO)} — {len(text) / 1024:.0f} KB"
        f"{' (byte-identical to the previous run)' if unchanged else ''}"
    )
    log("  next: npm run fetch:osm")
    return 0


if __name__ == "__main__":
    sys.exit(main())
