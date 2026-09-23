# TODO — candidate plans

A backlog, not a plan. Each item here is sized to become one
`plans/YYYY-MM-DD_short-name.plan.md` when it is picked up; the slug is suggested, the date is
whatever day it starts. Items carry the conditional sections they will need, so lifting one into
`_template.plan.md` is mechanical.

Written 23 Sep 2026, out of the design-system and scrollytelling conversation. **`CLAUDE.md` is
out of date with respect to most of this** — see item 11, which should land early rather than
last, because every other item contradicts something currently written there.

## The decisions this backlog rests on

Decided 23 Sep 2026, in conversation:

- **A view owns a tense.** Space is locked to time period. Nothing of another period renders in a
  view. The city view is 2045 and only 2045.
- **Three chapters: past, present, futures**, mapped onto the three existing views —
  valley, circle, city. Chapter order is temporal, replacing the current scale order.
- **Chapters are scroll-driven and scoped to one view.** Scroll never crosses views; there is no
  continuous zoom spanning the three. The switcher survives unchanged in mechanism.
- **Remote work is the seam.** The valley's four historical threads are river, roads, rail and
  remote work; the first three have surveyable alignments and terminate in the basin, the fourth
  does not, and is therefore the thread that hands over to the circle.
- **The design system comes from `docs/references/`** — the printed exhibition panels and the KV
  asset set, not the brand concept deck the current `docs/design-system.md` was derived from.

Every view is then a timeless substrate plus a period-bearing overlay:

```
VALLEY   DEM, ridgelines            +  river · roads · rail · remote work   past
CIRCLE   AEQD graticule, landmass   +  GHS-POP field                        present
CITY     OSM footprints             +  edits                                2045
```

Each view ends by handing off — valley to circle, circle to city, city to the visitor.

## A hazard that applies to several items below

`docs/references/CosmoLocal Exhibition_5.pdf` and the text extracted beside it name interviewees,
contributors and partners. The folder is gitignored and must stay that way. **Do not copy names
out of it into any committed file** — including authored scene content, plan files and this one.
The pre-commit hook will catch most of it; the rule is the point, not the hook. See the
public-repo note in `CLAUDE.md`.

---

## Design system

### 1. `kv-palette` — tokens from the printed panels

Replace Layer 1 and Layer 2 of `docs/design-system.md` with values taken from the exhibition
panels and KV assets. Role names, the three-tone ramp function and the theme/scene separation all
stay; only the values move.

The panels use **two registers** and the token table needs both: a quiet reading register (white
ground, orange kicker, near-black headline, grey body) and a loud register (deep purple ground,
orange kicker, white headline, gold accents, embroidered vignettes). The quiet one is for text
over the scene; the loud one is for the scene and for invitations.

Open: does `building.intervention` become gold, and if so what carries `building.civic` — teal
appears nowhere in the printed material. Does the population ramp still terminate in orange.

- Depends on: nothing
- Sections: Test list (the ramp function is pure and already tested), Verification
- Touches: `src/engine/theme.ts`, `Diorama.tsx`, `ValleyView.tsx`, `RegionPlane.tsx`,
  `DebugOverlay.tsx`, `docs/design-system.md`

### 2. `kv-chrome` — the DOM half of the system

The components the panels already define: kicker + headline type scale, the gold pipe rail with
beaded ring nodes, torn-edge vignette frames, the inverse purple panel. All SVG and CSS — nothing
here touches the renderer or the perf budget.

The pipe rail is not an invention. Page 22 of the exhibition PDF runs it vertically with a ring
node at each section heading; it is a chapter rail in print, by the same designer.

- Depends on: 1
- Sections: UI mockups, Keyboard interaction, Verification

### 3. `relief-thread` — the valley rendered as embroidery

A `?relief=thread` variant beside the existing hillshade and the two already parked behind
`?relief=`: posterised purple tonal bands with a stitch texture, matching the KV's mountains.

Worth noting that terracing lost on resolution when it was argued on its own merits. This is the
same idea arriving with a brand reason behind it, which is a different argument and may deserve a
different answer.

- Depends on: 1
- Sections: Test list (raster generation is deterministic and must stay byte-identical on re-run),
  Verification

---

## The chapter spine

### 4. `chapter-score` — the pure module

A score per view: an ordered list of chapters, each naming a camera pose and its copy. Plus
`advance(index, delta)` and the one structural concept beyond a list — a **terminal chapter**,
which ends by passing control elsewhere: to another view (twice) or to the visitor (once).

This is the piece with real logic in it and it should be written test-first. It must not be
possible for a scroll offset to produce a view; the score selects a chapter, the chapter names a
view. That invariant is what keeps the 21 Sep decision intact and it is checkable.

- Depends on: nothing
- Sections: Test list
- Touches: new `src/engine/chapters.ts`, `views.ts` untouched

### 5. `past-present-futures` — reorder and rename

`VIEW_ORDER` becomes temporal. The chips stop being `circle / valley / city` — renderer nouns,
which ask the visitor to care about scale — and become the period names. One order instead of two.

Open: **"Future" or "Futures".** The piece's argument is *which of these*, not *is this an
improvement*; the singular quietly flattens it back to one. Proposed, not decided.

Note `VIEW_ORDER` also drives the `1`/`2`/`3` keys, and `/settings` has an opening-view control
whose default moves from circle to valley.

