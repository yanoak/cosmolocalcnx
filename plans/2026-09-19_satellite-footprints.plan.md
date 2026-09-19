---
slug: 2026-09-19_satellite-footprints
status: done
started: 2026-09-19
finished: 2026-09-19
issue:
---

# Satellite-derived footprints and observed heights

## Context

The baseline is generated from OpenStreetMap, and OSM holds roughly one Wat Ket building in seven.
An experiment on 19 Sep 2026 (see the diary) pulled four satellite-derived sources for the district
and matched each against the Overpass cache:

| Source | Footprints, whole tambon | Recovers OSM (IoU ≥ 0.3) | Polygons OSM lacks |
|---|---|---|---|
| OSM | 1,386 | — | — |
| Google Open Buildings v3 | 13,462 | 81 % | 11,900 |
| Microsoft ML Buildings | 6,317 | 68 % | 5,251 |
| Overture 2026-08-19 buildings | 9,624 | 100 % (it embeds OSM) | 8,239 |
| Google Open Buildings 2.5D Temporal 2023 | height raster, 4 m effective | — | — |

Inside the scene's actual clip (the 1.50 × 2.70 km extent in `scripts/fetch-osm.ts`) Overture holds
**4,110** buildings: 1,184 from OSM, 2,188 from Google, 738 from Microsoft. Extruded, that is
~62k triangles, above the 60k warning and well under the 100k reject. Simplifying the rings
changes nothing (ML footprints average 5.4 vertices already); an area floor removes a couple of
hundred sheds.

The 2.5D raster is usable as a height source: 93 % of OSM footprints have building presence under
them, and its mean height correlates at 0.86 with the 57 `building:levels` tags. Against the
committed `synth.ts` heights the correlation is 0.57 and the tails are wrong in ways a local would
catch. Rim Ping Condominium is synthesised at 8 m and measures 65 m; Embassy House 6 m against
31 m. The raster underestimates the very tall (Supalai Monte 75 m against a 111 m tag), so tags
keep precedence.

## Goal

The baseline's building layer comes from Overture (which conflates OSM, Google and Microsoft), with
heights resolved tag → observed raster → synthesis. The southern half of the clip, empty today, is
populated. Re-running the pipeline against the same caches is byte-identical. OSM-sourced buildings
keep their `osm/way/…` ids, so every existing edit and hotspot target still resolves.

## Approach

**Overture for footprints, not the raw Google or Microsoft sets.** Overture has already done the
job that costs the most, deciding when a Google polygon and an OSM way are the same building, and
it carries the OSM record id so the join back to the Overpass cache is exact. The raw sets remain a
fallback if Overture ever drops a region. Release pinned to `2026-08-19.0`; bumping it is a
deliberate commit.

**The raster for heights, with tags above it and synthesis below.** Chain in `resolveHeight`:
`height` tag → `building:levels` tag → observed mean height → synthesis. Observed means the mean
of raster pixels under the footprint where building presence exceeds 0.5, accepted only when at
least 30 % of the footprint's pixels qualify and at least 4 do. Clamped to 100 m: the raster is
evidence but weaker than a tag, and a 4 m-resolution model cannot vouch for a 150 m tower.

**Two scripts, one pure transform.** `scripts/fetch-buildings.py` does the geo I/O that Node cannot:
DuckDB against Overture's S3 parquet, HTTP-range windows into the 12.5 km GeoTIFF tiles, raster
sampling. It writes one gitignored cache, `data/buildings-cache/wat-ket.buildings.json`, holding
(a) the non-OSM Overture footprints in lon/lat and (b) observed heights keyed by scene id for every
candidate, OSM included. `scripts/fetch-osm.ts` reads that cache next to the Overpass cache and the
merge lives in `src/engine/satellite.ts`, pure and unit-tested. Same shape as everything else here:
caches are gitignored, the generated scene is committed, the exhibition never touches a network.

**Non-OSM buildings get `overture/<uuid>` ids and kind `default`.** ML footprints carry no tags,
so they take the stock role and the stock synthesis profile when the raster has nothing for them.
Overture's GERS ids are meant to be stable across releases but are not guaranteed; the `wasAt`
snapshot on edits already covers that case for OSM ids and covers this one the same way.

**Dedupe against the newer Overpass cache.** Overture's OSM snapshot is older than the Overpass
cache, so a building mapped in OSM since could appear twice. A non-OSM footprint whose centroid
falls inside any OSM footprint is dropped. Centroid-in-polygon rather than IoU because it is cheap,
deterministic and enough at this density.

**Area floor of 12 m² for ML footprints.** OSM keeps its 4 m² floor (a tagged 6 m² shrine is
real); an untagged 8 m² polygon is a detector blob. Removes ~40 polygons in the clip.

Rejected:

- *Tracing or detecting from imagery ourselves.* The datasets above exist so nobody has to, and
  the imagery licences do not permit derived redistributable data anyway.
- *Committing the intermediate.* It duplicates ~1 MB of geometry in git for no consumer.
- *Rewriting `fetch-osm.ts` in Python.* The pure transform and its tests stay in TypeScript
  where the schema lives; Python only does what rasterio and DuckDB make trivial.
