---
slug: 2026-09-24_scrolly-shell
status: draft
started: 2026-09-24
finished:
issue:
---

# The scrolly shell, the icon system, and the popup/modal pair

## Context

All three chapter plans — `2026-09-23_past-chapter`, `_present-chapter`, `_futures-chapter` — turn
out to be the same shape, specified 24 Sep 2026:

> A scrolly section with the isometric map full-bleed behind it and a text card scrolling past in
> the centre of the screen, which highlights elements as it goes. Then an explorable version of the
> same map.

Three components are therefore built **once and used three times**. Writing them into each chapter
plan would guarantee three divergent implementations, which is the failure mode this repo's
architecture note warns about in its own terms: *if you ever find yourself building a second
renderer for the editor, stop.* Same principle, smaller scale.

This plan owns the shell. The chapter plans own their content and their camera beats.

## Goal

A chapter can declare a list of scroll beats and a set of interactive elements, and get: a
full-bleed scene with centred cards scrolling over it, a release into an explore mode with layer
toggles, and a consistent hover-blurb / click-modal pair on every icon and line in the piece.

## Approach

**The card floats over the viz; it is not a column beside it.** The Pudding population piece puts a
narrow card in the centre of a full-bleed visualisation and scrolls it past while the viz updates
behind. That is the reference and it is also the right answer for three delivery surfaces: a
centred card works at any aspect ratio, which a two-column layout does not, and the projector may
be an odd shape.

**One icon system across Past and Futures.** The Past chapter's point items — the airport, the
railway station — use the same iconography as the Futures pins. That is a content decision with a
pleasing consequence: the two chapters that share the valley share a visual language, so a visitor
reads the same grammar in both. It also halves the icon production run.

**Hover is the blurb, click is the modal, everywhere.** Two levels of detail, one interaction
pattern, applied to icons *and* to lines — a road or a rail alignment is hoverable too, which means
hit-testing needs to work on thin geometry, not just on billboards.

**Hover is decoration; tap is the contract.** Phones have no hover, so the popup must also be
reachable by tap, and the modal by a second tap or an explicit link inside the popup. The laptop
gets hover as a bonus. This is the standing three-surfaces rule and it decides the interaction, not
the other way round.

**Scroll drives a beat index, never a camera directly.** The beat names the camera pose and the
layer state; scroll only picks which beat. This keeps the invariant that no function returns a view
from a scroll offset — the thing that went wrong with the original rail and cost a crossfade band,
a frame transform and a stage scale absorbing 2,500:1.

**A stem may change view, and only by naming one.** The Futures stem starts in the city and moves
to the valley once the city items are done. That is a view change inside a chapter, which earlier
plans did not anticipate. It is legitimate because the beat *names* the view explicitly; it would
not be legitimate if the view were derived from a zoom level.

**Rejected: a scrollytelling library.** `IntersectionObserver` plus a beat index is about forty
lines, and the hard part here is the camera and layer state, which no library knows about.

## Tasks

- [ ] `Scrolly.tsx` — full-bleed slot, centred cards, `IntersectionObserver` → beat index
- [ ] `chapters.ts` — the beat score: camera pose, layer state, copy, terminal flag. Pure, tested
- [ ] `Explore.tsx` — the release: layer toggles, pan and zoom unlocked
- [ ] `Hotspot.tsx` — hover blurb and click modal, for icons and for lines
- [ ] Hit-testing for thin line geometry, with a tap-friendly tolerance
- [ ] The icon system: a sprite registry shared by Past point items and Futures pins
- [ ] `/jig` — icon comparison page, for iterating Higgsfield prompts and results

## UI mockups (ASCII)

**Scrolly beat.** Card centred, viz full-bleed behind, highlighted element lit.

```
┌────────────────────────────────────────┐
│        ╱╲      ╱╲╲     ╱╲              │
│      ╱  ╲╲  ╭──────────────╮  ╲╲       │
│   ~~~~~~~~~~│ 1921         │~~~~~~~    │ ← kicker
│             │ The line     │           │
│             │ reached      │           │
│  ═══════════│ Chiang Mai   │═══════    │ ← rail, lit
│             ╰──────────────╯           │
│                                        │
│                   ⌄                    │ ← scroll affordance
└────────────────────────────────────────┘
```

