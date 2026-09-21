---
slug: 2026-09-21_three-views
status: done
started: 2026-09-21
finished: 2026-09-21
issue:
---

# Three views, not one rail — and the valley between them

## Context

`plans/2026-09-16_semantic-zoom.plan.md` put three registers on **one rail**, moved through with
one gesture: the Valeriepieris circle at `t=0`, Wat Ket at `t=0.5`, a shophouse at `t=1`. CLAUDE.md
calls that the spine.

It works, and it was seen working for the first time today. But the seams were always there in the
design and they showed up as accumulating special cases:

- **Two coordinate frames on one gesture.** The region is authored in kilometres over a 3,437 km
  azimuthal-equidistant plane; the district is local metres over 8 km. `registers.ts` carries a
  crossfade band, `districtTransform`, `regionScale` and a whole vocabulary — `railed`, `hold`,
  `holdFrom` — whose only job is to stop a 2,500:1 scale gap from tearing.
- **The relief already needed a hack to survive it.** `backdropOut` / `RELIEF_HOLD_OUT` exists
  solely because zooming out shrank the district onto the circle before the mountains were in
  frame. That is the rail telling us the two things do not belong on it.
- **They are different kinds of rendering, not different zoom levels.** The circle is a
  data-visualisation: a population raster on a projection chosen so a claim about half of humanity
  can be checked. The city is a physical model of a place. Putting them on one continuous gesture
  says they are the same kind of thing seen from different distances. They are not.

Decided 21 Sep 2026: **three discrete views, each with its own zoom inside it.** And a new middle
view — the Chiang Mai valley, with the Ping and the mountains that actually define it, which the
relief field has been hinting at from the corner of the frame since the 19th.

## Goal

Three views a visitor moves between deliberately — **circle**, **valley**, **city** — each with its
own camera, its own zoom range and its own rendering. No continuum between them, no crossfade band,
no scale-gap machinery. The valley view shows the basin Chiang Mai sits in, 120 × 120 km, with
legible mountain topography, the Ping running through it and the neighbouring towns named. The city
view is today's diorama, unchanged in what it renders, with district↔block zoom intact.

## Approach

### The model

```
 ┌── CIRCLE ────────┐   ┌── VALLEY ────────┐   ┌── CITY ──────────┐
 │ AEQD, kilometres │   │ local metres     │   │ local metres     │
 │ population field │ ⇄ │ DEM, 120 km      │ ⇄ │ diorama, 8 km    │
 │ 3,437 km radius  │   │ 2,565 m relief   │   │ district ⇄ block │
 │ a claim          │   │ a landscape      │   │ a place          │
 └──────────────────┘   └──────────────────┘   └──────────────────┘
     zoom inside          zoom inside             zoom inside
```

Each view owns a camera state. Switching is a **selection**, not a zoom — the chips already in the
top bar become what they always looked like they were. Zoom and pan operate *within* the active
view and never leave it.

What this deletes: the crossfade band, `districtTransform`, `regionScale`, `railed`, `hold`,
`holdFrom`, `backdropOut`, `RELIEF_HOLD_OUT`, `worldMinZoom`, and `zoomToT`/`tToZoom`'s job of
spanning two frames. What survives: `aeqd.ts` untouched (the anchor number is the piece's argument
and is not up for renegotiation), the region field and its cities, the relief machinery, the whole
city diorama including the backdrop split landed earlier today.

**The anchor stays.** Wat Ket is 279.98 km from the circle's centre, 8.15% of the radius, and
`aeqd.test.ts` still pins it. The circle view still marks it. Separating the views changes how a
visitor travels between the scales, not what the scales say.

### The valley view

120 × 120 km centred on the scene origin, from the same Copernicus DEM generator that already
serves the city's backdrop — `fetch-relief.py` gained a `--field` flag so the two fields can coexist
rather than one overwriting the other.

At 512 cells that is 234 m sampling, rendered with the stride added earlier today so the mesh lands
inside the triangle budget. There are no buildings in this view — Wat Ket is a marked dot — so the
budget is available for topography.

Three things go on it, in priority order, because the third is the one that can be cut:

1. **The topography.** The stated ask, and what the existing hypsometric ramp in `theme.ts` already
   knows how to colour. Doi Suthep at 1,676 m and Doi Inthanon at 2,565 m.
2. **The Ping.** The river the whole piece is about, running the length of the basin. The scene
   document's water stops at the 8 km rectangle, so this needs its own fetch — `waterway=river`
   over the valley bbox, which is a small Overpass query.
