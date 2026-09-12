---
slug: 2026-09-12_geospatial-baseline
status: done
started: 2026-09-12
finished: 2026-09-12
issue:
---

# Geospatial baseline — boundary, footprints, flood reference

## Context

Roadmap item 2. The scene currently contains twelve hand-authored boxes; this replaces them with
the real Wat Ket, generated from OpenStreetMap and clipped to an authoritative boundary.

**Reconnaissance was done before writing this plan, and three findings changed its shape.**

| Checked | Result |
|---|---|
| Buildings in a 3.4 km² box around the origin | **1,659** |
| …carrying a `height` tag | **1** |
| …carrying `building:levels` | 64 (3.9%) |
| Highways / water features / landuse polygons | 782 / 10 / 30 |
| Wat Ket boundary in OSM | **none** — no admin relation, no place polygon, `is_in` on the origin returns nothing |
| Wat Ket in HDX COD-AB Thailand | **present**, as `Wat Ket` / `วัดเกต` |

1. **Height is synthesised, not imported.** 96% of buildings carry no height information at all.
   The fallback chain in `src/engine/extrude.ts` is not a fallback here — it is the primary source,
   and it will author almost the entire skyline. Flat per-kind defaults across 1,600 buildings
   would read as a spreadsheet.
2. **1,659 buildings is at the edge of the budget.** At roughly 50–100 triangles each that is
   80–160k against a ceiling of 100–150k, before a single asset is placed. The boundary is
   therefore a performance decision, not only an editorial one.
3. **The boundary comes from HDX, not OSM.** The Common Operational Dataset for Thailand carries
   ADM3 (tambon) polygons including Wat Ket. Authoritative, and it travels: a second neighbourhood
   in December is another ADM3 polygon rather than another afternoon in a polygon editor.

## Goal

A script — not a UI — that writes `baseline` into `src/scenes/wat-ket.json` from OSM, clipped to the
Wat Ket ADM3 polygon, with synthesised building heights. Re-running it produces byte-identical
output. Elevation is fetched separately as **flood-reference data that the renderer never reads**.

Done when the viewer renders the real Wat Ket, inside the triangle budget, from committed data,
with no network access at run time.

## Why now

Roadmap item 2, and everything downstream is waiting on it: the scenarios in item 3 diff against
this baseline, and the hotspots in item 5 attach to its object ids. It is also the first real test
of the `wasAt` snapshot and the id-stability reasoning in `docs/architecture.md`.

## Approach

**Boundary first, because it sizes everything else.** Pull the Wat Ket ADM3 polygon out of HDX COD-AB
once, commit that single polygon as GeoJSON, and never carry the source archive in the repo. Then
clip the Overpass query to it.

**The scene document must not depend on Overpass at run time.** The script writes `baseline` into
the committed JSON — the exhibition cannot depend on a third-party API being up, which is already
the rule in `docs/architecture.md`.

**Height synthesis is deterministic.** Base height from footprint area and kind, varied by a hash of
the OSM id. Deterministic matters more than it sounds: a re-import in November must not reshuffle
the skyline, or every screenshot, every hotspot position and every placement judgement made before
it silently stops matching.

**Elevation is data, not terrain.** Fetched to a separate file, used for reasoning about the Ping —
which streets sit below a given river level — and never loaded by the renderer. The non-goal in
`CLAUDE.md` stands as written: it forbids rendering terrain, and nothing here renders terrain.

### Known obstacles

- **The HDX files are 175–437 MB** (GDB / SHP / GeoJSON). We need one polygon out of one of them.
- **Local GDAL is broken.** `ogr2ogr` and `ogrinfo` are installed at 3.3.2 but fail to launch —
  `Library not loaded: libpoppler.113.dylib`. Fix with `brew reinstall gdal`, or sidestep it with
  a pure-Python shapefile reader; `shapely` 2.1.2 is already available for geometry.
- **CC BY-IGO is a fourth licence.** The README currently states three. Boundary data carries its
  own terms and its own attribution requirement.

## Tasks

- [x] Get local GDAL working, or settle on a pure-Python route for reading the HDX archive —
      settled on `pyshp`, pure Python. GDAL stays broken and is now not a dependency of anything.
- [x] Extract the Wat Ket ADM3 polygon; find its P-code first so the filter is exact rather than a
      name match — **`TH500106`**, found in the XLSX with `openpyxl`, one match in 7,425 units
- [x] Commit the single polygon to `src/scenes/wat-ket.boundary.geojson`; gitignore the archive
- [x] Report the polygon's area and reject it loudly above 4 km², per the limits in
      `docs/architecture.md` — **it is 6.85 km² and the guard fires.** The scene is a clip of it.