- Depends on: 4
- Sections: UI mockups, Keyboard interaction, Test list, Verification

### 6. `chapter-drivers` — scroll, keys, timer

Three drivers over one score. Phone: scroll. Laptop: scroll and arrow keys. Projector: a timer,
because nobody is touching it — which means the attract loop falls out of this rather than being
built separately, provided each chapter carries a dwell.

- Depends on: 4
- Sections: Keyboard interaction, Test list, Verification

### 7. `scroll-vs-zoom` — the city-view gesture conflict

Inside the city view, scroll is currently how you zoom. If scroll drives chapters, zoom needs
somewhere else to live. Pinch covers the phone; on the laptop and projector the wheel is the
obvious zoom and it cannot be both.

Only the city has this problem — it is the view you look *into*. Options: scroll locks to chapters
until the terminal chapter releases it, then becomes zoom; or chapters advance on a different
gesture in the city alone.

- Depends on: 6
- Sections: Keyboard interaction, Verification

---

## Content, one per view

### 8. `valley-threads` — river, roads, rail, remote work

The first content drawn *in* the valley rather than as its surface. Four threads across the basin,
in the line styles the panel already draws: blue wave, orange dash with brown nodes, purple
sleepered track, purple dashed flight arc.

Open: **real alignments or the panel's radial diagram.** The panel's map is stylised, not
surveyed. Proposed is real geography rendered in the panel's line styles — the same move already
made with the relief, where the DEM is real and the treatment is brand. Not decided.

Open: **three sub-chapters or four.** Four gives a rail with four nodes, matching the print
exactly, but loads the valley with more chapters than the other two views combined.

Per the one architectural rule this is baseline-derived geometry, not edits.

- Depends on: 4, and 1 for the line styles
- Sections: Test list, Verification

### 9. `circle-present` — the claim, and its exit

The circle needs no new geometry; it needs its chapter copy and its handover. It does not
introduce itself cold — it answers the question the fourth thread asked. If work arrives from
everywhere, where is everywhere.

The exit is the percentage narrowing to a place: 8.15% of the radius stops being a number and
becomes Wat Ket.

`aeqd.ts` and the anchor it pins do not move. 279.98 km, 8.15%, still not up for renegotiation.

- Depends on: 4
- Sections: Verification

### 10. `futures-highlights` — authored buildings

The chapter with the least existing machinery. There are 68,704 buildings and a
`building.intervention` role, and no authored content attached to any specific one.

The exhibition supplies both halves of a schema: the four Nomad Friendly District areas
(infrastructure, community and cultural life, local entrepreneurship, governance and policy) as
categories, and a Hope / Concern / Dream / Highlight structure per item. A highlighted building
carries one category and one dream.

**Check before designing this:** with the default LOD, everything beyond 1,250 m of origin is a
raster plane — not geometry, not tappable. Every building to be singled out has to sit inside that
radius. Wat Ket and San Pa Khoi probably do, but this is precisely the chapter that wants to pick
out individual buildings, so confirm it rather than discover it.

**And see the hazard above.** The Hope/Concern/Dream/Highlight material is attributed to named
people. Authored scene content is committed. Paraphrase to the neighbourhood, never to a person.

- Depends on: 4, 7
- Sections: UI mockups, Keyboard interaction, Test list, Verification

---

## Documentation debt

### 11. `claude-md-rewrite` — bring the source of truth up to date

Currently wrong, and wrong in ways that will mislead the next session:

- "The present is never shown" and "there is no today state" — superseded by *a view owns a tense*,
  which is a stronger and more checkable rule.
- The on-ramp: "opens on the circle, descends to Wat Ket as it is now, hands over to 2045." There
  is no 2026 Wat Ket state. `baseline` stops being a reachable-but-unselectable register and
  becomes purely substrate.
- The idle reset to 2026 — nothing to reset to.
- **Registers** as a concept, which existed to describe a thing that could be walked through but
  not chosen. That thing is gone.
- The three-views section's scale ordering, and `docs/architecture.md` alongside it.

Worth writing down while it is fresh: *a view owns a tense* re-justifies the no-dates-on-edits rule
from a better direction. An edit does not need a date because its period is whichever view it
lives in. `validateScene` may have a stronger invariant available to it than
`FORBIDDEN_EDIT_FIELDS`.

- Depends on: decisions above being settled, not on any code
- Sections: none — no UI, no logic

### 12. `design-system-rewrite`

`docs/design-system.md` currently derives from the brand concept deck and describes a single
register. It needs the two-register structure and a note on why the printed panels supersede the
deck: the panels are what is on the wall.

- Depends on: 1, 2

---

## Not yet items

Things raised and left open, kept here so they are not rediscovered:

- How far embroidery goes into the 3D. Palette only, DOM chrome only, or textured geometry. The
  third is a renderer change with a perf number attached and that number should exist before the
  decision, not after.
- Whether the tilt the pudding piece uses is available anywhere. Not in the city — the backdrop
  raster is exact only because the orthographic camera never rotates. Possibly in the valley,
  which has no raster backdrop to falsify.
- Whether scroll visiting all three views defeats "a view builds on first visit and is kept."
  Scoping chapters to a view means it does not, but the first *deliberate* switch still pays full
  build cost, and narration is the only thing available to cover it.
