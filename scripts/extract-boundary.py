#!/usr/bin/env python3
"""
Pull the Wat Ket ADM3 polygon out of the HDX COD-AB Thailand archive.

Run once. The output — a single polygon — is committed; the 377 MB archive is not.
There is no reason to run this again unless HDX publishes a new version of the
Common Operational Dataset, and then the diff on the output is the thing to read.

    python3 scripts/extract-boundary.py --archive data/hdx/tha_admin_boundaries.shp.zip

Download the archive first (it is gitignored):

    curl -L -o data/hdx/tha_admin_boundaries.shp.zip \
      'https://data.humdata.org/dataset/d24bdc45-eb4c-4e3d-8b16-44db02667c27/resource/10dde461-b781-4904-9559-7deb3e960913/download/tha_admin_boundaries.shp.zip'

Needs `pyshp` (pure Python — deliberately not GDAL, which is a system dependency
that breaks). `python3 -m pip install pyshp`.

Source: HDX `cod-ab-tha`, "Thailand - Subnational Administrative Boundaries",
OCHA FISS. Licensed CC BY-IGO — see the licensing table in README.md.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import sys
import zipfile
from pathlib import Path

# The tambon we want. Pinned by P-code rather than by name: name matching across
# transliterations of วัดเกต is exactly the kind of thing that silently matches the
# wrong unit, and 7,425 ADM3 units is plenty of room to be wrong in.
PCODE = "TH500106"
LAYER = "tha_admin3"

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "src" / "scenes" / "wat-ket.boundary.geojson"

EARTH_RADIUS_M = 6_378_137.0
DEG = math.pi / 180


def polygon_area_m2(rings: list[list[list[float]]], origin: tuple[float, float]) -> float:
    """Shoelace area of a lat/lon ring set, projected to local metres.

    Mirrors src/engine/project.ts exactly — same tangent-plane approximation, same
    cos(latitude) scaling. If those two ever disagree, the area reported here stops
    describing the scene the renderer builds.
    """
    olat, olon = origin
    scale = math.cos(olat * DEG)
    total = 0.0
    for i, ring in enumerate(rings):
        acc = 0.0
        for j in range(len(ring)):
            x1 = (ring[j][0] - olon) * DEG * EARTH_RADIUS_M * scale
            y1 = (ring[j][1] - olat) * DEG * EARTH_RADIUS_M
            k = (j + 1) % len(ring)
            x2 = (ring[k][0] - olon) * DEG * EARTH_RADIUS_M * scale
            y2 = (ring[k][1] - olat) * DEG * EARTH_RADIUS_M
            acc += x1 * y2 - x2 * y1
        # First ring is the outer one; the rest are holes and subtract.
        total += abs(acc) / 2 if i == 0 else -abs(acc) / 2
    return total


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--archive", required=True, type=Path)
    ap.add_argument("--origin", default="18.7912,99.0043",
                    help="scene origin lat,lon — only used to report area in metres")
    args = ap.parse_args()

    try:
        import shapefile  # pyshp
    except ImportError:
        print("error: pyshp is not installed. python3 -m pip install pyshp", file=sys.stderr)
        return 1

    if not args.archive.exists():
        print(f"error: {args.archive} not found — see the docstring for the download URL",
              file=sys.stderr)
        return 1

    olat, olon = (float(v) for v in args.origin.split(","))

    zf = zipfile.ZipFile(args.archive)
    members = {e: io.BytesIO(zf.read(f"{LAYER}{e}")) for e in (".shp", ".shx", ".dbf")}
    reader = shapefile.Reader(shp=members[".shp"], shx=members[".shx"],
                              dbf=members[".dbf"], encoding="utf-8")

    fields = [f[0] for f in reader.fields[1:]]
    pcode_at = fields.index("adm3_pcode")

    matches = [i for i, rec in enumerate(reader.iterRecords()) if rec[pcode_at] == PCODE]
    if len(matches) != 1:
        print(f"error: expected exactly one record for {PCODE}, found {len(matches)}",
              file=sys.stderr)
        return 1

    sr = reader.shapeRecord(matches[0])
    record = dict(zip(fields, sr.record))
    geometry = sr.shape.__geo_interface__

    if geometry["type"] != "Polygon":
        print(f"note: {PCODE} is a {geometry['type']} — downstream clipping handles "
              f"multiple parts, but check that is what you expect")

    rings = [[[round(x, 7), round(y, 7)] for x, y in ring] for ring in geometry["coordinates"]]
    area_km2 = polygon_area_m2(rings, (olat, olon)) / 1e6

    feature = {
        "type": "Feature",
        "properties": {
            "pcode": PCODE,
            "name": record["adm3_name"],
            "name_th": record["adm3_name1"],
            "adm2": record["adm2_name"],
            "adm1": record["adm1_name"],
            "area_km2": round(area_km2, 4),
            "area_km2_source": record["area_sqkm"],
            "valid_on": str(record["valid_on"]),
            "version": record["version"],
            "source": "HDX cod-ab-tha — Thailand Subnational Administrative Boundaries, OCHA FISS",
            "license": "CC BY-IGO",
            "license_url": "https://creativecommons.org/licenses/by/3.0/igo/",
        },
        "geometry": {"type": "Polygon", "coordinates": rings},
    }

    OUT.write_text(json.dumps(feature, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"{record['adm3_name']} / {record['adm3_name1']}  ({PCODE})")
    print(f"  {record['adm2_name']}, {record['adm1_name']}")
    print(f"  rings {[len(r) for r in rings]}  area {area_km2:.3f} km2 "
          f"(source attribute: {record['area_sqkm']:.3f})")
    print(f"  -> {OUT.relative_to(REPO)}")

    # The tambon is an administrative unit, not a scene. Whether it fits the budget
    # is a separate question, answered by scripts/fetch-osm.ts against the clip.
    if area_km2 > 4:
        print(f"  note: {area_km2:.2f} km2 is above the 4 km2 hard limit in "
              f"docs/architecture.md — the scene clips a part of this, it does not "
              f"render all of it")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
