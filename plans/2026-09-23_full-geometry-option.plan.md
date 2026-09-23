---
slug: 2026-09-23_full-geometry-option
status: done
started: 2026-09-23
finished: 2026-09-23
issue:
---

# An escape hatch from the raster: render the whole city as geometry

## Context

The backdrop raster goes soft when zoomed in, and on a retina laptop it is already at its
resolution limit at the default view. The numbers and the real fix — a tile pyramid — are on
the December roadmap, because the fix is a schema change plus a rewrite of `BackdropPlane.tsx`
and the exhibition opens on **24 Sep, tomorrow**.

But the raster only exists because of the phone. `plans/2026-09-21_backdrop-lod.plan.md` repaid
a budget that binds exactly one of the three delivery surfaces: visitors' own phones. The
laptop and the projector have no such problem, and they are the surfaces where somebody stands
and zooms in.

So the September answer is not to improve the raster. It is to let the machines that can afford
geometry skip the raster entirely.

## Goal

`?lod=full` loads the full 68,704-building document, renders every one of them as real
geometry, and draws no backdrop — crisp at any zoom, on the exhibition laptop and the
projector. `f` toggles it live so staff can compare on the day. The default is unchanged, so
nothing about the phone build moves.

## Approach

**A URL parameter, in the same family as `?view=` and `?relief=`.** That pattern is already
established for exactly this: the exhibition machine is set once at launch and the setting
survives a reload. Not a debug flag — `page.tsx` already says those deep links are not a debug
hatch.

**The full document is fetched on demand, never imported.** A static `import` of
`wat-ket.json` would put 19 MB into the shared chunk and every phone would pay for it,
which would defeat the entire point of the viewer document existing. `await import()` puts it
in its own chunk that is only ever requested when somebody asks for it. Same trick `/print`
uses for its full-district source.

**Only the buildings change.** The viewer document already carries all 9,594 roads, all 118
water areas and all 727 green areas — the generator only ever stripped buildings. So this is
one array swap, not a second document path.

**The raster is dropped only once the geometry has arrived.** `Diorama` already accepts
`backdrop={null}`, so switching is a prop. Switching it off at the moment of the *request*
would leave a hole where the far city is for as long as the fetch takes.

**`f` toggles it.** Reachable only from a keyboard, which is exactly the laptop-and-projector
surface that can afford this — a visitor on a phone cannot trigger a 19 MB fetch by accident.
The fetch happens once and is then cached, so toggling back and forth is free.

### Rejected

- **Making it the default.** ~1M triangles against a 150k budget. The phone is the binding
  surface and this is the thing it cannot do.
- **A second scene document for the laptop.** Two documents that must not drift, to save one
  dynamic import.
- **Raising the backdrop resolution instead** (`--width 4096`). Buys one doubling, costs 77 MB
  of VRAM on every surface including the phone, and the device test on a cheap Android is still
  outstanding. Wrong night to ship it.
- **A visible on-screen toggle.** The visitor-facing controls are the three views and the
  language. A rendering-quality switch in that row would be the first control in the piece that
  is about the software rather than about Wat Ket.

## Tasks

- [x] `?lod=full` and the `f` toggle in `page.tsx`, with the document fetched on demand
- [x] A loading state, so a 19 MB fetch is not a frozen topbar
- [x] Docs: CLAUDE.md, README, roadmap cross-reference

## UI mockups (ASCII)

The topbar gains one transient item; nothing else in the viewer changes.

```
  default (?lod absent, or before f is pressed)
┌──────────────────────────────────────────────────────────────────────────┐
│  Wat Ket 2045        [The circle][The valley][Wat Ket]  [EN]  [debug]     │
└──────────────────────────────────────────────────────────────────────────┘

  while the full document is in flight
┌──────────────────────────────────────────────────────────────────────────┐
│  Wat Ket 2045   loading full geometry…  [The circle][The valley][Wat Ket] │
└──────────────────────────────────────────────────────────────────────────┘
       the raster stays on screen throughout — no hole in the far city

  once it has landed: identical topbar, no raster, every building geometry
```

## Keyboard interaction

