---
slug: 2026-09-23_futures-chapter
status: draft
started: 2026-09-23
finished:
issue:
---

# Futures — a landscape of pins, across two scales

## Context

2045 is the world of **Faiways**, the fictional newspaper printed for the exhibition. Eight pieces,
thirteen places, one coherent future. All the content is assembled at
`docs/research/2026-09-23_futures-chapter.context.md` — read it first; this plan does not repeat it.

Four decisions from 23 Sep 2026 shape everything here:

- **One 2045, not several.** Superseded the "two or three arguable futures" framing. The comparison
  control has nothing to compare and `building.intervention` has no consumer.
- **Everything is a pin.** Nothing is extruded, including the four places inside the diorama. Each
  icon is distinct — a landmark map, not a marker set.
- **Futures uses two scales**, valley and city, because only four of its thirteen places sit inside
  the 8 km diorama. Scale and tense are different axes.
- **The chapter is a tilted martini glass.** Base, author-driven stem, then a bowl that widens into
  exploration. The eight stories are **bowl material** — what a reader finds — not stem beats.

## Goal

A visitor is introduced to 2045, walked through a short guided pass, and then released into a
landscape of oversized distinct icons spread across the valley and the district. Tapping one gives
a popup; the popup leads to the full story. The scene stays mounted throughout.

## Approach

**The editor's note is already the stem.** Faiways opens by introducing the *fai* — a weir that
slows a river and shares its flow rather than hoarding or blocking it — and sets up **Gen C**, the
hundred children conceived around Cosmo Local CNX in 2026 who turn eighteen in 2045. It is written
as base-and-stem for a collection you then browse. Adapting it beats writing a new one.

**Isometric sprites are not a compromise, they are the correct answer.** The camera is orthographic
and never rotates — the property that makes the backdrop raster *exact rather than approximate*.
Under a camera that cannot orbit, a 2D isometric sprite and a modelled `.glb` are
indistinguishable, so full 3D buys nothing until orbit is enabled, which would already break the
backdrop. Generated isometric artwork through the Higgsfield API, iterated on a jig page.

**Consequence worth writing down: pins and the backdrop raster now fail together** if orbit is ever
enabled. That is a second, independent reason it stays off, which makes the constraint sturdier
than when it rested on the raster alone.

**A story page is a state, not a route.** It must not unmount the scene — "a view builds on first
visit and is kept", and a route that rebuilds pays that cost every time somebody opens a story.

**Precision is not required here, and the reason must be written at the point of choice.** This is
fiction; approximate placement and soft zones are legitimate *because nothing is claimed as fact*.
The Past chapter renders similar shapes for the opposite reason — the evidence will not support a
line. Same output, opposite justification. Without the comment, a later session unifies them and
the Past loses its honesty.

**Rejected: modelled `.glb` pins.** See above — buys nothing under a fixed orthographic camera, and
twelve custom models is the long pole on a chapter whose content is otherwise ready.

**Rejected: a shared pin shape with per-site colour.** Cheap, legible, and wrong: the point is a
landscape you want to look around, which a repeated marker does not give you.

## Tasks

- [ ] `pins.ts` — the pin schema: id, place, lat/lon, scale, story, blurb, date, icon
- [ ] The pin list as committed data, derived from the context file
- [ ] `/jig` — the icon comparison page, Higgsfield prompts in, candidates out
- [ ] Twelve isometric icons, generated and committed as optimised assets
- [ ] Billboarded pin rendering at both scales, with the off-frame edge arrow for Chiang Dao
- [ ] Popup on tap, hover as the laptop bonus
- [ ] The story page, as a state over the mounted scene
- [ ] Stem copy adapted from the editor's note, plus thirteen blurbs, EN and TH

## UI mockups (ASCII)

**Bowl at valley scale.** Distinct oversized icons, labels on conduits.

```
┌──────────────────────────────────────┐
│ FUTURES                              │
│ 2045                                 │
│                        ╱▲╲ Chiang    │
│   ⌂ Mae Taeng         ◀── Dao 64 km  │
│                                      │
│      ╱╲   ⛩ Doi Suthep    🌾 Doi Saket│
│    ╱  ╲╲      ╱╲                     │
│   ▦ Wat Umong   ▣▣ ← city inset      │
│                                      │
│        ⛰ KAE · Wiang Kum Kam         │
│              ⚙ Lamphun hills         │
│              ◉ Lamphun town          │
└──────────────────────────────────────┘
```