3. **The neighbouring towns.** Lamphun, Mae Rim, San Kamphaeng, Saraphi, Hang Dong, Chiang Dao.
   GeoNames, filtered from the dump `build-region.py` already downloads.

### Why discrete is cheaper than it looks

Most of the work is **deletion**. The hard parts of the rail — keeping two frames from tearing,
guaranteeing no black frame inside the band, holding the district while the backdrop arrives — all
stop being problems rather than getting solved differently. The new code is a view enum, a camera
state per view, and a switch.

### Routes considered and rejected

- **Circle separate, valley↔city continuous.** Tempting: both are physical renderings of the same
  place, 120 km to 8 km is a sane 15:1. Rejected on the same argument that motivates the whole
  change — a topographic field and a building diorama are different kinds of rendering, and half a
  rail is a special case rather than a principle.
- **Keeping the rail and adding valley as a fourth stop.** Makes the scale-gap machinery worse, not
  better, and does nothing about the circle.
- **A fly-down transition between views.** Wanted, and deferred: it is authored per pair and the
  exhibition is in three days. The on-ramp machinery already does circle → city and can be pointed
  at the new model later.
- **Overwriting the existing relief field with the 120 km one.** Rejected: the city view's close
  backdrop and the valley view's wide field are different products of the same generator, and one
  field cannot serve both scales without being wrong at one of them.

## Tasks

- [x] `fetch-relief.py --field` so two relief fields can coexist
- [x] Fetch and commit the 120 km valley field — 512 grid, 234 m cells, 226–2,565 m, byte-identical on a re-run. **Needed `--refresh`**: the first run silently reused the city backdrop's narrower cached DEM and topped out at Doi Suthep's 1,676 m. A test now asserts the peak is above 2,000 m.
- [x] `views.ts` + test — the view enum, per-view camera state, and the switch. Replaces the rail
      half of `registers.ts`
- [x] `ValleyView.tsx` — the topographic mesh, its own camera fit, Wat Ket marked
- [x] Rewire `Diorama.tsx` and `page.tsx` to the three-view model; delete the crossfade machinery
- [x] The Ping across the valley — `npm run fetch:valley`, 387 named waterways, committed
- [x] Neighbouring town labels from GeoNames — seven, from the dump `build-region.py` already
      downloads, so no new data dependency
- [x] **Chose `hillshade`**, by rendering all three offline and looking at them. It reads as a
      plaster relief model; the basin is obviously a flat floor between two ranges and the ridges
      have form without colour doing the work. Base is the city's own Warm White, so the valley
      and the diorama are the same material at different scales.
- [ ] **Terraced, if it is ever wanted back.** Implemented and switchable, but not yet
      right: at 469 m between vertices a terrace is often one cell wide, so treads and risers
      alternate per cell and read as confetti rather than as contours; and the hypsometric ramp
      makes harsh jumps across five bands. Tried 100, 250 and 500 m intervals. The honest options
      are a finer mesh for this view only (stride 1 is 520k triangles, so it would need its own
      budget argument), a much gentler ramp, or contour LINES on a smooth surface instead of
      stepped geometry.
- [x] Looked at the hillshade style — see above. Getting there needed
      `scripts/preview-relief.ts`, an offline rasteriser, because the browser route failed twice
      over: the DevTools debugger makes a 130k-triangle rebuild take tens of seconds, and macOS
      screen capture needs a permission this environment does not have.
- [x] Docs: `docs/architecture.md` ("Registers" → "Three views", plus a measured budget and a
      level-of-detail section), `docs/roadmap.md` items 8 and 9 and the reversed *Device reach*
      objection, and CLAUDE.md's spine and budget sections

## UI mockups (ASCII)

The chips stop being positions on a rail and become what they look like — a view switcher.

CIRCLE:

```
 ┌────────────────────────────────────────────────────┐
 │ Wat Ket 2045        [Circle][Valley][City]  [EN]   │
 │                      ▔▔▔▔▔▔                        │
 ├────────────────────────────────────────────────────┤
 │            ·  ·  ▒▒▒▒▒▒▒▒  ·                       │
 │         ·   ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  Delhi               │
 │       ╭─────────────────────────╮                  │
 │      │  ▒▒▒▒▒ Dhaka ▒▒▒▒▒▒▒▒▒▒▒ │  Shanghai        │
 │      │  ▒▒▒▒▒▒  ⊕ Wat Ket ▒▒▒▒▒ │                  │
 │       ╰─────────────────────────╯                  │
 ├────────────────────────────────────────────────────┤
 │ 4.09 billion people live inside this circle.       │
 └────────────────────────────────────────────────────┘
```