- *Raising the triangle budget.* 62k is within it. If a wider clip is wanted later, that is a
  separate argument.

## Tasks

- [x] `scripts/fetch-buildings.py` + `npm run fetch:buildings` + gitignore entry — writes the
      buildings cache from Overture and the 2.5D raster, deterministic
- [x] `src/engine/satellite.ts` — merge non-OSM footprints and observed heights into the baseline,
      with tests; `resolveHeight` gains the observed rung
- [x] `scripts/fetch-osm.ts` reads the buildings cache and reports sources; regenerate
      `src/scenes/wat-ket.json`
- [x] Docs and credit: README licence rows, footer attribution, architecture "OSM pipeline" and
      "Height is synthesised" sections, CLAUDE.md regeneration line

## Test list (TDD)

- [x] observed height wins over synthesis and loses to a `height` or `building:levels` tag — unit —
      `src/engine/__tests__/synth.test.ts`
- [x] observed height is clamped to `[MIN_HEIGHT_M, MAX_OBSERVED_HEIGHT_M]` and rounded — unit —
      `synth.test.ts`
- [x] an observation below the presence or pixel thresholds is ignored — unit — `synth.test.ts`
- [x] a non-OSM footprint is projected, rounded to the centimetre, and closed ring dropped — unit —
      `src/engine/__tests__/satellite.test.ts`
- [x] a non-OSM footprint whose centroid lies inside an OSM footprint is dropped — unit —
      `satellite.test.ts`
- [x] a non-OSM footprint below 12 m² is dropped; one at 12 m² is kept — unit — `satellite.test.ts`
- [x] a non-OSM footprint whose centroid is outside the clip is skipped — unit — `satellite.test.ts`
- [x] ids are `overture/<id>`, kind is `default`, output sorted by id, holes preserved — unit —
      `satellite.test.ts`
- [x] `buildBaseline` with a buildings cache reports per-source counts and the observed height
      count — unit — `src/engine/__tests__/satellite.test.ts`
- [x] `buildBaseline` without a cache is unchanged — unit — `osm.test.ts`

## Verification

- `npm run fetch:buildings` twice → second run reports the cache is byte-identical.
- `npm run fetch:osm` twice → "byte-identical to the previous run".
- Script output: ~4,000 buildings, sources reported, triangles under 100k, observed heights the
  majority.
- `npm test` and `npm run typecheck` pass.
- `npm run dev`, open `/`: the southern half of the clip is built up; Rim Ping Condominium
  (`osm/way/99685189`) stands as a tower on the riverbank; the Charoen Rat shophouse strip still
  reads as two- and three-storey.
- Tap a Google-sourced building: the select panel opens with an `overture/…` id. **Not verified
  through the browser extension** — its synthetic tap opened no panel on the old scene either, so
  it is a limitation of the automation, not a regression; `idForFace` over merged ranges is
  covered by `merge.test.ts`. Check by hand.
- Vercel preview on a phone: first paint and pan remain smooth. **Not yet checked** — needs a
  deploy.

## Out of scope

- Raw Google v3 or Microsoft ingestion. Overture already contains them.
- Any change to the clip extent or the triangle ceiling.
- Multi-year use of the temporal raster. 2023 only; the earlier years are a December question.
- Building classification for ML footprints.

## Open questions

- [ ] Overture's next release may reassign some ids. Worth a diff of `overture/` ids on the first
      bump, to see whether GERS stability holds in practice here.
- [ ] Two OSM `building:levels` tags (10 and 12 storeys) measure at 7 m. Tags keep precedence per
      the architecture doc; if a visitor points at them, fix the tags upstream.

## Outcome

Shipped 19 Sep 2026, the same day as the experiment. The clip now holds **4,056 buildings**:
1,182 from OSM (every id, footprint and tag unchanged), 2,143 from Google and 731 from Microsoft
via Overture, with 3 duplicates and 70 sub-12 m² polygons dropped. Heights are observed for 76 %
and synthesised for 23 %; 972 of the 1,182 OSM heights moved, Rim Ping Condominium from 8 m to
65 m. ~61k triangles, scene document 1,113 KB against 462. Roads, water, green and the boundary are
byte-identical to before; all scenario and hotspot targets resolve. Both scripts are byte-identical
on a re-run. 293 tests and the type check pass. Verified visually in the district and block
registers: the southern half is built up and the riverbank towers stand.

What it changed: `fetch:osm` now requires the buildings cache or `--osm-only`; changing the extent
is the three-step dance in its docstring. Two new attribution clauses in the footer and two rows in
the README table. Two verification items are still open above: a hand tap on an `overture/`
building, and a phone check on a deploy.

Surprises worth keeping: `buildings.ts` collided with `Buildings.tsx` on a case-insensitive
filesystem, hence `satellite.ts`; and the Overpass cache turned out to carry no usable `height`
tag inside the clip at all (Supalai Monte is outside it), so the "one height tag" in the
architecture doc was for the wider reconnaissance box.
