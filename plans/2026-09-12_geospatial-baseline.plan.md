---
slug: 2026-09-12_geospatial-baseline
status: draft
started: 2026-09-12
finished:
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

- [ ] Get local GDAL working, or settle on a pure-Python route for reading the HDX archive
- [ ] Extract the Wat Ket ADM3 polygon; find its P-code first so the filter is exact rather than a
      name match
- [ ] Commit the single polygon to `src/scenes/wat-ket.boundary.geojson`; gitignore the archive
- [ ] Report the polygon's area and reject it loudly above 4 km², per the limits in
      `docs/architecture.md`
- [ ] `scripts/fetch-osm.ts` — Overpass query clipped to the boundary, writing a raw response to
      the gitignored cache
- [ ] Transform: project to local metres against `origin`, clip to the polygon, drop buildings whose
      centroid falls outside
- [ ] Height synthesis from footprint area, kind and a hash of the OSM id
- [ ] Roads to a ground-plane canvas texture rather than polygons, per the perf budget
- [ ] Water and landuse polygons into `baseline`
- [ ] Write `baseline` into the scene document; leave `scenarios` and `hotspots` untouched
- [ ] Report triangle count and reject above budget, so the boundary gets resized rather than
      discovered to be too big in the browser
- [ ] `scripts/fetch-elevation.ts` — sample elevation across the boundary to a separate file
- [ ] Add CC BY-IGO to the licensing table and the viewer's attribution line

## Test list (TDD)

- [ ] Boundary clipping — unit — `src/engine/__tests__/clip.test.ts`
  - a point inside the polygon is kept, one outside is dropped
  - a building straddling the edge is decided by its centroid, consistently
  - a concave boundary does not keep points in the concavity
- [ ] Height synthesis — unit — `src/engine/__tests__/synth.test.ts`
  - **the same OSM id always yields the same height** — the property the whole pipeline rests on
  - a larger footprint yields a taller building, kind held constant
  - an explicit `height` tag always wins over synthesis
  - `building:levels` wins over synthesis but loses to `height`
  - every result is finite, positive, and within a plausible band for a shophouse district
- [ ] Overpass response to baseline — unit — `src/engine/__tests__/osm.test.ts`
  - a way with a closing node produces a footprint with no duplicated point
  - a multipolygon relation with a hole does not silently become a solid block
  - an element with no geometry is skipped rather than emitting NaN coordinates
- [ ] Budget guards — unit — same file
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

- [ ] **Does the Wat Ket tambon match the Wat Ket people mean?** An administrative boundary and a
      neighbourhood are different objects, and the tambon may be larger, or may cut through what
      residents would call Wat Ket. Check the polygon against the district as understood locally
      before committing to it — and be willing to clip it further if the building count demands.
- [ ] Which elevation source: SRTM at 30 m, or Copernicus DEM at 30 m. Both are coarse; the question
      is only which is easier to sample and better licensed.
- [ ] Does `building:levels × 3.2` hold for Chiang Mai shophouses, or is the local storey height
      lower? 64 buildings carry the tag and can be sanity-checked against the synthesis.
- [ ] If 1,659 buildings will not fit the budget, is the answer a tighter boundary or a lower
      triangle count per building? The boundary is the editorial lever; the geometry is the
      technical one.

## Outcome

_Not started._