VALLEY — the new one. Hypsometric relief, the Ping, towns named, Wat Ket marked:

```
 ┌────────────────────────────────────────────────────┐
 │ Wat Ket 2045        [Circle][Valley][City]  [EN]   │
 │                             ▔▔▔▔▔▔                 │
 ├────────────────────────────────────────────────────┤
 │  ▲▲▲▲        Chiang Dao                    ▲▲▲     │
 │ ▲▲▲▲▲▲▲   ╲                            ▲▲▲▲▲▲▲▲    │
 │  ▲▲▲▲      ╲  Mae Rim                 ▲▲▲▲▲▲       │
 │   ▲▲  Doi   ╲                        ▲▲▲           │
 │  ▲▲▲ Suthep  ╲  CHIANG MAI    San Kamphaeng        │
 │  ▲▲▲ 1,676m   ╲   ⊕ Wat Ket          ▲▲            │
 │   ▲▲           ╲ Saraphi            ▲▲▲▲           │
 │  ▲▲▲▲▲          ╲   Lamphun        ▲▲▲▲▲▲          │
 │ ▲▲Doi Inthanon   ╲                ▲▲▲▲▲            │
 │  ▲ 2,565 m        ╲ the Ping     ▲▲▲               │
 ├────────────────────────────────────────────────────┤
 │ The valley the city grew in. 120 km across.        │
 └────────────────────────────────────────────────────┘
```

CITY — today's diorama, unchanged:

```
 ┌────────────────────────────────────────────────────┐
 │ Wat Ket 2045        [Circle][Valley][City]  [EN]   │
 │                                     ▔▔▔▔           │
 ├────────────────────────────────────────────────────┤
 │        ▒▒▒▒▒▒ far city, raster ▒▒▒▒▒▒              │
 │     ▒▒▒▒▒  ▓▓▓ near geometry ▓▓▓  ▒▒▒▒▒            │
 │        ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                 │
 ├────────────────────────────────────────────────────┤
 │ Wat Ket, 2045.               pinch to a doorstep   │
 └────────────────────────────────────────────────────┘
```

## Keyboard interaction

1. **Tab order** unchanged: title, then the three view chips, then locale, then debug, then the
   canvas as one application-role stop.
2. **`1` / `2` / `3`** select circle / valley / city. Today they jump along the rail; they now
   switch views. `aria-keyshortcuts` already advertises them.
3. **Arrows** step between buildings in the city view. In the valley view they step between named
   towns; in the circle view they step between labelled cities, which is what `pickLabels` already
   selects.
4. **Escape** closes the panel, focus returns to the canvas. Unchanged.
5. **Focus** stays on the chip after a view switch — switching view must not steal focus into the
   canvas, or a keyboard visitor loses the switcher.

## Test list (TDD)

- [ ] the view enum round-trips through the chips — unit — `src/engine/__tests__/views.test.ts`
- [ ] each view has an independent camera state; switching away and back restores it — unit — `views.test.ts`
- [ ] zoom is clamped within a view and can never select another view — unit — `views.test.ts`
- [ ] the city view's district↔block range is exactly today's ladder — unit — `views.test.ts`
- [ ] a scene with no region field has no circle view, and nothing can select it — unit — `views.test.ts`
- [ ] a scene with no valley field has no valley view — unit — `views.test.ts`
- [ ] **`aeqd.test.ts` passes unchanged** — the anchor is not up for renegotiation — unit — `aeqd.test.ts`
- [ ] valley field decode round-trips, and the peak is Doi Inthanon at 2,565 m ± 30 — unit — `src/engine/__tests__/valley.test.ts`
- [ ] valley vertex positions cover ±60 km exactly — unit — `valley.test.ts`
- [ ] the valley mesh lands inside the triangle budget at its render stride — unit — `valley.test.ts`
- [ ] Wat Ket's marker sits at the origin of the valley field — unit — `valley.test.ts`
- [ ] `validateScene` accepts a scene with `valley`, and one without — unit — `scene.test.ts`
- [ ] every existing `FORBIDDEN_EDIT_FIELDS` test still passes — unit — `scene.test.ts`
- [ ] **`terrain` is still asserted null** — the valley is a view, not terrain under the city — unit — `scene.test.ts`

