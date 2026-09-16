---
slug: 2026-09-16_semantic-zoom
status: in-progress
started: 2026-09-16
finished:
issue:
---

# Semantic zoom — registers, the Valeriepieris circle, and the 2026 on-ramp

## Context

Collaborators want the Valeriepieris circle in the exhibition. It already exists as a printed A0
that will hang in the same room — recomputed on GHS-POP E2025, centre **21.00°N 100.29°E**, radius
**3,437 km**, 4.10 bn people = 50.00% of the world. The poster is a collaborator's own work; the
app does not depend on it, and renders its own from open data.

The reason this belongs in the app rather than only on the wall is one number:

> **Wat Ket sits 279.98 km from that centre, at bearing 208.9° — 8.15% of the radius.**

The neighbourhood the diorama shows is, to within a rounding error, at the centre of gravity of
half of humanity. That is the cosmolocal argument made geographically instead of in copy, and it
is only legible if the visitor can *travel* between the two scales rather than read about it.

So semantic zoom becomes the spine of the piece: one gesture runs a single rail from the planetary
to the particular, and zooming out and going back in time are the same direction of travel.

```
 t=0 ──────────────────────────────────────────────── t=1
 REGION            DISTRICT                    BLOCK
 the circle        Wat Ket                     a shophouse
 4.10 bn people    2.98 km²                    one doorstep
 now               2026 → 2045                 2045
 └──── cosmo ────┘                └──── local ────┘
```

Decisions taken 16 Sep 2026, recorded in CLAUDE.md:

| | |
|---|---|
| September scope | Tier 1 — register machinery plus a **flat** region plane. No extruded population mountains before the 24th. |
| Dataset | **GHS-POP R2023A**, 30 arcsec, EPSG:4326, CC BY 4.0. GPWv4 rejected: needs an Earthdata login, so the script would fail unattended in December. |
| Artwork | We render our own from open data. |
| The present | Reinstated as an **on-ramp**, not a toggle state. See below. |
| Zoom vs time | One rail. Out = world/now, in = here/future. |

### What this reverses, precisely

`docs/architecture.md` and `docs/roadmap.md` both say the present is never a visitor-facing state,
and `src/engine/scene.ts` backs it with `FORBIDDEN_EDIT_FIELDS` plus a test named *"rejects an edit
carrying a date, so the cut time slider cannot return via data"*.

**That guard stays, untouched, and every test around it still passes.** What is being added is not
the cut feature:

| Cut on 12 Sep | This plan |
|---|---|
| Continuous scrub 2026→2045 | Two discrete states, one one-way transition |
| Edits carry dates | Edits carry no date. `era: 'now'` is zero edits applied — what `page.tsx` renders today |
| Scene partially applied at intermediate t | Never. Both states fully resolved and merged ahead of time, dissolved between |
| "Today" as a toggle state inviting a verdict | 2026 is passed *through*, once. The comparison control still holds only futures |

The carve-out: **`baseline` alone becomes visitor-reachable but never visitor-selectable.** It is
the room you walk through, not a door you can open.

## Goal

A visitor pinches out from a Wat Ket shophouse and arrives, continuously, at a circle containing
half of humanity with their own neighbourhood marked 8% of the way from its centre — and pinches
back in without ever seeing a cut, a black frame or a loading state. On load the piece plays that
journey inwards by itself, passing through 2026 Wat Ket on the way to its 2045 futures.

## Approach

**One camera, two coordinate frames, three registers.** The 2,500:1 scale gap never enters the
scene graph because the frames use different units and are siblings, never nested:

| Register | Frame | Unit | Magnitude |
|---|---|---|---|
| REGION | `region` | kilometre | ±3,437 |
| DISTRICT | `district` | metre | ±1,600 |
| BLOCK | `district` | metre | ±1,600 |