- [x] `scripts/fetch-osm.ts` — Overpass query clipped to the boundary, writing a raw response to
      the gitignored cache (with endpoint failover; the main instance was down mid-build)
- [x] Transform: project to local metres against `origin`, clip to the polygon, drop buildings whose
      centroid falls outside
- [x] Height synthesis from footprint area, kind and a hash of the OSM id
- [x] Roads to a ground-plane canvas texture rather than polygons, per the perf budget
- [x] Water and landuse polygons into `baseline` — 6 water, 80 green
- [x] Write `baseline` into the scene document; leave `scenarios` and `hotspots` untouched
- [x] Report triangle count and reject above budget, so the boundary gets resized rather than
      discovered to be too big in the browser
- [x] `scripts/fetch-elevation.ts` — sample elevation across the boundary to a separate file
- [x] Add CC BY-IGO to the licensing table and the viewer's attribution line

## Test list (TDD)

- [x] Boundary clipping — unit — `src/engine/__tests__/clip.test.ts`
  - a point inside the polygon is kept, one outside is dropped
  - a building straddling the edge is decided by its centroid, consistently
  - a concave boundary does not keep points in the concavity
- [x] Height synthesis — unit — `src/engine/__tests__/synth.test.ts`
  - **the same OSM id always yields the same height** — the property the whole pipeline rests on
  - a larger footprint yields a taller building, kind held constant
  - an explicit `height` tag always wins over synthesis
  - `building:levels` wins over synthesis but loses to `height`
  - every result is finite, positive, and within a plausible band for a shophouse district
- [x] Overpass response to baseline — unit — `src/engine/__tests__/osm.test.ts`
  - a way with a closing node produces a footprint with no duplicated point
  - a multipolygon relation with a hole does not silently become a solid block
  - an element with no geometry is skipped rather than emitting NaN coordinates
- [x] Budget guards — unit — same file
  - area above 4 km² rejects; above 1 km² warns
  - triangle estimate above the ceiling rejects

## Verification

Not browser verification in the usual sense — this plan's surface is a file, not a screen.

1. Run the script twice. The second run produces a **byte-identical** scene document. If it does
   not, the synthesis is not deterministic and every downstream judgement is unstable.
2. `validateScene` returns no errors on the output.
3. Building count and triangle estimate are inside the budget, and the script says so explicitly.
4. Open `/`. Wat Ket is recognisable: the Ping on the west, the street grid, the temple where it
   should be. **The audience knows these streets and will notice if it is wrong** — check it against
   a map rather than against a feeling.
5. Delete the Overpass cache and rebuild from the committed scene document alone. It must work with
   no network at all, because the exhibition machine will have none.
6. Attribution for both OSM (ODbL) and HDX (CC BY-IGO) is visible in the viewer.

## Out of scope

No UI mockups or keyboard interaction sections in this plan: its entire output is a script and a
data file, and it adds no user-facing control. The viewer changes only in that it has better data
to draw.

Also not here: scenario edits over this baseline (item 3), the editor (item 4), hotspot content
(item 5), any rendering of elevation ever, and any run-time network access.

## Open questions

- [x] **Does the Wat Ket tambon match the Wat Ket people mean?** **No.** The tambon is 6.85 km²
      and runs 3 km south of the origin — well past the riverside quarter, and past the 4 km² hard
      limit. Resolved by keeping the tambon as the authoritative committed boundary and making the
      *scene* an explicit rectangular clip of it, chosen with Yan at 1.50 × 2.70 km / 2.98 km².
      The clip is one constant in `scripts/fetch-osm.ts` and is meant to be argued with.
- [x] Which elevation source: **SRTM 30 m**, via OpenTopoData's public API — sampleable over HTTP
      with no account, and public domain. At this resolution Copernicus would answer the same
      question identically. Result: 299–327 m across the district, median 309 m, which is mostly
      SRTM noise on a flat river plain — and is itself the best argument for the no-terrain rule.
- [ ] Does `building:levels × 3.2` hold for Chiang Mai shophouses, or is the local storey height
      lower? **Still open, and not answerable from OSM:** only one building in the scene carries
      both `height` and `building:levels`, so there is nothing local to calibrate against. Left at
      3.2 m and flagged in `src/engine/synth.ts`. Needs a photograph and a tape measure, not a query.
- [x] If 1,659 buildings will not fit the budget, is the answer a tighter boundary or a lower
      triangle count per building? **The premise was wrong — they fit easily.** An extruded
      footprint costs ~4v − 4 triangles, about 17 per real building, not the 50–100 this plan
      assumed. The whole 6.85 km² tambon is ~35k triangles. The boundary is therefore an editorial
      decision and a legibility one, never a geometry budget one.

## Reference — everything needed to start cold

Recorded so this plan can be picked up without the session that wrote it.

