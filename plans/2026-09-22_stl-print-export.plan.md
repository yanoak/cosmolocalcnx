---
slug: 2026-09-22_stl-print-export
status: done
started: 2026-09-22
finished: 2026-09-22
issue:
---

# A hidden route that prints Wat Ket

## Context

The exhibition wants a physical object beside the screen: a 3D print of the diorama. The scene
document already holds everything a print needs — footprints in metres, heights, water, green,
road polylines — and `merge.ts` already turns footprints into solids for the GPU. Nothing about
the schema changes; this is a second consumer of the same baseline, the way
`scripts/render-backdrop.ts` is.

Three constraints shape the whole thing:

1. **`output: 'export'` — there is no server.** The STL has to be built in the browser and handed
   to a download, and there is no auth to hide the route behind. "Hidden" therefore means *absent
   from the deployed build*, not *protected*.
2. **The printer is a Bambu A1 mini: 180 × 180 × 180 mm.** Wat Ket's near geometry alone is
   2.5 km across. One plate cannot hold it at any scale worth printing, so the model is **tiled**
   and each tile is its own STL.
3. **Scale eats buildings.** At 1:12,500 the median Wat Ket building (5.08 m) is 0.4 mm tall —
   below a 0.4 mm nozzle. Vertical exaggeration is not a nicety here, it is the difference
   between a city and a flat card. The valley view already exaggerates four times and says so in
   its caption; the print does the same and prints the figure on the sheet.

Decided with Yan on 22 Sep 2026: the route is dev-and-local-export only, the model carries water,
green and roads as well as buildings, and the download gives both a combined STL per tile and one
file per layer.

## Goal

At `/print`, on a machine running `npm run dev` or a locally built export, an internal user picks
a centre, a scale, a vertical exaggeration and a maximum tile size, sees a plan of exactly what
will print and how it tiles, and downloads a zip of binary STLs — one combined file per tile plus
one file per layer per tile — that slice without repair in Bambu Studio and fit an A1 mini's bed.
`watket.vercel.app/print` is a 404, because the Vercel build never sees the directory.

## Approach

**The route is excluded by `.vercelignore`, not by an env flag.** The `.vercelignore` file already
exists and already keeps `data/` and `docs/programme-context.md` out of the upload, and Vercel
builds from what it is sent. Adding `src/app/print/` there means the deployed export contains no
`/print` HTML and no chunk — nothing to find and nothing to read. An `NEXT_PUBLIC_*` guard was the
obvious alternative and is weaker: the page, its JavaScript and the scene import all still ship,
and the gate is one line of client code away from being flipped by anyone who looks. The exhibition
laptop builds locally, so it keeps the tool.

**All the maths is pure and lives in `src/engine/`; the route is a form over it.** Three new
modules, each testable without a DOM or a GPU:

- `stl.ts` — triangle soup to binary STL. Facet normals from winding, because a slicer that
  disagrees with a stored normal trusts the winding anyway.
- `zip.ts` — a store-only (uncompressed) zip container, ~70 lines and no dependency. Sixteen
  separate download clicks is not a thing to hand someone on install day.
- `print.ts` — the model: crop, tile grid, scale, the plate outline with its interlocking tabs,
  and each layer's extrusion into millimetres.

**Print space is millimetres, Z up, and is deliberately not the renderer's convention.** Footprints
are `[x = east, y = north]`; `THREE.ExtrudeGeometry` builds in XY and pushes along +Z; slicers
treat +Z as up. So the print pipeline applies *no rotation at all*, where `Buildings.tsx` rotates
−90° about X to get three.js's −Z-is-north. Two conventions, each serving its own consumer, and
the comment in `print.ts` says which is which — this is exactly the "invisible until everything is
100× too big" class of bug that `docs/architecture.md` fixes units for.

**Buildings share the viewer's winding normalisation and the viewer's triangulator**, through
`footprintToExtrudeArgs` and the same `THREE.ShapeUtils.triangulateShape` that `ExtrudeGeometry`
calls internally. A print that disagreed with the screen about what a building is would be a
second renderer, which is the failure mode CLAUDE.md names. three.js runs headless under vitest —
`merge.test.ts` already proves it — so this stays testable.

*Revised during implementation.* This started as a straight call to `merge.ts`'s
`buildingGeometry`, which is the most literal way to share the extrusion. It does not survive
clipping: `ExtrudeGeometry` raises its walls from the RING, and a footprint the tile seam cuts in
two comes back from `clipRingToConvex` as two pieces joined by a zero-width neck — which earcut
correctly drops from the caps. Walls then follow an outline the caps do not, and the solid has
open edges. `solid()` raises walls on the cap triangulation's own boundary instead, which cannot
disagree with it. See the Outcome.