**Popup**, on tap.

```
        ╭──────────────────────────╮
        │ 2029                     │  ← kicker
        │ Lanna World School       │  ← headline
        │ Forty-one children in a  │
        │ borrowed shed in Wat Ket.│  ← blurb
        │ Read the story  →        │
        ╰─────────┬────────────────╯
                  ▼
                 ▦
```

**Story page**, over the still-mounted scene.

```
┌──────────────────────────────────────┐
│ ← back to 2045                       │
│                                      │
│ FAIWAYS · 2045                       │  ← kicker
│ Lanna World School's First           │  ← headline
│ Cosmolocal Cohort 16 Years On        │
│ Sixteen years after it opened in a   │  ← standfirst
│ borrowed building…                   │
│                                      │
│ [body]                               │
└──────────────────────────────────────┘
```

States that differ: **icons still loading** — pins render as plain conduit nodes rather than
popping in late; **off-frame pin** — an edge arrow with bearing and distance, no icon;
**two pins overlapping at city scale** — the nearer one wins and the other offsets along its
conduit rather than stacking.

## Keyboard interaction

1. **Tab order** — rail, then the stage. Pins are reached from inside the stage, not as thirteen
   tab stops.
2. **During the stem** — `Space` or `→` advances; `Escape` skips to the bowl.
3. **In the bowl** — arrows move between pins by proximity, `Enter` opens the popup, `Escape`
   closes it. `Enter` again follows the link.
4. **Story page** — focus moves to the heading on open and returns to the originating pin on close.
   `Escape` closes.
5. Every pin carries its place name as accessible text; an icon alone is not a label.

## Test list (TDD)

- every pin resolves to a scale — `valley`, `city` or `both` — unit —
  `src/engine/__tests__/pins.test.ts`
- a pin outside the 120 km frame yields an edge bearing and distance, not a clipped position —
  unit; Chiang Dao at 64 km and Mae Chaem at 75 km are the cases
- city-scale pins all fall inside the scene rectangle — unit. Catches a pin authored at a plausible
  coordinate that is actually outside the diorama
- every story has at least one pin — unit. **This is the test that would have caught Arusha**
- a story may own several pins and a pin belongs to exactly one story — unit
- every pin has a distinct icon id — unit, pins the landmark-not-marker rule
- `nearestPin(from, direction)` is deterministic and never returns the pin it started from — unit
- the chapter's last stem beat is terminal and unlocks the bowl — unit — `chapters.test.ts`

## Verification

1. `/?view=city` or the rail's third stop — base frame, then the stem, then release.
2. In the bowl at valley scale: thirteen distinct icons, none repeating a shape.
3. Chiang Dao and Mae Chaem are edge arrows with a bearing and a distance.
4. Zoom to city scale — Wat Ket, Ban Tawan, Anusarn and Wua Lai are present and legible. Ban Tawan
   is **west** of Tha Phae Gate.
5. Tap a pin: popup with date, name, blurb and a link. Tap elsewhere: it dismisses.
6. Follow the link: the story reads in the page register, kicker above headline. Press `Escape` —
   back on the landscape, **scene never rebuilt**. Confirm with a timing or a frame counter, not by
   eye.
7. Keyboard alone: reach a pin, open it, read it, come back.
8. Narrow to 390 px: tap targets are thumb-sized, popups stay on screen, no horizontal scroll.

## Out of scope

- **A second scenario.** There is one 2045 and the schema already supports another for free.
- Extruded buildings of any kind, and therefore `building.intervention`.
- The printed newspaper map itself — but the pin list and blurbs are the **shared source** it should
  be made from, so this plan owns that data and the print consumes it.
- Thai translation of the eight full stories. Blurbs are bilingual; the articles can follow.

## Open questions

- [ ] How many beats does the stem have? The editor's note suggests three — the fai, Gen C, the
      handover — but it has never been cut to length.
- [ ] Do city-scale pins differ from valley-scale pins, or is the inset the same pins closer in?
      Leaning same: the pin set is the content, the zoom is a camera.
- [ ] Does the chapter end anywhere, or is the bowl terminal? It is the last chapter, so there is
      nothing to hand to — which may mean an idle reset is the only exit.
- [ ] Icon style: the KV's beaded roundels as a frame around each isometric scene, or bare sprites
      on the landscape? The roundel is strongly on-brand but it may fight the diorama.

## Outcome

_Not started._