DISTRICT and BLOCK are the same geometry in the same frame, differing only in what is emphasised —
so there is exactly **one** handover, not two. float32 is a non-issue: `3437.0` in km resolves
finer than `1600.0` in metres.

Routes considered and rejected:

- **Per-register cameras.** An ortho camera's `zoom` is pixels per stage unit, so a group with
  `scale = k` has effective resolution `zoom × k` — per-group scale is *mathematically identical*
  and keeps MapControls, depth, raycasting and `onPointerMissed` bound to one camera. drei's
  `makeDefault` binds to one camera anyway.
- **One continuous world at true scale.** float32 precision and the perf budget both forbid it, and
  nobody wants to pan 3,000 km at 1 m/px.
- **Extruded population columns (the pudding.cool look) in September.** Deferred to December; the
  committed raster is designed so the extrusion needs no new data.
- **A 16-bit PNG height raster.** Rejected: `createImageBitmap` and `getImageData` both hand back
  8-bit clamped RGBA, so the low byte is silently unrecoverable in a browser. Would pass a Node
  unit test and quietly quantise to 256 levels in production. Two 8-bit channels instead.
- **GPU-displaced plane.** Same triangle order as instancing, but needs a custom shader — breaking
  the unlit `meshBasicMaterial + vertexColors` discipline `theme.ts` and `docs/design-system.md`
  depend on — plus vertex texture fetch on exactly the cheap Androids the roadmap worries about.

**The rail is a pure function of `camera.zoom`**, which means the crossfade needs no animation
clock: every pinch already produces a frame, so `frameloop="demand"` survives untouched at zero
battery cost. Time-based tweening is needed only for the register chips and the attract loop, and
that runs on a self-terminating rAF outside R3F.

**The on-ramp and the attract loop are the same machinery**, which is the main reason this is
affordable inside the week.

## Tasks

- [ ] `aeqd.ts` + test — the anchor lands first; everything is downstream of that number
- [ ] `registers.ts` + test — the rail, the bands, the frame transforms. No rendering yet
- [ ] Ground mipmap fix + hero/stock emphasis driven by `detail`  ← **Checkpoint A ships here**
- [ ] `tween.ts` / `useZoomTween`, register chips, `era` state, the on-ramp
- [ ] `scripts/build-region.py` + the committed artefact + the fifth licence
- [ ] `region.ts` + test, `Region.tsx`, schema + validation
- [ ] `Diorama.tsx` wiring, `RegisterDriver`, the crossfade  ← **Checkpoint B ships here**
- [ ] Docs: the reversal, the carve-out, the `minZoom` change

## UI mockups (ASCII)

REGION (t < 0.30) — flat AEQD plane, population as a canvas texture:

```
┌───────────────────────────────────────────────┐
│ ◀ REGION    DISTRICT    BLOCK                 │   chips, current one aria-pressed
│                                               │
│         ..·· coastlines ··..                  │
│      ╭─────────────────────────╮              │
│     ╱                           ╲             │
│    │         ▒▒▓█▓▒   ▒▓██▓▒     │            │   population, log ramp
│    │      ▒▓███▓▒  + ▒▓█▓▒       │            │   + = circle centre
│    │        ▒▓▒ ◆ ▒▒▒            │            │   ◆ = Wat Ket, 280 km out
│     ╲          ▒▓▒             ╱              │
│      ╰─────────────────────────╯              │
│                                               │
│  4.10 billion people live inside this circle  │
│  — half of everyone. Wat Ket is 280 km from   │
│  its centre.                                  │
│                                               │
│  © OSM · OCHA CC BY-IGO · JRC GHS-POP CC BY   │
└───────────────────────────────────────────────┘
```

HANDOVER BAND (0.30 < t < 0.42) — both resident, pan disabled:

```
┌───────────────────────────────────────────────┐
│      ╭─────────────────────────╮              │
│     ╱            ▒▓█▓▒          ╲             │   region fading IN   (u 0.05→0.40)
│    │         ▒▓██▓▒  ░░▒        │             │
│    │           ░▒░  ╱▔▔╲        │             │   district shrinking 410×, log-space
│    │              ◆ ╲__╱        │             │   marker fading IN   (u 0.50→0.85)
│     ╲                          ╱              │   district fading OUT (u 0.70→1.00)
│      ╰─────────────────────────╯              │
└───────────────────────────────────────────────┘
```

DISTRICT (0.42 < t < 0.62) — today's view, unchanged:

```
┌───────────────────────────────────────────────┐
│   REGION   ◀ DISTRICT    BLOCK                │
│                                               │
│            ▟▛▜▙  ▗▄▖   ▟▛▜▙                   │   hero buildings emphasised,
│          ▟▛    ▜▙ ▝▀▘ ▟▛   ▜▙                 │   stock recedes as detail → 0
│         ▐  ░░░░  ▌   ▐ ░░░░ ▌                 │
│          ▀▀▀▀▀▀▀▀     ▀▀▀▀▀▀                  │
│         ══════ Charoenrat Rd ══════           │
│                                               │
│              ● Commons 2045                   │   scenario toggle (era = futures)
│              ○ Other 2045                     │
└───────────────────────────────────────────────┘
```

ON-RAMP, era = 'now' (plays on load and on idle reset) — no toggle yet:

```
┌───────────────────────────────────────────────┐
│                                               │
│            ▟▛▜▙  ▗▄▖   ▟▛▜▙                   │
│          ▟▛    ▜▙ ▝▀▘ ▟▛   ▜▙                 │
│                                               │
│              WAT KET, 2026                    │   then a 700 ms dissolve to 2045
│                                               │
└───────────────────────────────────────────────┘
```

## Keyboard interaction

1. **Tab order** — register chips (REGION, DISTRICT, BLOCK) → scenario toggle → debug → footer
   links. Chips are real `<button>`s in DOM order carrying `aria-pressed`.
2. **Shortcuts** — `1` / `2` / `3` jump to REGION / DISTRICT / BLOCK. `d` debug, `w` wireframe,
   `Esc` deselect (all existing).
3. **Focus management** — a chip keeps focus after activation so repeated presses walk the rail.
   The scenario toggle is a roving-tabindex radio group. When `era` is `'now'` the toggle is not
   rendered at all rather than disabled, so it never becomes a focus trap for a screen reader.
4. The on-ramp is **interruptible by any input** — a visitor who scrolls or tabs during it takes
   control immediately and `era` jumps straight to `'futures'`.

## Test list (TDD)