**Clipping is `clip.ts`'s `clipRingToConvex` against `rectRing`**, which is already written and
already tested. A tile rectangle is convex, so Sutherland–Hodgman is exactly right, and everything
— buildings included — is cut flush at the tile edge rather than overhanging the plate.

**Roads are segment boxes, not mitred ribbons.** `bridges.ts` has `ribbon()`, which would give a
single continuous polygon per road, but a mitred ribbon self-intersects at sharp corners and earcut
turns that into confetti. One box per segment cannot self-intersect, overlapping solids union
cleanly in every slicer, and a width filter keeps the count sane: 21,186 segments at width ≥ 6 m
against 36,460 for everything.

**Tiles interlock with tabs cut into the plate outline, not with pegs and sockets.** A peg needs a
hole, a hole needs a boolean, and a boolean needs a CSG library the project does not have. A tab on
the east and north edges with a matching (clearance-widened) notch on the west and south is a 2D
polygon operation on the plate ring before extrusion — no CSG, and it survives being a pure
function with a test.

### Rejected

- **A server route that renders the STL.** Kills the static export, which the exhibition machine
  depends on.
- **Exporting the live three.js scene graph.** The scene graph is rotated, merged, tinted and
  vertex-coloured for the GPU, and half of it (the backdrop, the relief) is a raster that means
  nothing to a printer. Building from the document is less code and more correct.
- **Recessing water into the plate.** Wants CSG. Raised pads read fine at these scales and cost
  one extrusion.
- **A circular crop.** A round plate cannot tile, and the clipper has to stay convex and
  rectangular for the tiles anyway.

## Tasks

- [x] `src/engine/stl.ts` + tests — binary STL encoding, facet normals, degenerate rejection
- [x] `src/engine/zip.ts` + tests — CRC32 and a store-only zip container
- [x] `src/engine/print.ts` + tests — scale, tile grid, plate ring with tabs, layer extrusion
- [x] `/print` route, `.vercelignore` entry, controls, plan preview, download
- [x] CLAUDE.md and README notes
- [x] Bridges as a sixth layer, solid to the plate (asked for 23 Sep, after the rest shipped)
- [ ] **Slice a tile in Bambu Studio and print one.** The only step that needs the
      machine, and the two open questions below are what it answers.

