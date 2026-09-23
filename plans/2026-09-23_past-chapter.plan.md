---
slug: 2026-09-23_past-chapter
status: draft
started: 2026-09-23
finished:
issue:
---

# Past — five connections across the basin, then a timeline to pull them apart

## Context

The valley view renders a 120 km hillshade and says nothing. It is a landscape you look at. This
chapter gives it an argument: **Chiang Mai has repeatedly been reshaped by whatever connected it to
the world, and each new connection brought new people, technologies and economies with it.**

The research is done and distilled at `docs/research/2026-09-23_past-chapter.findings.md`. Read it
before writing any copy — it corrects four claims the printed exhibition panels make, and the
corrections are the interesting part.

**Each chapter is a tilted martini glass.** Base, then an author-driven stem, then a bowl that
widens into exploration. Here the stem is the five connections arriving in order, and the bowl is
an interactive timeline that lets a reader pull the layers apart and find the nuggets.

## Goal

A visitor watches five connections arrive across the basin in sequence — river, caravans, roads,
rail, air — each drawn with the geometric precision its evidence supports, and is then handed a
timeline they can scrub to turn layers on and off and read the dated detail behind each.

The last thread has no route to draw, and that is what hands the chapter over to Present.

## Approach

**Built on the scrolly shell.** The scroll section, the explore release, the layer toggles and the
hover-blurb / click-modal pair are all `2026-09-24_scrolly-shell`. This plan owns the five layers,
their geometry, their copy and their camera beats — nothing else.

**Point items share the Futures icon system.** The airport and the railway station are drawn with
the same iconography as the 2045 pins, specified 24 Sep 2026. The two chapters that share the
valley therefore share a visual language, so a visitor reads the same grammar in both — and the
icon production run is one set rather than two.

**Lines are hoverable, not just icons.** A road or a rail alignment answers on hover with a blurb
and on click with a modal, the same as a point. That is a real constraint on the shell: hit-testing
has to work on thin geometry with a screen-space tolerance, or a line becomes untappable as soon as
it is zoomed out.

**Five layers, not four.** An earlier shorthand said "caravans, roads, rail, airport" and dropped
the river. The Ping is the strongest confirmed thread in the whole chapter and the argument opens
with it. The research also separates caravans from modern roads deliberately — different eras,
different certainty, and it warns specifically against implying that Highway 11 paved an ancient
Yunnan alignment.

**Certainty is visual grammar.** The single best idea the research produced, and it resolves what
was an open question about whether to draw real geography or the panel's stylised diagram. Each
layer gets the geometry its evidence supports:

| Layer | Geometry | Certainty |
|---|---|---|
| River — the Ping | Precise centreline, full frame | Confirmed |
| Caravans — Yunnan–Lan Na | **Broad dashed corridors between nodes** | Probable corridor, no centreline exists |
| Roads — Highway 11 | Precise current alignment | Confirmed, and explicitly a *different layer* from caravans |
| Rail — the Northern Line | Precise track, station, Khun Tan tunnel | Confirmed |
| Air and remote work | Nodes and arcs. **No route** | No route exists |

**Why this matters beyond honesty:** the valley also appears in the Futures chapter, where soft
zones are used simply because they read better. Same rendering, opposite reasons. **Write the
reason at the point the code chooses**, or a later session will notice the duplication, unify the
two, and the past will quietly lose its honesty about uncertainty.

**Remote work is the seam and it is structural.** River, caravans, roads and rail all have
alignments you could survey and they terminate in the basin. Remote work arrives from everywhere at
once and its alignment is the internet, which is not geography. So the valley draws everything it
is capable of drawing, and the one thread it cannot draw is the one that hands over to the circle.
The research reached the same conclusion independently: *do not draw a fibre-optic cable out of
Wat Ket.*

**Rejected: the panel's radial diagram as the geometry.** It is a beautiful stylised network and it
is not surveyed. Real alignments rendered in the panel's *line styles* is the synthesis — the same
move already made with the relief, where the DEM is real and the treatment is brand.

**Rejected: quoting the panels.** Four of their claims do not survive research. The screen is not
obliged to repeat its sibling and should not.

## Tasks

- [ ] `threads.ts` — layer definitions with an explicit `certainty` field, and an OSM fetch for the
      confirmed alignments
- [ ] Line styles per certainty, from the KV: solid, dashed corridor, node-and-arc
- [ ] The stem — five beats, one layer arriving per beat, over the hillshade
- [ ] Point-item icons: airport, railway station, and the rest, from the shared registry
- [ ] Blurb and modal copy for every icon and every line
- [ ] Copy for five layers plus the dated nuggets, EN and TH, **written from the findings file**
- [ ] The remote-work beat as terminal, handing over to Present

## UI mockups (ASCII)

**Stem**, mid-sequence. Two layers arrived, three to come. The rail marks the beats.