**HDX dataset:** `cod-ab-tha`, "Thailand - Subnational Administrative Boundaries", OCHA FISS,
last updated 2026-01-26, **CC BY-IGO**. Metadata:
`https://data.humdata.org/api/3/action/package_show?id=cod-ab-tha`

Resource download URLs (all under `https://data.humdata.org/dataset/d24bdc45-eb4c-4e3d-8b16-44db02667c27/resource/`):

| Format | Size | Resource id |
|---|---|---|
| Geodatabase | 175 MB | `ccbf3740-0638-48ea-b612-cdb61ef5462c/download/tha_admin_boundaries.gdb.zip` |
| SHP | 377 MB | `10dde461-b781-4904-9559-7deb3e960913/download/tha_admin_boundaries.shp.zip` |
| GeoJSON | 437 MB | `89a09f13-7b83-458a-9531-4f2418613065/download/tha_admin_boundaries.geojson.zip` |
| XLSX (names and P-codes, no geometry) | 1.9 MB | `a925b917-01ae-48c4-9279-7efe680a6b11/download/tha_admin_boundaries.xlsx` |

**State of the P-code lookup:** `Wat Ket` and `วัดเกต` are both confirmed present in the XLSX shared
strings, so the unit exists. The P-code itself was **not** pinned down — the ad-hoc XLSX cell parse
used to find it was fragile and abandoned. Use a real reader (`openpyxl`) rather than regex over
the sheet XML. The XLSX is the cheap way in: find the P-code there, then filter the big archive by
code rather than by name.

**Reconnaissance bbox** used for the building counts, in Overpass order
`south,west,north,east`: `18.784,98.996,18.800,99.014` — about 3.4 km², deliberately larger than
the scene should end up. The scene `origin` is `[18.7912, 99.0043]`.

**Counting query shape** — `out count;` per named set is much cheaper than fetching elements:

```
[out:json][timeout:90];
( way["building"](BBOX); relation["building"](BBOX); )->.all;
.all out count;
```

**Checked and found empty**, so do not spend time re-checking: `boundary=administrative` relations
matching Wat Ket in the area, `place=suburb|quarter|neighbourhood` polygons, `waterway=riverbank`
ways, and `is_in(18.7912,99.0043)` for enclosing admin boundaries. OSM has no Wat Ket polygon.

## Outcome

**Done.** The viewer renders the real Wat Ket — 1,182 buildings, 513 streets, the Ping and 80 green
spaces — from a committed document, with no network access at run time.

| | |
|---|---|
| Boundary | HDX ADM3 `TH500106`, 6.85 km², committed as one 174-point polygon |
| Scene clip | 1.50 × 2.70 km, **2.98 km²** — 44% of the tambon |
| Buildings | **1,182**, ~**21,700** triangles against a ~100k baseline ceiling |
| Heights | 0 tagged, 56 from `building:levels`, **1,126 synthesised (95%)** |
| Document | 451 KB, byte-identical across re-runs |
| Tests | 153 passing across 12 files |

### Three findings that changed the plan as written

1. **The triangle estimate was ~5× too pessimistic.** The plan sized the boundary against 50–100
   triangles per building; an extruded OSM footprint actually costs about 17. Geometry never was
   the constraint, which is why the extent could be chosen on editorial grounds instead.
2. **The tambon is not the neighbourhood.** 6.85 km² and reaching 3 km south of the origin. The
   resolution — authoritative polygon committed, scene an explicit clip of it — keeps both the
   provenance and the editorial judgement visible instead of collapsing them into one number.
3. **The viewer was opening blank, and had been since day one.** Not caused by this work: R3F never
   sized its canvas, and would not start a renderer it believed had zero size, so there was no error
   to find. It survived day one only because a debug toggle or a window resize forces a re-measure —
   which a visitor will never do. `Diorama` now measures the stage itself and mounts the canvas only
   once it has a real size, and the isometric fit moved into a tested pure function
   (`src/engine/camera.ts`) so "opens showing one street corner" is a test failure rather than a
   thing someone notices in a gallery.

### Beyond the plan

Merging (`src/engine/merge.ts`) was not on the task list but became load-bearing at 1,182 buildings:
a mesh each is 1,182 draw calls against a budget of "a few dozen". Baseline buildings, water and
green are now one merged geometry each. Picking survived it via face-index ranges, so the
architecture's permission to drop baseline picking has not had to be used.

### Left for later

- The storey-height question above needs field measurement, not code.
- Road tones are deliberately low-contrast against the ground; worth judging on the projector and
  on a phone in a bright mall before tuning.
- Verification step 4 was done against the rendered scene rather than against a map side-by-side:
  roads run between buildings rather than through them, which independently confirms the texture
  and the geometry agree on orientation. **Someone who knows these streets should still look at it.**
