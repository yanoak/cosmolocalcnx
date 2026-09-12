---
slug: 2026-09-12_scene-schema-greybox
status: draft
started: 2026-09-12
finished:
---

# Scene schema + grey-box blockout

## Goal

The scene document type exists in TypeScript, a hand-written Wat Ket scene with a dozen grey boxes
in it renders in an orthographic view, and clicking a box opens a panel with its name in it. No art,
no OSM, no editor. The question this answers is the one in `docs/roadmap.md`: **is the grey-box
version interesting to click around?**

## Why now

Roadmap item 1. The schema is the thing that must be right on day one because every authored scene
and every tool depends on it — everything downstream is deliberately disposable. See "What
accumulates vs. what gets thrown away" in `docs/roadmap.md`.

## Approach

Schema first, as types, matching the document in `docs/architecture.md` exactly — `origin`,
`boundary`, `baseline`, `scenarios[].edits`, `hotspots`, `terrain: null` reserved and never
implemented. Then the smallest renderer that can read one: orthographic camera, extruded footprints,
raycast select. Hand-write the first scene JSON rather than waiting for the OSM script, so the
renderer and the importer can be wrong independently.

Debug overlay goes in at the same time, per `CLAUDE.md` — axes, bounding boxes, wireframe toggle,
1 m reference cube. It is twenty lines and it is how scale bugs become legible.

Note on what day one renders: this plan draws the `baseline` alone, because no scenario exists yet.
That is a **development view only**. The viewer ships showing 2045 scenarios and nothing else — see
"Futures only" in `docs/architecture.md` — so do not let the baseline-only path harden into a
visitor-reachable state.

## Tasks

- [ ] Scaffold the Next.js App Router + TypeScript project; viewer at `/`, `src/engine/` for shared
      renderer components
- [ ] `SceneDocument` types transcribed from `docs/architecture.md`
- [ ] A hand-written `wat-ket` scene with ~12 baseline buildings, enough to judge the feel
- [ ] Footprint → `ExtrudeGeometry` — the pure part of this is a function from footprint + height to
      geometry args, and it gets a unit test
- [ ] Orthographic camera, fixed isometric framing, no free-roam
- [ ] Click-to-select via raycast → panel opens with the object's id and kind
- [ ] Debug overlay: axes, bbox, wireframe toggle, 1 m reference cube
- [ ] ODbL attribution line in the viewer — easy to forget until someone asks

## UI mockups (ASCII)

_**Required before this plan goes `active`.** Not yet written — this plan predates the conditional
gates. Needs the isometric framing, where the select panel sits relative to the diorama, and the
debug overlay's placement, at phone width and at projection width._

## Keyboard interaction

_**Required before this plan goes `active`.** Touch is the primary input here (see `CLAUDE.md`),
but click-to-select still needs a keyboard path — tab through selectable objects, Enter to open the
panel, Escape to close — or agent-driven browser verification cannot test it._

## Test list (TDD)

_**Required before this plan goes `active`.** At minimum: footprint + height → `ExtrudeGeometry`
args, and lat/lon → local-metre projection. Both are pure and numeric, which is exactly what
`CLAUDE.md` says to unit-test._

## Verification

_**Required before this plan goes `active`.** Which route, what to press, what should appear —
including the phone-width check, since the QR surface is the binding constraint._

## Out of scope

The non-goals in `CLAUDE.md` apply in full: no terrain, no avatar, no auth or uploads or database.
Also not in this plan — OSM import (item 2), scenario switching (item 3), the editor (item 4),
any art.

## Open questions

- [ ] Does a dozen grey boxes read as a *neighbourhood* at this camera angle, or does it need
      roads and water before the answer means anything?
- [ ] Fixed isometric framing, or orbit-constrained-to-45°-steps? Touch-first argues for fixed.

## Outcome

_Not started._
