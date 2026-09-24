---
slug: 2026-09-24_north-up-and-chrome
status: done
started: 2026-09-24
finished: 2026-09-24
issue:
---

# North up, and chrome that belongs to the panels

## Context

The first pair of eyes on the shell — Yan's, on the morning the exhibition opened — came back
with three things, none of them about the shell itself:

1. **The maps are rotated.** The camera has sat on the (1, 1, 1) diagonal since the first
   greybox, so north runs up-left at 30° in every view. The argument for it was that a square
   field seen on the diagonal makes a wide rhombus, which fills a landscape screen better than
   a square does. It is disorienting, on the valley especially, where a visitor who knows the
   basin is looking for Doi Suthep on the west and finds it in the top-left corner. The ask is
   north at the top, in all three views.
2. **The data credits are a paragraph across the bottom of the screen.** Seven licences require
   visible attribution, and it is visible — as three lines of small type under the stage, on a
   projector. Fold them into an info icon in a corner that opens on tap.
3. **The chrome does not look like the panels.** The topbar carries a hairline rule and two
   boxed buttons (`EN`, `debug`) that belong to a settings page, not to the printed panels the
   screen stands beside: white page, no boxes, an orange kicker over a semibold charcoal
   headline, and the stitched rail as the one ornament. Remove the two buttons for now and pull
   the rest toward the panel language.

The first is the substantial one. The camera's attitude is not one constant: `isometricFit`
sizes the frame from a footprint formula that assumes 45° yaw, `lod.ts`'s `viewDepth` is
`(x − y)/√2`, `backdrop.ts`'s `projectIso` is the same basis written out, `BackdropPlane.tsx`
repeats the basis as three vectors and a `√(2/3)`, `shading.ts` picks wall tones knowing which
two walls the diagonal can see, and `render-backdrop.ts` culls walls with `nx − ny <= 0`. Six
files agree about one fact by each restating it. **The committed backdrop raster was rendered
in that attitude**, and its freshness fingerprint does not include the attitude, so changing
the camera without re-rendering would silently hang the wrong picture behind the near set —
exactly the failure `lod.ts` says the raster's legitimacy rests on avoiding.

## Goal

North is up on screen in all three views and the camera attitude is stated once, in
`camera.ts`, with everything else derived from it and tested against it — so tuning the pitch
is a one-line change that fails the backdrop freshness test until the raster is re-rendered.
The credits live behind an info button in the stage's corner. The topbar has no rule, no boxed
buttons, and names the chapter the way a panel names its section.

## Approach