**Explore.** Cards gone, toggles in, everything live.

```
┌────────────────────────────────────────┐
│ [~] river [░] caravans [─] roads       │
│ [═] rail  [✈] air                      │
│        ╱╲      ╱╲╲     ╱╲              │
│      ╱  ╲╲  ✈ ╭─────────────╮          │
│   ~~~~~~~~~~~~│ Chiang Mai  │~~~~~     │ ← hover blurb
│               │ airport     │          │
│  ═════════════│ Opened 1934 │══════    │
│            🚉 ╰─────────────╯          │
└────────────────────────────────────────┘
```

**Modal**, on click.

```
┌────────────────────────────────────────┐
│ ╭────────────────────────────────────╮ │
│ │ 1934                          [×]  │ │
│ │ Chiang Mai Airport                 │ │
│ │                                    │ │
│ │ Operations began in 1934. It joined│ │
│ │ the national airports authority on │ │
│ │ 1 March 1988 — a different event,  │ │
│ │ often conflated with the opening.  │ │
│ ╰────────────────────────────────────╯ │
└────────────────────────────────────────┘
```

States that differ: **first beat** — no back-scroll above it; **last beat** — the release, where
cards stop and toggles appear; **modal open during scroll** — scroll locks to the modal, not the
page behind it.

## Keyboard interaction

1. **Tab order** — rail, layer toggles (explore only), stage. Icons are reached inside the stage.
2. **Scrolly** — `Space` / `→` next beat, `⇧Space` / `←` previous, `Escape` skips to explore.
3. **Explore** — arrows move between hotspots by proximity; `Enter` opens the modal; `Escape`
   closes it and returns focus to the hotspot that opened it.
4. **Toggles** — roving tabindex, `Space` toggles. Arrows move focus without firing a redraw.
5. **Modal** — focus trapped while open, moved to the heading, returned on close. `Escape` closes.
6. Every hotspot carries a text label; an icon alone is not a name.

## Test list (TDD)

- `beatAt(scrollProgress, beats)` returns a beat index, never a camera — unit —
  `src/engine/__tests__/chapters.test.ts`
- …is monotonic in progress, and stable at exact beat boundaries — unit
- a beat that names a view returns that view unchanged; **no beat derives a view from a zoom** —
  unit. This is the invariant the 21 Sep rail removal bought and it should be pinned, not trusted
- the terminal beat unlocks explore, and only the terminal beat does — unit
- `nearestHotspot(from, direction)` is deterministic and never returns its origin — unit
- line hit-testing accepts a point within tolerance of a segment and rejects one beyond it — unit —
  `src/engine/__tests__/hotspot.test.ts`
- …tolerance is in screen pixels, not world metres, so it survives zoom — unit. **The test that
  catches a thin line being untappable when zoomed out**
- every registered icon id resolves to a sprite, and no two hotspots share an id — unit

## Verification

1. Open a chapter. The viz is full-bleed; a card sits centred; scrolling moves the card and changes
   what is lit behind it.
2. Scroll to the end — cards stop, toggles appear, pan and zoom unlock.
3. Hover an icon on a laptop: blurb. Click: modal. `Escape`: closed, focus back on the icon.
4. On a phone: tap an icon gives the same blurb, and the blurb holds a tappable way into the modal.
   Nothing requires hover.
5. Hover a *line* — road or rail — not just an icon. Zoom out and confirm it is still hittable.
6. Keyboard only: reach a hotspot, open it, read it, close it, carry on scrolling.
7. Narrow to 390 px: the card fits with a 16 px gutter, no horizontal scroll, modal fills sensibly.
8. Projector aspect: at 21:9 the card stays centred and legible rather than stranded.

## Out of scope

- Chapter content of any kind — beats, copy, layers and icons belong to the three chapter plans.
- The icons themselves. This plan builds the registry and the jig; the artwork is produced against
  them.
- Story pages, which are a Futures concern and are a state rather than a route.

## Open questions

- [ ] Does the explore mode keep the rail visible, or is the rail only for the scrolly?
- [ ] Do cards advance one beat per card, or can a beat hold several cards? Pudding does the
      latter, and it matters for how copy is written.
- [ ] Modal or full page for the Futures stories? The modal pattern is shared with Past, but a
      newspaper article is much longer than a station blurb.

## Outcome

_Not started._