- [ ] centre projects to `[0, 0]` — unit — `src/engine/__tests__/aeqd.test.ts`
- [ ] forward/inverse round-trip to 1e-9 over a lat/lon grid — unit — `aeqd.test.ts`
- [ ] **the Wat Ket anchor: 279.98 km ± 0.05 at 208.9° ± 0.1, `[−135.38, −245.08]` km** — unit — `aeqd.test.ts`
- [ ] distance preserved along any radius from the centre (the defining property of AEQD) — unit — `aeqd.test.ts`
- [ ] a point at exactly `radiusKm` lands on the circle — unit — `aeqd.test.ts`
- [ ] the antipode is handled, not `NaN` — unit — `aeqd.test.ts`
- [ ] bearing wraps correctly at 0/360 — unit — `aeqd.test.ts`
- [ ] `zoomToT` monotone across three decades, clamped to [0,1] — unit — `src/engine/__tests__/registers.test.ts`
- [ ] `tToZoom(zoomToT(z)) === z` across the ladder — unit — `registers.test.ts`
- [ ] `tToZoom(0.5)` is `ladder.district` **exactly** — unit — `registers.test.ts`
- [ ] `regionScale` puts the circle at exactly `regionOut ×` the district footprint on phone, laptop and projector — unit — `registers.test.ts`
- [ ] exactly one register fully opaque outside the band — unit — `registers.test.ts`
- [ ] inside the band, region and district opacity never both read 0 (**no black frame**) — unit — `registers.test.ts`
- [ ] `districtTransform(0)` is the exact identity — today's render is unchanged — unit — `registers.test.ts`
- [ ] `districtTransform(1).position === anchorStage` — unit — `registers.test.ts`
- [ ] `hasRegion: false` → `active` is never `'region'`, `minZoom` degenerates to `fit.zoom * 0.5` — unit — `registers.test.ts`
- [ ] `railed` is true only strictly inside the band — unit — `registers.test.ts`
- [ ] `encodeField`/`decodeField` round-trip within 0.5% at p = 1, 1e3, 1e6, pmax; `0 → exactly 0` — unit — `src/engine/__tests__/region.test.ts`
- [ ] **decode is sensitive to the low byte** (the test that would have caught the 16-bit-PNG flaw) — unit — `region.test.ts`
- [ ] `aggregate(grid, 2)` preserves total population exactly — unit — `region.test.ts`
- [ ] `aggregate(g,4) === aggregate(aggregate(g,2),2)` — unit — `region.test.ts`
- [ ] `aggregate` rejects a factor that does not divide `size` — unit — `region.test.ts`
- [ ] `easeInOutCubic` 0→0, 1→1, monotone, symmetric about 0.5 — unit — `src/engine/__tests__/tween.test.ts`
- [ ] `tweenZoom` midpoint is the geometric mean, endpoints exact — unit — `tween.test.ts`
- [ ] a scene with no `region` validates — unit — `src/engine/__tests__/scene.test.ts`
- [ ] `region.projection.kind: 'mercator'` is rejected — unit — `scene.test.ts`
- [ ] an origin outside its own circle is rejected, with the distance in the message — unit — `scene.test.ts`
- [ ] every existing `FORBIDDEN_EDIT_FIELDS` test still passes unchanged — unit — `scene.test.ts`

## Verification

1. **On a real phone over the QR URL** — pinch out from the temple to the circle and back. The
   diorama must *shrink onto the marker*, not cut. No black frame anywhere in the band. No shimmer
   on the road texture through the collapse.
2. **The anchor reads true** — at region-fit the marker sits below-left of the circle's centre
   crosshair, ~8% of the radius out. Hold the A0 poster beside the screen; the two must agree.
3. **The on-ramp** — hard-reload. Circle → descent → 2026 Wat Ket → dissolve → 2045, toggle
   appears. Leave it past the idle timeout and confirm it rewinds and replays.
4. **Scrolling back out does not revert to 2026.** Only the idle reset does.
5. **`prefers-reduced-motion: reduce`** — every tween becomes a jump cut, nothing animates.
6. **Projector aspect** — resize to 2560×1080 and confirm the circle still fits at `regionOut ×`
   the district.
7. **Triangle budget during the handover** — both registers resident; measure on the cheap Android
   roadmap item 1 already requires.
8. `npm test && npm run typecheck`, and `npm run build:region` twice → byte-identical output.

## Out of scope

- **Extruded population columns.** December. The committed raster is already shaped for it.
- **Terrain.** `terrain` stays `null` permanently and `validateScene` keeps asserting it. The
  population field is people-per-cell in a different coordinate frame — it is not elevation, and
  the resemblance is exactly how elevation would creep back in.
- **A continuous 2026→2045 scrub.** Reversing that cut is not what the on-ramp does; see Context.
- **A second interactive renderer.** Still no.
- **Rendering anywhere except the flat plane in September.**

## Open questions

- [ ] Does the region register need its own hotspots, or is the standing copy block enough? Leaning
      enough — 8–12 hotspots is already the stated ceiling and the circle makes one point.
- [ ] Should `regionOut` (currently 8) be tuned once there is something on screen to judge?

## Outcome

_Pending._