## UI mockups (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Wat Ket — print                        internal · not on the public URL │
├────────────────────────────────┬─────────────────────────────────────────┤
│  PLAN (top-down, north up)     │  Centre        x [    0 ] y [    0 ] m  │
│                                │  Extent        [ 2500 ] m square        │
│   ┌───────────┬───────────┐    │  Scale         1: [ 7143 ]  → 350 mm    │
│   │ ░░▓▒░░░░  │ ░░░▓▓░░   │    │  Max tile      [ 175 ] mm  (A1 mini 180)│
│   │  ░░▒▒▒░   │  ▒░░░░▓   │    │  Exaggeration  [ 3.0 ] ×                │
│   │ r1c1      │ r1c2      │    │  Plate         [ 2.0 ] mm               │
│   ├───────────┼───────────┤    │                                         │
│   │ ░▓░░╱╱░░  │ ░░░░░░░   │    │  Layers   [x] buildings  [x] water      │
│   │ ░░╱╱▒░░   │ ▒▒░░░░░   │    │           [x] green      [x] roads ≥[6]m│
│   │ r2c1      │ r2c2      │    │  Tabs     [x] interlocking, 0.2 mm gap  │
│   └───────────┴───────────┘    │  Source   (•) near geometry ( ) full    │
│                                │                                         │
│   2 × 2 · 175 mm, 179 on bed   │            [ Build model ]              │
├────────────────────────────────┴─────────────────────────────────────────┤
│  BUILT                                        413,022 △ · 19.7 MB        │
│  Tallest solid 44.1 mm · median building 2.1 mm · thinnest wall 0.6 mm   │
│                                                                          │
│  r1c1  118,440 △  5.6 MB   [combined] [buildings] [water] [green] [roads]│
│  r1c2   97,112 △  4.6 MB   [combined] [buildings] [water] [green] [roads]│
│  r2c1  110,904 △  5.3 MB   [combined] [buildings] [water] [green] [roads]│
│  r2c2   86,566 △  4.1 MB   [combined] [buildings] [water] [green] [roads]│
│                                                                          │
│                     [ Download all as zip (19.7 MB) ]                    │
└──────────────────────────────────────────────────────────────────────────┘
```

States that differ materially:

- **Before Build** — the BUILT band reads `Nothing built yet. The plan above is live.` and the
  download buttons are absent rather than disabled.
- **Building** — the button reads `Building…` and is disabled; the plan stays on screen.
- **Warning** — a tile over 180 mm, an exaggeration under 1, or a median building below 0.4 mm
  puts a warning line above the Build button in `ui.warn`. It warns, it does not block: somebody
  printing a 1:25,000 study of the street pattern knows what they are doing.
- **Empty crop** — `No geometry in this crop.` where the tile list would be.

## Keyboard interaction

1. **Tab order** — follows the DOM: every control in the right column top to bottom, then
   Build, then, once built, each tile's five download buttons in row order, then Download all.
   The plan canvas is not focusable; it is a readout, not a control.
2. **Shortcuts** — `Enter` from any number field builds (the form's submit). `Escape` clears a
   built model and returns to the plan. No single-letter shortcuts: every one of them would be a
   keystroke into a number field.
3. **Focus management** — on build, focus moves to the BUILT heading (`tabIndex={-1}`, so the
   stats are announced before the download buttons). On clear, focus returns to Build.

## Test list (TDD)

- [ ] a unit cube encodes to 12 facets, an 84-byte header and 50 bytes per facet — `stl.test.ts`
- [ ] the facet normal comes from winding, not from the caller — `stl.test.ts`
- [ ] a degenerate (zero-area) triangle is dropped rather than written with a NaN normal — `stl.test.ts`
- [ ] header is exactly 80 bytes, truncated or padded, and never overruns into the count — `stl.test.ts`
- [ ] CRC32 of `"123456789"` is `0xCBF43926` — `zip.test.ts`
- [ ] a one-file zip round-trips: local header, central directory and EOCD offsets agree — `zip.test.ts`
- [ ] zip entry sizes and CRCs match the payloads for several files — `zip.test.ts`
- [ ] `tileGrid` splits 350 mm at max 175 into 2 × 2 of exactly 175, not 3 tiles — `print.test.ts`
- [ ] `tileGrid` never returns a tile over the maximum, for a range of awkward sizes — `print.test.ts`
- [ ] a tile's metre bounds tile the crop exactly: no gap, no overlap — `print.test.ts`
- [ ] `mmPerMetre` and the scale denominator are reciprocal — `print.test.ts`
- [ ] building height in mm = height × exaggeration × mmPerMetre, plus the embed — `print.test.ts`
- [ ] the plate ring has a tab on shared edges and a notch on the other side of the same seam — `print.test.ts`
- [ ] the notch is wider than the tab by exactly the clearance — `print.test.ts`
- [ ] an edge with no neighbour gets neither tab nor notch — `print.test.ts`
- [ ] a building wholly outside a tile contributes no triangles — `print.test.ts`
- [ ] a building straddling a tile edge is cut flush at it: no vertex beyond the tile — `print.test.ts`
- [ ] every layer's solid sits at or below the plate top and above the plate bottom — `print.test.ts`
- [ ] a building whose footprint cannot be extruded is skipped, not fatal — `print.test.ts`
- [ ] the road filter keeps width ≥ threshold and drops the rest — `print.test.ts`
- [ ] the whole model is deterministic: same options, byte-identical STL — `print.test.ts`

## Verification

1. `npm run dev`, open `/print`. The plan draws Wat Ket top-down with a 2 × 2 grid over it.
2. Tab from the centre field to Build without a mouse; every control is reachable in the order the
   mockup lists.
3. Set exaggeration to 0.5. The warning line appears and Build still works.
4. Build at the defaults. Stats appear, focus lands on the BUILT heading, four tiles are listed.
5. Download the zip. `unzip -t` reports no errors; it holds 4 combined + 16 layer files.
6. Open `r1c1_combined.stl` in Bambu Studio with an A1 mini profile: it fits the bed without
   scaling, reports no errors needing repair, and the river reads as a raised band.
7. Confirm the tabs interlock. Every STL is in its OWN tile's coordinates, sitting on
   the bed origin so it can be sliced as it is — so importing all four at once stacks
   them rather than laying out the district. Either arrange them in the slicer, or
   measure: r1c1 runs 0–179 mm in X against a 175 mm plate (a 4 mm east tab) and
   0–175 in Y, while r2c2 runs 0–175 in X and 0–179 in Y (a 4 mm north tab).
8. `npm run build` with `src/app/print/` temporarily moved aside — the export builds clean, which
   is what the Vercel build will do.
9. `npm run build` as committed, then confirm `out/print/index.html` exists locally.

## Addendum — bridges, 23 Sep 2026

Asked for the day after the rest shipped: the print needs the bridges, and **they should
protrude with no empty space below them**.

That second half is the whole design. `bridges.ts` builds a deck on piers with a void
underneath, which is right on screen and wrong on a plate: a span 2.5 mm over the plate with
air beneath it is an overhang the slicer fills with supports, under every bridge, and the
deck snaps when they come off. So the print reads `deckStations`' `top` and ignores its
`bottom` — the underside of a printed bridge IS the plate. It is a causeway, not a bridge,
and that is the honest trade at this scale.

Consequences worth writing down:

- **The ramp had to slope, so `solid()` now takes a height FIELD as well as a height.** A flat
  top per segment would step down to the bank instead of ramping, and a step is both uglier
  and a worse overhang than the thing being avoided. The field is linear over the footprint,
  which keeps the top face planar, so the fan over the cap stays honest and the cap-boundary
  walls still close. A clipped corner gets the height the ramp actually has at that point,
  interpolated along the span axis.
- **Nothing may sit below the plate.** `deckStations` buries its ramp ends at −0.6 m to hide a
  cut edge under the ground; on a plate that is a solid dangling below the bed. Every vertex
  is clamped to the plate floor, and a test checks it.
- **The ramp ends at road level**, not at the plate, so a bridge and the street it carries are
  one continuous solid.
- **`roadMinWidthM` does not apply to bridges.** That threshold is a triangle budget for the
  scene's 36,460 road segments. There are 48 bridges, seven of the twelve inside the default
  crop are 2 m footpaths over the canals, and dropping them loses most of how the riverbank is
  actually crossed. What makes a thin deck printable is `MIN_BRIDGE_MM`, which widens any deck
  under 1 mm until it prints — a 2 m footpath becomes 7 m of model. That is a visible
  distortion and it is stated in the download's README, like the height exaggeration.

Costs 472 triangles across the four default tiles. Every bridge solid is watertight, including
the ones the tile seams cut.

## Out of scope

- **Any change to the scene schema.** The print reads the baseline; it writes nothing back.
- **Elevation under the city.** The plate is flat because Wat Ket is flat. This is not a way in
  for `terrain`, and nothing here takes a relief field.
- **Printing the valley or the circle.** Different data, different object, and a hillshade is not
  a solid. If the valley is ever wanted as a relief model it is its own plan.
- **Colour.** Per-layer files are what a multi-material print needs; AMS assignment is the
  printer's business, not ours.
- **A link to the route from anywhere.** It is unlinked on purpose.

## Open questions

- [ ] Does a 0.6 mm raised road read at 1:7,143 on a 0.4 mm nozzle, or does it need 0.8?
- [ ] Do the tabs want more than 0.2 mm clearance in PLA at this size?

Both are answered by printing one tile, and neither is answerable at a desk.

## Outcome

Done on 22 Sep 2026, except the print itself. The tool is at `/print` on a dev server
or a local export, and the directory is in `.vercelignore` — a build with it moved
aside produces exactly the two routes it did before, which is what Vercel will do.

The default lands 2,500 m of Wat Ket at 1:7,143 as 2 × 2 plates of 175 mm, 179 mm on
the bed with their tabs, 46 mm tall, 154,316 triangles and 15.4 MB of STL. The median
building prints at 2.13 mm and none is under a 0.4 mm nozzle.

**Two things were learned that are worth more than the feature.**

The first is a geometry bug that would have shipped. Walls raised from a clipped
footprint's RING are not the same walls as the ones the cap's triangulation implies,
because `clipRingToConvex` joins a shape it cut in two with a zero-width neck and
earcut then — correctly — drops it. One of Wat Ket's 7,588 buildings does this at the
default crop, and `ExtrudeGeometry` gave it eight open edges: a model a slicer asks to
repair. `solid()` therefore raises walls on the edges the triangulation actually left
exposed, which cannot disagree with it whatever the ring did. Every layer of every tile
is now closed, and `openEdges` in the test file checks it on the shapes that cause it.
The cost was giving up `merge.ts`'s `buildingGeometry` as the shared call; what is
still shared — and is the part that matters — is `footprintToExtrudeArgs` and the same
earcut.

The second is smaller and more annoying. The form silently refused to submit, with no
error anywhere, because HTML5 `step` validation is `(value - min) % step` in binary
floating point: a 2 mm plate against `min=0.6 step=0.2` is a "step mismatch", since
(2 − 0.6) / 0.2 is 7.000000000000001. The form is `noValidate` and states its own
constraints.

Nothing in the scene schema changed, `terrain` is still `null`, and the print is a
second consumer of the baseline rather than a second renderer.