1. **Tab order** — unchanged. The status text is not focusable; it is a readout.
2. **Shortcuts** — `f` toggles full geometry, alongside the existing `d` (debug) and `w`
   (wireframe) on the stage. Announced through the existing `aria-live` caption rather than
   silently.
3. **Focus management** — unchanged. Toggling swaps a prop; focus stays on the stage.

## Test list (TDD)

The logic worth testing is which source and which backdrop a given state selects — the rest is
a fetch and a prop.

- [x] `full` with the document loaded selects the full buildings and no backdrop — `lod-mode.test.ts`
- [x] `full` with the document still loading keeps the near buildings AND the backdrop, so the
      far city never blinks out — `lod-mode.test.ts`
- [x] `near` selects the near buildings and the backdrop, whatever is loaded — `lod-mode.test.ts`
- [x] a scene with no backdrop is unaffected in either mode — `lod-mode.test.ts`

## Verification

1. `npm run dev`, open `/`. Unchanged: the raster is there, the topbar has no extra item.
2. Open `/?lod=full`. "loading full geometry…" appears, the raster stays until the buildings
   land, then the far city is geometry — zoom to 8× fit and the buildings beyond 1,250 m have
   real edges and cast the same three-tone ramp as the near ones.
3. Press `f`. It returns to the raster instantly. Press `f` again — instant, no second fetch.
4. Check the network panel: nothing over 4.3 MB is requested on a plain `/` load.
5. `npm run build` — `/` is still one route and the 19 MB document is its own chunk, not part
   of the page.

## Out of scope

- **A settings page.** Added the same day — see `plans/2026-09-23_settings.plan.md`. The
  parameter still works and still wins; it is now the override rather than the only way in.
- **The tile pyramid.** December, and on the roadmap with its numbers.
- **Any change to the default.** The phone build is untouched.
- **Making the near/far split adjustable at runtime.** The 1,250 m radius is baked into the
  committed backdrop by the generator, and this option sidesteps it rather than moving it.

## Open questions

- [ ] Does the laptop that will drive the projector actually hold ~1M triangles at an
      acceptable frame rate? Answerable only on that machine, before the doors open.
      Measured below: the *switch* costs ~6 s of frozen main thread. Whether the
      steady state is smooth afterwards is the part still to check on the machine.

## Outcome

Done 23 Sep 2026. `?lod=full` renders all 68,704 buildings as geometry with no raster;
`f` toggles it; the default is untouched.

Measured, rather than assumed:

| | buildings | triangles | merge | vertex buffers |
|---|---|---|---|---|
| `near` (default) | 7,588 | 111,988 | 1.0 s | 8 MB |
| `full` | 68,704 | 998,168 | **6.3 s** | 72 MB |

A plain `/` load fetches 3.2 MB for the viewer document and never touches the 19 MB
one — confirmed in the network panel, which was the thing most worth checking.
Toggling back to `near` takes ~1.2 s and re-fetches nothing.

**The finding that matters is the stall.** `mergeBuildings` is synchronous, so switching
to `full` freezes the main thread for about six seconds on this machine — and a full
`?lod=full` page load in dev took 26 s end to end, most of it fetching and parsing 19 MB
of uncompressed JSON over the dev server. The static export the exhibition laptop runs
will be faster, but not instant.

That is acceptable for what this is — a setting applied once when the installation
starts — and it is NOT acceptable as something to press during a show. Pressing `f` in
front of an audience freezes the projection for six seconds. Documented in CLAUDE.md as
a start-of-day setting rather than a live control.

*Corrected later the same day, measured on the static export rather than the dev server:*
the configured path fetches 13.8 MB and fires `load` at 5.1 s, then freezes for the
merge. The 26 s was Turbopack serving unminified JSON and is not what the laptop does.
The default path on the export fetches 4.89 MB in total.

Deliberately not fixed tonight: the obvious wins are chunking the merge across frames,
dropping `computeVertexNormals` from `buildingGeometry`, and storing vertex colours as
`Uint8` rather than `Float32` (which alone would halve the 72 MB). All three are edits
to `merge.ts`, which is on the path the phone build uses, and the night before the doors
open is the wrong time to touch it. They belong with the December renderer work, beside
the tile pyramid.
