---
slug: 2026-09-12_scene-schema-greybox
status: draft
started: 2026-09-12
finished:
---

# Scene schema + grey-box blockout

## Context

Roadmap item 1, and the first code in the project. The schema is the one thing `docs/roadmap.md`
says must be right on day one, because every authored scene and every tool depends on it while
everything downstream is deliberately disposable.

Revised 12 Sep after four decisions landed the same day: the time slider was cut, the "today" view
was cut, content fields became locale maps, and item 1 gained a device reality check as its closing
step. The original draft predates all four.

## Goal

The scene document type exists in TypeScript, a hand-written Wat Ket scene renders in an
orthographic view, clicking a box opens a panel naming it, and **the whole thing has been loaded on
a cheap Android**. No art, no OSM, no editor.

Two questions this answers, both cheap to answer now and expensive to answer in week two:

1. The one in `docs/roadmap.md` — **is the grey-box version interesting to click around?**
2. The one in *Device reach* — **is the phone risk capability, or just load time?**

## Approach

Schema first as types, matching `docs/architecture.md`, with two things the document now makes
explicit and the types should enforce:

- **Every human-readable string is a locale map**, not `{en, th}`. Lookup goes through one function
  with a fallback chain. English and Thai are the only locales with content; the point is that a
  third costs nothing structural.
- **Edits carry no date, and array order carries no temporal meaning.** It exists for undo. Nothing
  in the types should invite a `year` field back in.

Then the smallest renderer that can read one: orthographic camera, extruded footprints, raycast
select. Hand-write the first scene JSON rather than waiting for the OSM script, so the renderer and
the importer can be wrong independently.

**Add a ground plane and the Ping as a flat ribbon.** Not art — two flat shapes, about ten lines.
A dozen boxes floating on a void is not a fair test of "does this read as a neighbourhood", and the
river is the defining feature of an east-bank district. This is the cheapest thing that makes
question 1 answerable.

Debug overlay goes in at the same time, per `CLAUDE.md` — axes, bounding boxes, wireframe toggle,
1 m reference cube. Twenty lines, and it is how scale bugs become legible.

**Two notes on what day one is and is not:**

*It renders `baseline` alone, which is a development view only.* The viewer ships showing 2045
scenarios and nothing else — see "Futures only" in `docs/architecture.md`. Do not let the
baseline-only path harden into a visitor-reachable state.

*It picks baseline buildings, which production will not.* `docs/architecture.md` is explicit that
only hotspots and placed objects need to be pickable, and the mandatory merging of baseline
geometry depends on that. Day one has no hotspots and no placed objects, so baseline buildings
stand in for them to test the mechanism. **Do not build picking in a way that assumes baseline
buildings are individually pickable** — that assumption dies the moment merging lands.

## Tasks

- [ ] Scaffold Next.js App Router + TypeScript; viewer at `/`, `src/engine/` for shared components
- [ ] `SceneDocument` types from `docs/architecture.md` — locale maps, no date on edits,
      `wasAt` on `remove`/`replace`, hotspots carrying exactly one of `target` or `at`, hotspots at
      both scene and scenario level, `terrain: null` reserved and never implemented
- [ ] Locale lookup helper with a fallback chain, and a locale toggle in the UI
- [ ] A hand-written `wat-ket` scene: ~12 baseline buildings, a ground plane, the Ping as a ribbon
- [ ] Footprint + height → `ExtrudeGeometry` args — a pure function, unit-tested
- [ ] Orthographic camera at 45° / 35.264°, `MapControls` constrained to pan and zoom
- [ ] Click-to-select via raycast → panel opens with the object's id and kind
- [ ] Keyboard path for selection — see below
- [ ] Debug overlay: axes, bbox, wireframe toggle, 1 m reference cube
- [ ] ODbL attribution line in the viewer — easy to forget until someone asks
- [ ] **Load it on a cheap Android.** Record load time on mobile data, frame rate, and whether it
      throttles after a few minutes. This closes item 1.

## UI mockups (ASCII)

Phone portrait, ~390 px — the binding surface, since visitors arrive by QR:

```
┌──────────────────────────┐   Nothing selected:
│ Wat Ket 2045    [EN│TH]  │   the diorama has the
├──────────────────────────┤   whole viewport.
│                          │
│         ▁▂▃█▃▂▁          │
│       ▁█▇█ █▇█▁          │
│      ~~~~~~~~~~~~~       │ ← the Ping
│       ▃█▅ ▂▇█▃           │
│                          │
│ [debug]                  │
├──────────────────────────┤
│ © OpenStreetMap contrib. │ ← always visible, never scrolled away
└──────────────────────────┘

┌──────────────────────────┐   Selected: panel rises from
│ Wat Ket 2045    [EN│TH]  │   the bottom, capped at ~40%
├──────────────────────────┤   height so the diorama stays
│         ▁▂▃█▃▂▁          │   visible and the selection
│       ▁█▇█ █▇█▁          │   stays in frame.
│      ~~~~~~~~~~~~~       │
├──────────────────────────┤
│ osm/way/12345       [×]  │ ← [×] is a 44 px target
│ residential · 9.6 m      │
│                          │
├──────────────────────────┤
│ © OpenStreetMap contrib. │
└──────────────────────────┘
```

Laptop and projection — the panel moves to the side rather than overlaying, because there is room
and because covering the diorama on a projection is worse than on a phone:

```
┌───────────────────────────────────────────────────┐
│ Wat Ket 2045                             [EN│TH]  │
├─────────────────────────────────┬─────────────────┤
│                                 │ osm/way/12345   │
│          ▁▂▃█▃▂▁                │ residential     │
│        ▁█▇█ █▇█▁                │ height 9.6 m    │
│       ~~~~~~~~~~~~~~            │                 │
│        ▃█▅ ▂▇█▃                 │           [×]   │
│                                 │                 │
│ [debug]                         │                 │
├─────────────────────────────────┴─────────────────┤
│ © OpenStreetMap contributors                      │
└───────────────────────────────────────────────────┘
```

Debug overlay on, either width: axes at origin, a 1 m cube beside a known building, bounding boxes
on every extrusion, wireframe toggle. It overlays the diorama and never moves the layout.

## Keyboard interaction

Mandatory because agent-driven browser verification navigates by keyboard — a feature with no
keyboard path cannot be tested by an agent, regardless of the accessibility argument.

**Tab order:** locale toggle → diorama (one tab stop) → debug toggle → attribution link. The panel,
when open, is inserted after the diorama.

**Within the diorama** (roving focus, so the diorama is a single tab stop rather than twelve):

| Key | Action |
|---|---|
| `←` `→` | Move selection between pickable objects, ordered left-to-right by screen position |
| `↑` `↓` | Same, ordered top-to-bottom |
| `Enter` / `Space` | Open the panel for the selected object |
| `Escape` | Close the panel |
| `D` | Toggle the debug overlay |
| `W` | Toggle wireframe (only while the overlay is on) |

**Focus management:** opening the panel moves focus to its heading. Closing returns focus to the
diorama with the same object still selected — never to the top of the page. The selected object
carries a visible outline in the 3D scene, not only a DOM focus ring, or keyboard users cannot see
where they are.

## Test list (TDD)

Written before the implementation steps; the tests come before the code. These are the pure,
numeric parts — the visual layer is not unit-testable and should not be faked into looking like it
is.

- [ ] Footprint + height → `ExtrudeGeometry` args — unit — `src/engine/__tests__/extrude.test.ts`
  - a square footprint at height 9.6 produces the expected shape points and depth
  - a footprint wound clockwise and one wound anticlockwise produce the same geometry
  - height falls back: `height` tag → `building:levels × 3.2` → per-type default
- [ ] lat/lon + origin → local metres — unit — `src/engine/__tests__/project.test.ts`
  - the origin maps to `[0, 0]`
  - a point ~100 m north is within a metre of `[0, 100]` at Wat Ket's latitude
  - east/west scales by `cos(latitude)`, not 1:1
- [ ] Locale lookup — unit — `src/engine/__tests__/locale.test.ts`
  - exact locale wins; missing locale falls back down the chain; empty map returns a visible
    placeholder rather than `undefined` leaking into the DOM
- [ ] Scene document validation — unit — `src/engine/__tests__/scene.test.ts`
  - accepts `terrain: null`; rejects a populated `terrain`
  - rejects an unknown edit `op`
  - rejects an edit carrying a date field, so the cut time slider cannot creep back via data
  - accepts `wasAt` on `remove` and `replace`
  - rejects a hotspot with both `target` and `at`, or with neither

## Verification

Browser-based, keyboard-first, before this plan goes `done`.

**Desktop, `/`:**
1. Twelve boxes, a ground plane and the river render in isometric. Nothing floats or z-fights.
2. Click a box → panel shows its id and kind. `Escape` closes it; focus returns to the diorama.
3. `Tab` to the diorama, `→` moves the selection visibly, `Enter` opens the panel, focus lands on
   its heading.
4. `D` shows the overlay; the 1 m cube is plausibly 1 m against a building of known height. This is
   the check that catches a 100× scale error.
5. The locale toggle switches every string, and no raw key or `undefined` appears.
6. The ODbL line is visible without scrolling.

**Phone width, 390 px:**
7. No horizontal scroll. The panel rises from the bottom and does not cover the selected object.
8. Every control is at least 44 px. Verified by touch, not only by cursor.

**Cheap Android, real device:**
9. Time to first render on mobile data, not wifi. Frame rate while panning. Whether it throttles
   after three minutes. Numbers recorded in the Outcome — they decide whether a second renderer is
   ever worth discussing.

## Out of scope

The `CLAUDE.md` non-goals apply in full: no terrain, no avatar, no auth, uploads or database, no
time slider, no "today" state.

Also not here: OSM import (item 2), scenario switching (item 3), the editor (item 4), the
still-render pipeline (item 6), any art, and any locale content beyond English and Thai — the
structure is generic, the words are not yet written.

## Open questions

- [ ] Does a dozen grey boxes plus a river read as a *neighbourhood*, or does the answer stay
      meaningless until real OSM roads land in item 2? The ground plane and river are the cheap
      mitigation; if it still reads as nothing, that is a finding worth having on day one.
- [x] ~~Is there a cheap Android to test on?~~ **Borrowed at the residency.** Most participants are
      local and on site all month. Ask in the first days rather than on the 23rd — it is still the
      only task in this plan that cannot be done at a desk, and it now depends on someone else's
      schedule.
- [x] ~~Fixed isometric framing, or orbit constrained to 45° steps?~~ Settled by
      `docs/architecture.md`: `MapControls`, constrained — pan and zoom, no rotation. Touch-first
      argued for it and the document already said so.

## Outcome

_Not started._