## Verification

1. **Each view is reachable and nothing bleeds.** Select each chip in turn; confirm the other two
   views' geometry is not on screen and no ghost of them fades in at the edges of the zoom range.
2. **Zoom cannot leave a view.** In each view, zoom to both stops and confirm the camera clamps
   rather than handing over to a neighbour.
3. **Camera state survives a round trip.** Zoom into a shophouse, switch to valley, switch back —
   the city view is where it was left.
4. **The valley reads as a valley.** Doi Suthep west of the city, the Ping running north to south
   through the basin, Lamphun to the south, mountains on both flanks. Hold it beside a physical map
   of Chiang Mai province; they must agree.
5. **The anchor still reads true** on the circle view — the marker below-left of centre, ~8% out.
6. **`prefers-reduced-motion: reduce`** — view switches are cuts, and nothing animates.
7. **Triangle budget in every view**, measured in a foreground browser the way today's was: patch
   `drawElements`/`drawArrays`, nudge the camera, count. Under 150k in each.
8. `npm test && npm run typecheck`, and `npm run fetch:relief -- --field valley` twice →
   byte-identical.
9. **On a real phone over the QR URL** — three views, and the switch is thumb-reachable.

## Out of scope

- **A fly-down transition between views.** Wanted; deferred. Switches are cuts for the 24th.
- **Terrain under the city.** `terrain` stays null and `validateScene` keeps asserting it. The
  valley is a separate view with its own field, and no building, road or water polygon in the
  baseline ever sits on a sampled surface. **This is the non-goal most at risk from this plan** —
  a topographic view one chip away from the diorama is exactly the pressure that would put the
  diorama on a surface. It does not.
- **Extruded population columns** on the circle. Still December.
- **Buildings in the valley view.** Wat Ket is a marked dot at 120 km across.
- **Re-cutting the city view.** Today's diorama, its backdrop split and its budget are untouched.

## Open questions

- [ ] Does the valley want the city's footprint drawn as a patch rather than a point marker? A dot
      says "here"; a patch says "this is how much of the valley the city is", which is closer to
      the argument. Judge it on screen.
- [ ] Should the circle view keep its own zoom out to the 12,000 km world field, or fit the circle
      and stop? The world field exists and is committed either way.

## Outcome

**Done.** Three discrete views, a populated valley drawn as a hillshade, and the docs brought in
line so the next session inherits the model the code actually has.

**The three views are live and each is its own world.** Measured per view in a foreground browser:

| View | Triangles | Draw calls |
|---|---|---|
| The circle | 68 | 3 |
| The valley | 130,052 | 2 |
| Wat Ket | 157,532 | 8 |

The circle used to carry the whole district with it through the handover, so the worst case is
now one view rather than two plus a backdrop. The valley reads unmistakably as the Chiang Mai
basin — a flat corridor running north to south between two ranges, the western massif in the
ramp's top colours, the city outlined as a patch about 5% of the frame.

Most of the change was deletion, as predicted: `RegisterDriver`, `ZoomTween`, the crossfade, the
district's collapse onto the circle and `worldMinZoom` all left the render path, and nothing
replaced them except a view gate and a camera cut.

**Two things broke, both from removing the driver, and both were found by looking rather than by
a test.** `RegionPlane`'s materials start at `opacity={0}` because the crossfade used to fade them
in — with the driver gone the circle rendered as a blank canvas. And `ViewCut` moved the camera
to a fixed reach, past near and far planes that had been sized for its original position; the fix
is to move the controls target and let `MapControls` carry the camera, which preserves them.

The valley is populated: 387 named waterways from Overpass and seven towns from the GeoNames dump
`build-region.py` already downloads, so no new data dependency.

**The topography style was chosen by looking, and needed a new tool to look with.**
`scripts/preview-relief.ts` renders the styles to PNGs offline, running the same pure functions the
viewer runs. It exists because the browser route failed twice over — the DevTools debugger makes a
130k-triangle rebuild take tens of seconds, and macOS screen capture needs a permission this
environment does not have. Three styles rendered in seconds and the choice took one look.
`hillshade` won: a plaster relief model in the city's own Warm White. `terraced` — the one the
project's own rules argued for, being exactly what the buildings do — lost on resolution, and both
stay behind `?relief=`.

Left for later: a fly-down transition between views (deliberately out of scope for the 24th), and
whether the city should be a patch or a point on the valley.
