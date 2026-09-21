---
slug: 2026-09-21_backdrop-lod
status: in-progress
started: 2026-09-21
finished:
issue:
---

# Level of detail — near geometry, far backdrop

## Context

The phone surface has been knowingly over budget since 19 Sep 2026, when the scene was extended
across the Ping to take in the whole old city. `plans/2026-09-19_extended-extent.plan.md` recorded
the decision with the numbers in hand; this plan is the promised repayment.

Measured today, on the committed document:

| | Now | Budget (`docs/architecture.md`) |
|---|---|---|
| Buildings | 68,704 | — |
| Triangles | 997k | ~100–150k |
| Scene document | 19.31 MB raw · 4.42 MB gzip | download under 10 MB, ideally 5 |
| Footprint vertices | 317,927 (mean 4.63/building) | — |
| First frame, laptop, static export | ~7 s | 200 ms to *something* |

The document is imported as a JS module in `src/app/page.tsx`, which is the specific thing the
19th's perf measurement pointed at: "December's level-of-detail item should start with loading the
scene as data rather than as a module."

**The decisive fact about this scene is that the camera never rotates.** `Diorama.tsx` sets
`enableRotate={false}` on an orthographic camera at a fixed isometric attitude — pan and zoom only,
because "touch is the primary input and a visitor who rotates the scene is lost". Under an
orthographic projection with a fixed orientation, zooming *is* a 2D scale of the projected image
and panning *is* a 2D translation. There is no parallax to get wrong. A pre-rendered image of the
city is therefore not a lossy stand-in for the geometry — it is the same picture, and the only
thing that degrades with zoom is resolution.

That property is what makes this plan cheap, and it is worth writing down because it is not
obvious and it would be destroyed by the first person who enables orbit.

## Goal

The viewer loads in the phone budget and renders in it: **under 150k triangles and under 5 MB
downloaded**, with all three registers intact and every existing behaviour — picking, the
crossfade, the on-ramp, the scenario toggle — unchanged. The committed scene document still
contains all 68,704 buildings; what the viewer ships is a derived artefact, generated and never
hand-maintained.

## Approach

**Geometry where there is content, image where there is context.** Buildings near the subject stay
real geometry; the rest is rendered once, offline, into a committed raster that the viewer draws as
a plane normal to the view direction. This is the hero/stock distinction `Buildings.tsx` already
draws, pushed one step further.

The split, measured by radius from the scene origin:

| Geometry kept | Buildings | Triangles | Share of total |
|---|---|---|---|
| r ≤ 1,000 m | 5,058 | 74k | 7% |
| **r ≤ 1,250 m** | **7,588** | **112k** | **11%** |
| r ≤ 1,500 m | 11,186 | 165k | 17% |
| everything | 68,704 | 997k | 100% |

**1,250 m is the September radius** — 112k triangles, inside the 100–150k budget, and close to the
pre-19-Sep scene which sat comfortably at 61k. It is a *proxy*, not the real rule: the real rule is
that heroes are always geometry, and heroes are the buildings a hotspot points at. The partition
function takes both, so when item 5's content lands the radius stops being load-bearing and a
hotspot 3 km out still gets real geometry.

### What the roadmap says against this, and why it does not apply

`docs/roadmap.md`, under *Device reach*, explicitly rejects pre-rendered raster: it "needs
hand-maintained hit regions, an image set per scenario and zoom level, and hotspot coordinates kept
in sync by hand — three things that rot the first time someone moves a building."

