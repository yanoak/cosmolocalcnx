---
slug: 2026-09-24_present-on-maplibre
status: active
started: 2026-09-24
finished:
issue:
---

# Present on MapLibre — a real map under the circle

## Context

The Present chapter's visualisation went from a flat population plane to instanced columns on
24 Sep 2026 (`plans/2026-09-23_present-chapter`), and Yan's first look at it said it did not
read. The screenshot said why, and none of it was the columns' fault: **there is no geography
under the data.** No coastline, no border, no relief, no place names except the dozen the city
file labels. The field floats on a blank warm-white disc, and the only shape a visitor has to
orient by is the population itself — which is the thing they are supposed to be reading, not the
thing they are supposed to be reading it against.

Everything that would fix that in three.js is a hand-built substitute for a basemap: a land mask
drawn into the field's spare blue channel, borders fetched and projected, labels placed by hand,
relief from a second DEM. Each is a week, and the result would still be a picture of a map.

Yan asked on the same morning whether MapLibre or Mapbox with PMTiles would be better, and then
said: make the plan. **Deadlines are not the constraint for this plan** — Yan said so. The
exhibition is open and runs on what is committed; this is the December engine's Present chapter.

Two decisions already on the books make this cheaper than it sounds:

- **The circle is "a different kind of rendering, not a different zoom level"** — the 21 Sep
  decision that split one rail into three discrete views. The only way between views is a cut,
  and a cut is exactly the boundary a second renderer needs. Nothing pans or zooms across it.
- **The data pipeline is renderer-agnostic.** GHS-POP tiles, `build-region.py`, the committed
  fields, the cumulative curve, `halfPopulationRadius()` and its tests, the city file — all of
  it survives. Only the last step changes: cells go to MapLibre as a vector layer instead of to
  three.js as instances.

The reference is the Pudding's population-mountains piece, which is Mapbox `fill-extrusion` on
a hex grid under a pitched camera. MapLibre GL JS 6.x has the same layer type, a globe
projection, and — since 6.4 — terrain, sky and colour relief. See the research notes in
`docs/research/2026-09-24_maplibre.findings.md` (to be written with task 1).

## Goal

The Present chapter is a MapLibre map: a self-hosted Protomaps basemap that works offline on the
exhibition laptop, the GHS-POP field as extruded cells with the same colour ramp, a ring that
grows out of Wat Ket to about 3,400 km with the counter reading the committed curve, a camera that
pulls back with the scroll, and a bowl in which a visitor pans, tilts and taps a cell for its
name, country and population. The Past and Futures chapters are untouched, and the switch between
them and Present is the same cut it is today.

## Approach

**A second renderer, behind the cut.** `PresentMap.tsx` owns a `maplibregl.Map` in a `<div>`
that mounts when the chapter is Present and unmounts when it is not. The three.js `Diorama` keeps
the other two views and stops rendering the circle. The page's chrome — topbar, rail, cards,
credits, explore bar — is shared and unchanged; only what is inside the stage changes. Two WebGL
contexts never coexist, because a view builds on first visit *and this one is torn down on
leave* — MapLibre's map is cheap to recreate against a cached PMTiles file, and holding a second
context through the other chapters is exactly the "pay for a world nobody is looking at" this
project forbids.

> **Flat, not globe — Yan, 24 Sep 2026, on seeing it.** The paragraph below is the argument
> for the globe and is kept for the record; the map is Mercator. The ring is still a circle
> of true distance, so on screen it bulges northward — that is what 3,400 km looks like on
> this projection, and it is drawn honestly rather than round. Two more from the same look:
> **the camera holds still through the stem** ("just see the circle expand as you scroll"),
> and **the density from the fit is the 512-cell field's**, 13 km — the 0.125° level starts
> at zoom 4 rather than 6, with 0.25° and 0.5° only for the two zooms below. Column height
> scales with zoom so the fit reads as the smooth density map the flat plane was.