```
┌──────────────────────────────────────┐
│ PAST                                 │
│ The valley                           │
│   ◉──◉──○──○──○                      │  ← chapter rail, 5 beats
│                                      │
│      ╱╲    ╱╲╲   ╱╲                  │
│    ╱  ╲╲ ╱    ╲╱  ╲╲                 │  hillshade
│   ~~~~~~~~~~~≈≈≈~~~~~~~              │  Ping, solid
│   ░ ░ ░ ░ ░ ░                        │  caravans, dashed corridor
│                                      │
│ ROADS                                │  ← kicker
│ Mule caravans to Yunnan              │
│ Trade is documented. A route is not. │
└──────────────────────────────────────┘
```

**Bowl.** The timeline appears; layers become toggles; scrubbing filters what is drawn and what
the readout says.

```
┌──────────────────────────────────────┐
│   [~] river  [░] caravans  [─] roads │
│   [═] rail   [·] air                 │
│                                      │
│      ╱╲    ╱╲╲   ╱╲                  │
│   ~~~~~~~~~~~≈≈≈~~~~~~~              │
│                                      │
│ 1850 ──┬──────┬────┬───┬──── 2045    │
│       1867   1921 1934 2013          │
│        ▲                             │
│ 1867 · Bangkok to Chiang Mai took    │
│ about three months upstream, a month │
│ of it through thirty-two rapids.     │
└──────────────────────────────────────┘
```

States that differ: **a layer with nothing in the scrubbed window** — the toggle dims rather than
vanishing, so the set of layers is stable; **the air layer** — has no line at any date, only nodes,
which is the point and the caption says so.

## Keyboard interaction

1. **Tab order** — rail, layer toggles, timeline scrubber, stage.
2. **During the stem** — `Space` or `→` advances a beat; `Escape` skips to the end and reveals the
   timeline.
3. **Toggles** — a group with roving tabindex, `Space` toggles. Same pattern as `Rail`, and for the
   same reason: arrowing should move focus, not fire expensive redraws.
4. **Scrubber** — `role="slider"`, arrows step by year, `PageUp`/`PageDown` by decade,
   `Home`/`End` to the ends. `aria-valuetext` reads the year, not the raw index.
5. **Focus management** — the nugget readout is `aria-live="polite"`, so scrubbing announces
   without stealing focus from the slider.

## Test list (TDD)

- every thread declares a `certainty`, and the renderer refuses an unknown value — unit —
  `src/engine/__tests__/threads.test.ts`
- a `probable` thread never produces a solid line — unit. **This is the test that protects the
  honesty rule from a later refactor**
- alignments clip to the 120 km frame — unit
- off-frame features resolve to an edge bearing and a distance, not a clipped stub — unit; Chiang
  Dao is the case, at 64 km
- `threadsAt(year)` returns only layers that exist by that year — unit
- …is stable at exact boundary years — unit, the off-by-one that a scrubber finds immediately
- the air layer yields nodes and zero polylines at every year — unit, pins the "no route" rule
- the chapter's last beat is terminal and hands to `circle` — unit — `chapters.test.ts`

## Verification

1. `/?view=valley` — base frame, hillshade, no threads drawn, rail showing five empty beats.
2. `Space` five times: Ping solid; caravans as a dashed corridor, visibly *not* a line; Highway 11
   solid and clearly a separate layer from the caravans; rail with station and tunnel; then air as
   nodes and arcs with no route.
3. The fifth beat hands over to the circle rather than stopping.
4. `Escape` from any beat reveals the timeline.
5. In the bowl: toggle each layer off and on; scrub to 1867, 1921, 1934, 2013 and read the nugget.
6. Chiang Dao appears as an edge arrow with a bearing and a distance, not a line running off frame.
7. Compare against `docs/references/CosmoLocal Exhibition_5_small.pdf` p14 — the screen should use
   the panel's *line styles* while making none of its four corrected claims.
8. Narrow to 390 px: the timeline is usable by thumb and the nugget does not overflow.

## Out of scope

- The Futures use of the valley. Same field, different overlay, different plan.
- Historical map rasters. The 1945 survey sheet is rights-unclear and is reference-only.
- Any height-limit polygon. Contested, and nothing ships until the gazetted instrument is verified.
- Closing the research gaps — first-year timetables and fares, Khun Tan labour records. Archival
  work, not build work.

## Open questions

- [ ] Does the bowl's timeline span 1850–2045, or stop at the present? Running it to 2045 invites a
      comparison with the Futures chapter that this chapter is not making.
- [ ] Do the caravan corridors animate direction of travel, or stay static? Movement would imply a
      confidence the corridors do not have.
- [ ] The station sits 1.57 km from the scene origin, which is inside the *city* frame. Does the
      rail thread's terminus get a marker in the city view too, or does Past stay valley-only?

## Outcome

_Not started._