**Attitude as data.** `camera.ts` gains `CAMERA_YAW` (0 — camera due south, looking north) and
`CAMERA_PITCH`, and three derived, pure functions: `screenBasis()` (right, up, towards-camera in
three.js space), `projectView(x, y, h)` (scene east/north/up to screen metres, y up) and
`groundDepth(x, y)` (metres along the camera's ground track, larger nearer the camera), plus
`wallFacesCamera(nx, ny)` for the rasteriser. `isometricFit` keeps its name and its contract but
sizes the frame by projecting the four ground corners rather than by the diagonal formula.

Everything else delegates: `viewDepth` is `groundDepth`, `projectIso` becomes `projectView` and
is re-exported nowhere, `BackdropPlane` builds its vectors from `screenBasis()` and its
ground-track-to-ray factor is `cos(pitch)`, `toneForNormal` splits visible walls by the sign of
their dot with the basis's right vector, and the render script asks `wallFacesCamera`.

**Reversed the same morning.** North-up was built, rendered and seen, and Yan said "not north
south facing down, we want the same angle we had before". `CAMERA_YAW` is π/4 and
`CAMERA_PITCH` the isometric pitch again. The refactor stands: the attitude is stated once and
every consumer derives from it, which is what made the reversal a two-line change plus a
re-render. What Yan meant by "orientation north to south" is still open — the valley in the
06:56 screenshot is a tilted slab that neither camera produces from a square field, and the
suspicion is a stem-mode canvas sizing bug rather than the camera at all.

**The circle's fit is computed directly** — `isometricFit` on the square that bounds the circle
plus its margin — the way the valley's already is. `circleFitZoom` (district fit ÷ regionOut)
went, and so did the test that the two fits are in exact ratio on every aspect: that property was
a consequence of the diagonal's symmetric footprint and does not hold north-up. `regionScale`
stays as the stage-units-per-kilometre constant; it no longer needs to match anything.

**Attitude in the fingerprint.** `backdropFingerprint` hashes yaw and pitch, so a camera change
fails `backdrop-freshness.test.ts` with the message that says to re-render. The raster is
re-rendered in this plan; at the same width it gains resolution, because a north-up footprint
is 5.9 km wide rather than 9.9.

Rejected: a small yaw (10–15°) to keep two walls visible on every building. It shows more form,
and it puts north back off-vertical, which is the complaint. Rejected: keeping the diagonal and
rotating only the valley and the circle. They are one camera by design — "one camera serves two
coordinate frames" is how the circle sits on the stage at all.

**Credits** are a native `<details>` in the stage's bottom-left corner: a 44 px round `i` as the
summary, the existing paragraph as the body. Keyboard and dismissal come free. The explore bar
and the caption move right to clear it.

**Chrome.** The topbar loses its rule and its boxed buttons; `ViewHeader` renders the tense as a
kicker over the place as a headline, which is p22's own hierarchy. `EN` goes — the locale is
still state, still set from `/settings` and `?locale=`, and the button comes back when there is
Thai copy to switch to. `debug` goes from the bar and stays on `d`. Global buttons lose their
border and become text in the ink colour with a semibold weight; the one filled control is the
Explore bar's `Next →`, in the invert register — the panels' one invitation, used for the one
thing that moves a visitor on.

## Tasks

- [x] `camera.ts` — attitude constants, `screenBasis`, `projectView`, `groundDepth`,
      `wallFacesCamera`; `isometricFit` by projected corners; `circleFitZoom` removed
- [x] `lod.ts`, `backdrop.ts`, `BackdropPlane.tsx`, `shading.ts`, `render-backdrop.ts`,
      `preview-relief.ts` derive from it; fingerprint carries the attitude
- [x] `Diorama.tsx` — the circle's fit computed directly
- [x] Tests rewritten against the attitude rather than the diagonal
- [x] `npm run render:backdrop` — raster, sidecar and viewer document regenerated
- [x] Credits behind an info button
- [x] Topbar and buttons in the panel language; `EN` and `debug` removed from the bar
- [x] ~~Find what the tilted valley in the 06:56 screenshot was~~ — Yan verified the build at 07:40 and it looked right; not reproduced, left as the diary's ad hoc todo
- [x] Valley town labels only while the valley is the view; dev indicator off
- [x] Docs: `architecture.md` "Coordinates and units", `CLAUDE.md` orbit note, handover

## UI mockups (ASCII)

Topbar, explore state, laptop:

```
  PAST                                   ◉ Past ━━ ○ Present ━━ ○ Futures
  The valley
  ┌──────────────────────────────────────────────────────────────────────┐
  │                                                                      │
  │                          (stage, on the diagonal)                           │
  │                                                                      │
  │ (i)  ← Story        Drag to pan, pinch or scroll to zoom.  [Present →]│
  └──────────────────────────────────────────────────────────────────────┘
```

`PAST` is the kicker (derived orange, small caps, tracked); `The valley` the headline. No rule
under the bar. `← Story` is text; `Present →` is the filled purple pill.

Credits open:

```
  ┌──────────────────────────────────────────┐
  │ Building footprints and street data ©    │
  │ OpenStreetMap contributors, ODbL. …      │
  │ … City names from GeoNames, CC BY 4.0.   │
  └──────────────────────────────────────────┘
  (i)  ← Story
```

A card in the reading register, anchored above the button, at most 34 rem wide.

## Keyboard interaction

1. **Tab order** — rail (one stop), stage, credits button, `← Story`, `Next →`.
2. **Credits** — `Enter`/`Space` on the `i` toggles it; `Escape` while it is open closes it and
   returns focus to the button. Native `<details>` supplies the toggle; the `Escape` is ours.
3. **Shortcuts** — unchanged: `1`/`2`/`3` chapters, `d` debug, `w` wireframe, `f` full geometry.
4. **Focus** — nothing moves focus on open except `Escape` returning it.

## Test list (TDD)

- `screenBasis()` is orthonormal and `up` has a positive y — unit — `camera.test.ts`
- `projectView` puts north higher on screen than south and east to the right of west — unit
- `projectView` raises a point straight up the screen as it gets taller — unit
- `projectView` is linear — unit
- `isometricFit` fits the projected corners inside every viewport and touches an edge — unit
- `isometricFit` places the camera along `screenBasis().towards` — unit
- `groundDepth` increases toward the camera and is metres along the ground track — unit —
  `lod.test.ts`, through `viewDepth`
- `toneForNormal` gives the south wall `side` at yaw 0, and never `top` — unit — `shading.test.ts`
- `wallFacesCamera` is true for a south-facing wall and false for a north-facing one — unit
- `backdropFingerprint` changes when the attitude changes — unit — `backdrop-freshness.test.ts`
- `projectView` agrees with `isometricFit` about a rectangle's footprint — unit — `backdrop.test.ts`

## Verification

1. `/` opens on the valley, on the diagonal as before: the basin is a rhombus, north up-left,
   and it is NOT a tilted slab. If it is, the ad hoc todo in the diary is the lead.
2. `2` — the circle, on the diagonal, centred, with the world around it. No valley town names.
3. `3` — Wat Ket on the diagonal. Zoom to a block: two walls and a roof, no seam where the
   raster meets geometry.
4. Topbar: kicker over headline on the left, rail on the right, no rule, no `EN`, no `debug`.
5. `Escape` to explore. `← Story` is text, `Present →` is a purple pill.
6. Tab to the `i`, `Enter` — the credits open above it; `Escape` closes them, focus stays.
7. `npm test`, `npm run typecheck`, `npm run build` all clean.
8. Yan does 1–6; this session's browser checks froze Chrome at `/`.

## Out of scope

- Any change to `print.ts`, which has its own conventions and no camera.
- Orbit. Still off, still the fact the raster rests on.
- The nested rail, the attract loop, the Present chapter — untouched.
- The page ground going from off-white to the panels' white; still an open question on the
  design-system plan.

## Open questions

- [ ] What did "keeping the orientation north to south" mean, given the angle stays? The one
      concrete evidence is the 06:56 valley screenshot, and it looks like a bug, not a camera.

## Outcome

Yan verified it on the laptop at 07:40 on 24 Sep 2026: "looks good". The camera is on the
diagonal it always had; the morning's north-up build was a misreading and is gone, but it left
the attitude stated once in `camera.ts` with the backdrop fingerprint guarding it, which is the
lasting change. Credits are behind an `i`, the topbar is in the panel language, `EN` and `debug`
are off the bar, and the valley's town names stay in the valley. The tilted valley in the 06:56
screenshot did not reproduce and stays as a diary todo.