**Globe, not Mercator.** The claim is a distance. A 3,400 km circle around Chiang Mai on a
Mercator map is an egg; on the globe it is a circle, and the distance rings are true. MapLibre
draws `fill-extrusion` on the globe, with one known quirk for very large polygons at low zoom
(issue #8248) that cells tens of kilometres wide do not trigger. The camera opens looking down on
Wat Ket, pitched, and pulls back to a globe with the circle on it. This replaces AEQD — the
projection was chosen to make the circle true, and the globe makes it true for free.

**The basemap is a PMTiles extract, bundled.** `pmtiles extract` of the Protomaps daily build,
whole world, zoom 0–6: about 35 MB, doubling per zoom. That is the file the laptop's static
export carries and serves from `public/`, so a venue wifi failure changes nothing. Phones stream
the same file by HTTP range request from the Vercel URL and only fetch the tiles they look at.
Styled with `@protomaps/basemaps`' `light` flavour, recoloured to the design tokens: land in
Warm White, water in the water role, boundaries in the muted ink, labels in IBM Plex Sans Thai
from the same `next/font` face — so the map is *ours* rather than a stock basemap with our data
on it. Attribution: Protomaps and OpenStreetMap, ODbL, which the credits panel already carries
for OSM.

**Population as cells in a vector layer.** A new script, `scripts/build-cells.py`, bins the same
GHS-POP tiles into a lat/lon grid of 0.25° — about 27 km at the equator, the same as the 256²
columns — within the 12,000 km world disc, and writes GeoJSON with `people`, `t` (log ramp
position) and `h` (cube-root height fraction) per cell. `tippecanoe` turns that into
`wat-ket.cells.pmtiles` at zoom 0–7, a few MB, committed under `src/scenes/` like every other
distilled artefact, byte-identical on re-run. A `fill-extrusion` layer draws it: height from
`h`, colour from `t` through the population ramp as a MapLibre interpolate expression, so the
ramp is still `theme.ts`'s.

**The ring is a GeoJSON source updated per scroll tick.** A geodesic circle around Wat Ket at
`ringKm`, 256 vertices, as a line layer in the accent colour and muted past the claim; the cells
outside it are dimmed by a `fill-extrusion-opacity` or colour expression against a distance
property written at build time (each cell carries its great-circle distance from Wat Ket, so
"outside" is a comparison, not a computation). The counter is the same DOM readout, reading the
same curve.

**Scroll drives the camera through `jumpTo`.** A ring beat interpolates centre, zoom and pitch
between its pose and the next beat's, exactly as `poseBetween` does for three.js, and applies
them with `map.jumpTo` per tick. Beats without a ring `easeTo` over the beat duration. Poses in
the score become `{ zoom, pitch, bearing, centre }` for the Present chapter — the `Beat` type
gains an optional `mapPose`, validated only for circle beats, so the other chapters' scores are
untouched.

**The bowl.** MapLibre's own drag, scroll-zoom and touch-pitch, enabled on release and disabled
during the stem — the same switch `interactive` is today. Tap or hover a cell → the readout, from
the cell's own properties plus `citiesInCell` against the city file, which keeps its `km`
coordinates and gains lat/lon. The distance-from-Wat-Ket shown is the cell's stored distance.

**What is retired.** `RegionPlane.tsx`, `RegionColumns.tsx`, `columns.ts`, the AEQD rasters and
their sidecars, `regionScale`/`circleBounds`/`stageFit` in `camera.ts`, and the circle branch of
`Diorama.tsx`. `aeqd.ts` stays for the anchor arithmetic and the curve generator. The one-day-old
columns are the cost of finding out; they go with the plan's Outcome saying why.

**Rejected: Mapbox GL.** Same API family, but a token, a metered service and a licence that does
not allow self-hosting the tiles — the offline laptop rules it out on its own.

**Rejected: deck.gl over MapLibre.** A column layer with better shading, at the price of a third
rendering library in the bundle. MapLibre's `fill-extrusion` is what the reference piece uses and
is enough.

**Rejected: keeping three.js and drawing a land mask.** The spare blue channel in the field was
reserved for exactly this, and a coastline alone would have helped. But coastline, borders,
relief and labels are four projects, and the fourth — labels at every zoom — is the one a
visitor misses most. A basemap is all four, maintained by other people.

## Tasks

- [ ] ~~Research note~~ — folded into this plan's Context and the diary; not written separately + fill-extrusion, PMTiles protocol, Protomaps extract
      sizing, style flavour recolouring — `docs/research/2026-09-24_maplibre.findings.md`
- [x] `pmtiles` CLI installed; `scripts/fetch-basemap.sh` extracts the world at zoom 0–6 to
      `public/basemap.pmtiles`, gitignored, with the build date pinned and recorded
- [x] `scripts/build-cells.py` — GHS-POP → 0.25° cells with `people`, `t`, `h`, `distKm` →
      GeoJSON → `tippecanoe` → `src/scenes/wat-ket.cells.pmtiles`; byte-identical on re-run;
      total conserved against the field's own total
- [x] `maplibre-gl`, `pmtiles`, `@protomaps/basemaps` added; the PMTiles protocol registered once
- [x] `engine/mapstyle.ts` — the basemap style from the flavour, recoloured from `theme.ts`;
      pure, tested for "no raw hex", fonts from the Plex face
- [x] `PresentMap.tsx` — the map in the stage for the Present chapter, globe projection, cells
      layer, ring source, the anchor at Wat Ket
- [x] `Beat.mapPose` and `mapPoseBetween` in `chapters.ts`; the Present score rewritten
- [x] Scroll → `jumpTo`; beat change → `easeTo`; release → interaction on
- [x] The readout on hover/tap, from cell properties and `citiesInCell`
- [x] Retire the three.js circle: `RegionPlane`, `RegionColumns`, `columns.ts`, the circle branch
      of `Diorama`, `regionScale`/`circleBounds`/`stageFit`; their tests with them
- [x] Credits: Protomaps added beside OSM
- [ ] Measure: bundle delta, first paint of the Present chapter on the laptop, and on a phone over
      the Vercel URL; record in `docs/architecture.md`'s perf table
- [x] `docs/architecture.md` "Three views", `CLAUDE.md` stack section (a second renderer,
      behind the cut), handover

## UI mockups (ASCII)

**Base — Wat Ket, close, pitched.** The basemap: the Ping, the ring road, Doi Suthep's shading.

```
┌──────────────────────────────────────────┐
│ PRESENT                ◉ Past ━ ◉ Present │
│ The circle                               │
│         ░░░░ Doi Suthep ░░░░             │
│              ╱ Chiang Mai ╲              │
│             │   · Wat Ket   │            │
│              ╲   ~~Ping~~  ╱             │
│   ┌──────────────────────────────┐       │
│   │ HERE                         │       │
│   │ Half of everyone alive is    │       │
│   │ closer than you think.       │       │
│   └──────────────────────────────┘       │
└──────────────────────────────────────────┘
```

**Stem — the ring grows, the globe comes up.** Cells inside the ring in the ramp, outside dimmed.
The counter under the card.

```
┌──────────────────────────────────────────┐
│            ╭─────────────╮               │
│          ╭─╯ ▂▃▅▇█▆▃ ▂  ╰─╮              │
│      Delhi│ ▂▅███████▇▅▃   │Shanghai     │
│          ╰─╮  · Wat Ket  ╭─╯             │
│            ╰─────────────╯   ░ dimmed ░  │
│   ┌──────────────────────────────┐       │
│   │ 2,000 KM                     │       │
│   │ A fifth of everyone          │       │
│   └──────────────────────────────┘       │
│        2,000 km   1.61 bn   20%          │
└──────────────────────────────────────────┘
```

**Bowl — released.** Drag, pinch, tilt; a cell answers.

```
┌──────────────────────────────────────────┐
│     ╭──────────────────────╮             │
│    ╭╯    ▂▃ ▅▇█▆▃ ╭──────────────╮       │
│    │  ▂▃▅███████▇▅│ Dhaka        │       │
│    │     ▃▅█▇▅▃ · │ Bangladesh   │       │
│    ╰╮   ▂▃▅▃▂     │ 22,478,116   │       │
│     ╰─────────────│ 1,530 km     │       │
│ (i)  ← Story       Drag to pan, pinch to zoom, two fingers to tilt.   [Futures →]│
└──────────────────────────────────────────┘
```

States that differ: **basemap not yet loaded** — the base holds on the ground colour and the
ring does not start until the cells source has loaded; **offline on a phone** — the basemap fails
to fetch, the cells and the ring still draw over the ground colour and the caption says so;
**stem interrupted** — `Escape` jumps to the end state, as today.

## Keyboard interaction

1. **Tab order** — rail, stage (the map container, `role="application"`, focusable), credits,
   `← Story`, `Next →`. Unchanged.
2. **During the stem** — `Space`/`→` advance a beat, `←` back, `Escape` releases. Unchanged; the
   page owns these, not the map.
3. **In the bowl** — MapLibre's own keyboard handler: arrows pan, `+`/`-` zoom, `Shift`+arrows
   tilt and rotate. `Enter` on a focused cell is not something MapLibre offers; the readout is
   pointer-driven, and a keyboard visitor gets the caption's claim. Filed as a follow-up.
4. **Focus** — stays on the stage across stem and bowl; the readout is `aria-live="polite"`.

## Test list (TDD)

- `build-cells.py`: cells conserve the field's total within rounding — script self-check,
  asserted in `region.test.ts` against the committed cells' summary sidecar
- `build-cells.py`: byte-identical `.pmtiles` on re-run — recorded in the sidecar, asserted
- every cell's `distKm` equals the great-circle distance from the scene origin to its centre —
  unit, `cells.test.ts`, over a sample of the committed cells
- `mapstyle.ts`: every colour in the emitted style resolves to a `theme.ts` token — unit,
  `mapstyle.test.ts`; the "no raw hex" rule carried to the map
- `mapstyle.ts`: the style names the Plex face and no other — unit
- `mapPoseBetween`: pinned at both ends, zoom in log space, centre by great-circle interpolation —
  unit, `chapters.test.ts`
- `validateScore`: a `mapPose` on a non-circle beat is an error — unit
- `ringAt` unchanged and still used — the existing tests stand
- the Present score's beats still join the doc's copy by id — the existing `scores.test.ts`

## Verification

1. `npm run fetch:basemap`, then `npm run dev`, `2` — the map opens close on Wat Ket, pitched, with
   the Ping and the ring road drawn in the design tokens and IBM Plex labels. No stock-basemap
   blue.
2. Scroll — the ring grows from Wat Ket, cells outside it dim, the globe comes up under it, the
   counter climbs. At the end of `grow` the ring reads about 3,400 km and about half.
3. `Escape` — the bowl. Drag, pinch, two-finger tilt. Tap Dhaka — name, country, population,
   distance from Wat Ket.
4. `1` and `3` — the valley and the city are exactly as before; back to `2` rebuilds the map in
   under a second against the cached file.
5. Disconnect the network on the laptop and reload `out/` — the map still draws.
6. On a phone over the Vercel URL — the map draws; note what the first paint cost.
7. `npm test`, `npm run typecheck`, `npm run build` clean; the bundle delta recorded.
8. Yan judges it against the Pudding piece and the printed A0.

## Out of scope

- Past and Futures on MapLibre. The valley is a DEM in a hillshade and the city is a diorama of
  68,704 buildings with a raster backdrop; both are three.js on purpose and neither gains from a
  basemap. If Futures' valley pins ever want borders and names, that is a new plan.
- Terrain under the circle (MapLibre `raster-dem`). The basemap's hillshade is not part of the
  Protomaps build; a terrain source is a second file and a second decision.
- Thai labels. The Protomaps build carries `name:th` where OSM has it; switching the style's
  label field on locale is one expression and waits for the copy pipeline's Thai tab.
- Any change to the copy pipeline or the scores of the other chapters.

## Open questions

- [x] Zoom 0–6 — 45 MB, committed. Decided by doing; 7 waits for a reason.
- [x] Flat, not globe; camera fixed through the stem; 13 km cells from the fit. Yan, on seeing it.
- [x] Squares: `h3` would not build on this machine, and a lat/lon grid needs no dependency.
- [x] Labels are DOM markers from the city file, not symbol layers — no glyphs to self-host.
- [ ] ~~Zoom 0–6 or 0–7 for the extract?~~ 6 is 35 MB and enough to read a delta; 7 is 70 MB and
      reads a city's shape. The laptop does not care; the phone streams either. Decide by looking.
- [x] ~~Cells as a 0.25° lat/lon grid or H3 hexes?~~ squares, see above Squares match the existing 256² columns and need
      no dependency; hexes are what the Pudding used and read better as terrain. `h3` is a
      `pip install` away. Leaning hexes at resolution 3 (about 60 km) or 4 (about 23 km).
- [x] Keeps growing, muted past the claim. ~~Does the ring keep growing past the claim into the muted tone, as the columns do now, or
      stop at the claim with the flattening stated in the card? Carried over from the Present plan.
- [x] Dropped. ~~The field's old 3,437 km rim, currently drawn as a ghost of the original radius — kept as a
      second ring, or dropped now that the basemap gives the eye something else?

## Outcome

_Pending._