That objection is about **who maintains the image**, not about whether the image is correct. Every
one of the three rots only if a human draws the picture. Generated from the scene document by a
script in the pipeline, hit regions and hotspot positions are derived and cannot drift — the same
move this codebase already makes for heroes ("deliberately derived rather than stored… deriving it
means they cannot drift") and for bridges on the 19th ("a generator, not models").

The roadmap's own preferred alternative — "render the *same scene document* to SVG or Canvas 2D
with a painter's-algorithm isometric projection" — is, in fact, exactly the generator this plan
builds. It is used to make a backdrop rather than a second interactive renderer, so the "no second
renderer" non-goal stands untouched.

The roadmap also already wants a still-render pipeline, budgeted at half a day, because it "pays
for itself whatever the device test says": panel stills for 25 Sep, the QR landing preview and
share card, a loading image the 3D swaps in behind, and the emergency fallback. **This plan builds
that pipeline and takes the level-of-detail win as its first customer.**

### Routes considered and rejected

- **Image only, drop the block register.** Smallest and simplest. Rejected: at block fit, covering
  the extent needs 1.07 Gpx on a phone and 6.5 Gpx on the laptop — a tile pyramid, i.e. rebuilding
  a slippy map. Cutting block instead would take a third of the rail off the spine, and "one
  doorstep" is where the piece stops being a map.
- **Pure runtime culling, no image.** Keeps everything dynamic. Rejected: the 4.4 MB payload and
  the 12 MB of footprints still ship and still parse, which is most of the 7 s; and it produces
  nothing for the panels.
- **Render the far set to a texture in-browser at load, then discard the geometry.** Fixes steady
  state, not load — you still download and extrude 900k triangles once, on the device least able
  to afford it.
- **Headless WebGL for the generator** (`headless-gl`, or Playwright screenshots). Rejected: native
  build pain, and a GPU render is not reproducible across machines, which collides with the
  standing rule that a re-run against the same source must be byte-identical. A 2D scanline fill is.
- **SVG backdrop.** Byte-identical for free and resolution-independent. Rejected on size: ~61k
  buildings × 3 toned faces is ~180k path elements, which is bigger and slower to parse than the
  JSON it replaces.

### The generator

`scripts/render-backdrop.ts`. Painter's algorithm over the far set: sort by view depth, project
each footprint through the fixed isometric transform, fill the two camera-facing wall tones and
the roof.

**Planned as Python, written in TypeScript.** Python was the obvious choice — `build-region.py`,
`fetch-relief.py` and `fetch-buildings.py` are all Python, and they write committed rasters. But
those read GeoTIFFs and want numpy, whereas this one needs the partition in `lod.ts`, the tone rule
in `shading.ts` and the palette in `theme.ts`. Mirroring three engine modules in another language
is exactly the drift this plan spends its Context section arguing against, so the language followed
the dependencies rather than the file it sits next to.

The PNG is still written by hand, for the reason the top of `build-region.py` gives: an image
library's output varies by version, which would quietly destroy byte-identity.

**It writes tone indices, not colours.** Greyscale 8-bit, so the byte `getImageData` hands back IS
the index — exactly as `wat-ket.relief.png` stores metres and lets `theme.ts` own the hypsometric
ramp. The palette stays in `theme.ts`, so a brand change re-tints the backdrop without regenerating
it. The 16 Sep palette swap is the precedent: a baked RGB backdrop would have silently kept the
1967 PROGRESS colours while every other surface moved.

**Only buildings go in.** Roads are already a canvas texture and cost no triangles; water and green
are a few hundred flat polygons. Every one of the 997k triangles is a building, so buildings are
all the backdrop needs to take — and the ground plane keeps drawing the far roads underneath,
showing through wherever the raster is index 0.

### Depth slices, so the near disc is not wrongly in front

The backdrop is what the camera sees, so it is displayed on a plane **normal to the view
direction**, not on the ground. Far buildings behind the near disc are correctly occluded by a
plane drawn behind it; far buildings *in front of* the near disc are not — they would be hidden
where in a true render they would overlap it.

So the generator emits **two slices**, cut at the near set's depth extent along the view axis: one
drawn behind the near geometry, one in front. Two quads, two small rasters, and a whole class of
seam artifact removed rather than inspected for. The slice count is a parameter, defaulting to 2.

### The viewer payload

The generator also writes `wat-ket.viewer.json`: the near set plus the backdrop references, both
committed. The full document stays the source of truth for the editor and the generators; the
viewer fetches the derived payload **as data rather than importing it as a module**, which is the
19th's carried-forward item and what lets the static export stream it.

Estimated: ~1.3 MB of near buildings plus trimmed roads, well under 500 KB gzipped, against 4.42 MB.

### Pan clamping, and what the block register is for

At 2,048 px across the extent the backdrop is comfortable at district fit and roughly 25× under-
resolved at block fit. Rather than chase that with resolution, **the pan limit tightens
as the camera zooms in**, so block scale is reachable only over the near disc.

This is an honest reading of the register rather than a workaround: the block register is "a
shophouse, one doorstep", and the doorsteps this piece is about are in Wat Ket. The old city across
the river is context — it earns the district register, not the block one.

## Tasks

- [x] `lod.ts` + test — the pure partition: heroes always near, radius as the September proxy,
      deterministic order preserved so merge ranges stay in the order `idForFace` expects
- [x] `scripts/render-backdrop.ts` + `backdrop.ts` + test — the painter's-algorithm rasteriser,
      tone indices, depth slices, PNG + sidecar, byte-identical on a re-run. **Moved from Python
      to TypeScript** — it needs `lod.ts`, `shading.ts` and `theme.ts`, and mirroring three engine
      modules in another language is the drift this whole plan argues against.
- [ ] `backdrop` in the schema + `validateScene` + `src/scenes/backdrop/index.ts`, mirroring
      `relief`
- [ ] `BackdropPlane.tsx` — the view-normal quads, palette applied from `theme.ts`, inside the
      district group so it collapses with the district
- [ ] Generate and commit the artefacts; wire `Diorama.tsx` and drop the far set from the render
- [ ] Viewer payload: emit `wat-ket.viewer.json`, fetch it as data, remove the module import
- [ ] Pan clamp that tightens with zoom + test
- [ ] Docs: the budget table in `docs/architecture.md`, the reversal note in `docs/roadmap.md`
      under *Device reach*, and CLAUDE.md's "knowingly over budget" paragraph

## UI mockups (ASCII)

Nothing new appears on screen. What changes is what the pixels are made of.

DISTRICT register — near geometry over the backdrop planes:

```
 ┌────────────────────────────────────────────────────┐
 │ Wat Ket 2045          [Asia][Wat Ket][Street] [EN] │
 ├────────────────────────────────────────────────────┤
 │ ▒▒▒▒▒▒▒▒ backdrop slice: in front ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
 │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
 │ ▒▒▒▒▒▒▒▒▒▒▒▒  ╔════════════════╗  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
 │ ▒▒ old city   ║ ▓▓▓ near ▓▓▓▓▓ ║   ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
 │ ▒▒ (raster)   ║ ▓ geometry ▓▓▓ ║   ▒▒ raster ▒▒▒▒▒ │
 │ ▒▒▒▒▒▒▒▒▒▒▒   ║ ▓▓ r≤1250m ▓▓▓ ║  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
 │ ▒▒▒▒▒▒▒▒▒▒▒▒  ╚════════════════╝  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
 │ ▒▒▒▒▒▒▒▒ backdrop slice: behind ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
 ├────────────────────────────────────────────────────┤
 │ Wat Ket, 2045.                                     │
 └────────────────────────────────────────────────────┘
   The dashed box is NOT drawn — it marks where geometry
   takes over from raster. A visitor must not be able to
   see the seam; that is what Verification step 1 checks.
```

BLOCK register — pan is clamped to the near disc, so the backdrop is off-screen:

```
 ┌────────────────────────────────────────────────────┐
 │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
 │ ▓▓  ┌────┐   ▓▓▓▓▓   ┌──────┐  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
 │ ▓▓  │    │  ═══════  │      │  ▓▓  all geometry,   │
 │ ▓▓  └────┘   ▓▓▓▓▓   └──────┘  ▓▓  no raster in    │
 │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  reach          │
 └────────────────────────────────────────────────────┘
```

LOADING — the backdrop resolves before the near set, so the first thing on screen is a whole city
rather than a blank stage. This is the "something in 200 ms" the roadmap asks for:

```
 ┌────────────────────────────────────────────────────┐
 │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
 │ ▒▒▒▒▒▒▒ backdrop only — ~200 KB, no geometry ▒▒▒▒▒ │
 │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
 └────────────────────────────────────────────────────┘
```

## Keyboard interaction

Nothing focusable is added or removed. Tab order, the register chips, `1`/`2`/`3`, `D`, `W`,
arrows, `Escape` are all untouched.

One behavioural change, and it applies equally to keyboard, wheel and touch:

1. **Arrow keys step between buildings** (`ordering.ts`). They now step within the near set only,
   because the far set no longer has geometry to select. Previously they stepped through all
   68,704 — which was never a usable interaction and is not a loss worth preserving.
2. **`3` / the Street chip** jumps to the block register. If the camera is panned over the far
   city when it fires, it recentres onto the near disc rather than zooming into a blurry raster.
   Focus stays on the chip.
3. **Pan limits tighten with zoom.** No new key; the existing pan keys and drag simply stop at the
   clamp. At district fit and outward the clamp is the full extent, exactly as now.

## Test list (TDD)

- [ ] `partition` puts a building inside the radius in `near` — unit — `src/engine/__tests__/lod.test.ts`
- [ ] `partition` puts a building outside the radius in `far` — unit — `lod.test.ts`
- [ ] **a hero outside the radius is still `near`** — the rule the radius is only a proxy for — unit — `lod.test.ts`
- [ ] `partition` preserves document order within each group, so `idForFace`'s binary search still holds — unit — `lod.test.ts`
- [ ] `near ∪ far` is the input exactly, and `near ∩ far` is empty — unit — `lod.test.ts`
- [ ] radius 0 with no heroes gives an empty `near` and does not throw — unit — `lod.test.ts`
- [ ] an empty building list gives two empty groups — unit — `lod.test.ts`
- [ ] the partition is a pure function of its inputs — same input twice, identical output — unit — `lod.test.ts`
- [ ] depth-slice assignment: a far building beyond the near set's max depth goes to the `behind` slice — unit — `lod.test.ts`
- [ ] depth-slice assignment: one nearer than the near set's min depth goes to the `front` slice — unit — `lod.test.ts`
- [ ] the isometric projection used by the generator matches `camera.ts`'s `ISO_PITCH` attitude — unit — `src/engine/__tests__/backdrop.test.ts`
- [ ] backdrop world rectangle → plane position/scale round-trips: a world point maps to the same screen point through geometry and through the plane — unit — `backdrop.test.ts`
- [ ] tone index → palette colour covers every kind in `roleForKind`, with no unmapped index — unit — `backdrop.test.ts`
- [ ] a scene with no `backdrop` validates — absent is a valid state, as for `relief` — unit — `src/engine/__tests__/scene.test.ts`
- [ ] a `backdrop` naming a missing sidecar is rejected with the path in the message — unit — `scene.test.ts`
- [ ] `validateScene` still asserts `terrain === null` — the backdrop is not terrain — unit — `scene.test.ts`
- [ ] every existing `FORBIDDEN_EDIT_FIELDS` test still passes unchanged — unit — `scene.test.ts`
- [ ] pan clamp is the full extent at district fit and outward — unit — `src/engine/__tests__/registers.test.ts`
- [ ] pan clamp contains the near disc at block fit — unit — `registers.test.ts`
- [ ] pan clamp is monotone in zoom — no snap-back as the visitor zooms — unit — `registers.test.ts`

## Verification

1. **The seam is invisible.** At district fit on the laptop, pan across the boundary of the near
   disc in all four directions. Buildings must not change colour, tone or apparent height as they
   cross it, and no edge of the raster may be visible. This is the one failure that would read as
   broken to a visitor.
2. **Depth reads correctly.** Find a far building south-west of the near disc — between the camera
   and Wat Ket — and confirm it overlaps the near geometry rather than hiding behind it.
3. **The budget, measured not assumed.** Debug overlay reports triangle count and draw calls at
   district fit: **under 150k triangles, a few dozen draw calls**. Network panel on a hard reload:
   **under 5 MB transferred**.
4. **First paint.** Hard reload on the static export: something recognisable as a city on screen
   well before the near geometry arrives.
5. **Every register still works.** Circle → descent → 2026 → dissolve → 2045. No black frame in the
   band. Zoom to block over Wat Ket and confirm real geometry, not raster.
6. **Picking survives.** Tap a near building; the panel opens with the right id. Tap the raster;
   nothing is selected and nothing throws.
7. **Pan clamp.** At block fit, try to pan to the old city — the camera stops. Zoom out, pan there,
   zoom in — it recentres rather than magnifying the raster.
8. **`prefers-reduced-motion: reduce`** — unchanged, every tween still a jump cut.
9. `npm test && npm run typecheck`, and `npm run render:backdrop` twice → **byte-identical output**.
10. **On a real phone over the QR URL** — the device test roadmap item 1 has been waiting for. Load
    time on mobile data, frame rate at each register, and whether it throttles. This is the number
    that has been speculation since 12 Sep.

## Out of scope

- **A tile pyramid.** If the backdrop ever needs block-scale resolution, that is a slippy map and a
  December conversation. The pan clamp is the September answer.
- **A second interactive renderer.** Still no. The generator produces a still; it never runs in the
  browser and it never handles input.
- **Terrain.** `terrain` stays `null` and `validateScene` keeps asserting it. The backdrop is a
  projection of buildings, not a sampled surface — and it must not become the crack that lets
  elevation back in.
- **Regenerating OSM, Overture or relief data.** This plan reads the committed document and writes
  derived artefacts. No fetch script changes.
- **Simplifying footprints.** Mean footprint is 4.63 vertices; there is nothing to decimate. The
  triangle count is building *count*, which is what the partition addresses.
- **Instancing or draco.** Not needed once the far set stops being geometry, and both add build
  complexity three days before an opening.

## Open questions

- [ ] Does 1,250 m read as the right edge, or does the diorama want more of the river bank as real
      geometry? Judge it on screen at district fit, not from the table.
- [ ] Should the two scenarios share one backdrop? They almost certainly should — the 2045 edits
      are interventions in Wat Ket, which is the near set — but if any scenario edits something
      beyond 1,250 m, that scenario needs its own raster and the generator must take a scenario id.
- [x] **Answered: 2,048 px, and the deciding number is VRAM rather than disk.** The committed PNG
      is small either way (126 KB against 386 KB), but the browser expands an 8-bit greyscale
      texture to RGBA on upload, so both slices cost 19 MB of VRAM at 2,048 and 77 MB at 4,096.
      The phone is the binding surface. Looked at the 2,048 render through the real palette first:
      individual buildings, roof and wall tones and the disc edge all still read. The projector can
      have its own build via `--width` when there is a projector in the room to judge it on.

## Outcome

_Pending._
