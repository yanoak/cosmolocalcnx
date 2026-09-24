---
slug: 2026-09-23_futures-chapter
status: active
started: 2026-09-23
finished:
issue:
---

# Futures — a landscape of pins, across two scales

## Context

2045 is the world of **Faiways**, the fictional newspaper printed for the exhibition. Eight pieces,
twelve places, one coherent future. All the content is assembled at
`docs/research/2026-09-23_futures-chapter.context.md` — read it first; this plan does not repeat it.
The context file counts thirteen; **Mae Chaem was dropped when the copy was written on 24 Sep** —
it has no hotspot id in the doc and no icon — and nothing here brings it back.

## Where it stands, 24 Sep 2026

Revised the evening the exhibition opened, against what the day actually shipped. Read this before
the tasks, because the plan below was written a day earlier and three of its premises have moved.

| The plan assumed | What is true tonight |
|---|---|
| A `/jig` page to iterate icons | Not built and not needed: `scripts/gen-icons.py` wrote contact sheets, Yan kept round one whole. **Task dropped.** |
| Twelve icons to generate | **Done.** `public/icons/*.webp`, keyed and trimmed, sizes and ground anchors measured into `src/content/icons.json`; `iconFor` / `validateIconJoin` in `icons.ts`. See `2026-09-24_pin-icons`. |
| Copy to write | **Twelve hotspot entries exist** in the doc's Future tab — `label`, `blurb`, `body` each — and four beats: `gen-c`, `fai`, `ban-tawan`, `lanna-world-school`. **No valley beats yet, and no story text.** |
| Hotspots in `wat-ket.json` | **None.** `hotspots: []`. The score's `ban-tawan` and `lanna-world-school` beats name hotspots nothing renders. This is the first task. |
| Pins rendered | **Nothing draws a hotspot anywhere.** `Diorama` accepts a beat and ignores its `hotspots`; `ValleyView` draws town labels as drei `Html`, which is the pattern to copy. |
| The stem shifts to the valley | The score has four city beats and the last is terminal *"until the doc gains valley beats"*. |
| Explore switches views | No control exists that changes view inside a chapter; the only view changes are the beat's and the chapter's default. |
| Stories as a full-viewport overlay | No story text in the copy schema — a hotspot's `body` is *"the full write-up in the modal or story overlay"*, one paragraph. The eight articles are in the Faiways doc and the **printed newspaper is on the table in the room**. |

What that adds up to: **the content and the artwork are ready and the renderer has nothing to put
them on.** The rest of this plan is the renderer, the data entry, and two decisions about scope.

Two cuts, proposed here and marked for Yan:

- **Cut the story overlay for September.** The pin's popup carries `blurb` and `body`; where a
  pin belongs to a Faiways piece it says so — *"Read 'Journeyfolk closes applications at 5,000' in
  Faiways"* — and the newspaper is physically in the room. `Story.tsx` moves to December with the
  articles, if they are ever wanted on screen at all. This drops the biggest unbuilt piece of the
  shell plan without losing anything a visitor at Pantip can reach.
- **Chiang Dao is clamped, not arrowed.** It has an icon and copy like every other pin; at 64 km
  north it sits 4 km past the valley's ±60 km frame. Rather than a second component with no icon,
  the pin is drawn at the frame edge along its bearing with its distance in the label — *"Chiang
  Dao · 64 km north"*. One pin does not justify an arrow system, and Mae Chaem, the other case, is
  gone.

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

**Built on the scrolly shell.** Scroll section, explore release, hover blurb and click modal are
all `2026-09-24_scrolly-shell`, shared with Past — including the icon system, which the Past
chapter's point items use too.

**The stem reveals one pin per beat, and changes view partway.** Specified 24 Sep 2026: it opens in
the **city**, introduces the four places there one at a time, and once the city items are done it
**shifts to the valley** for the rest. Explore then offers both views switchable.

That is a view change *inside* a chapter, which the earlier plans did not anticipate. It is
legitimate precisely because the beat **names** the view: the invariant that matters is that no view
is ever *derived* from a zoom offset, and naming one in a score does not do that. Worth writing
down, because it looks like the rule being bent and is not.

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

**A story, if it ever comes to the screen, is the shell's full-viewport overlay state.** Not a
modal, not a route — see `2026-09-24_scrolly-shell`. The scene stays mounted and dimmed behind an
overlay with its own scroll container, so opening a story never pays the build cost again.
**Proposed cut for September** — the newspaper is in the room; see "Where it stands".

**Pins are document hotspots.** No `pins.ts`. Each of the twelve places is a `Hotspot` in
`wat-ket.json` with `chapter: 'futures'`, a `view`, an `at` in local metres and an `icon`. **No
`date` and no label or body in the document** — those were in the 23 Sep draft and the shell plan
took them out the next morning: the words live in the Google Doc and join by id, and a date field is
how the time slider creeps back. The small line above a name is a `kicker` in the copy. The story a
pin belongs to is likewise a copy field. That is the one architectural rule — the scene is a
document — applied to the future's furniture, and it is also what makes the printed newspaper map
an *export* rather than a second drawing.

**Placement is lat/lon through the scene's own projection, with the reason written beside it.**
The context table gives distances and bearings; the pins are entered as approximate coordinates and
projected into local metres by the same function the buildings use, so the city's four sit exactly
where the diorama's streets say they do. The valley eight are placed to the nearest kilometre or so
and the file says so at each one — see the precision policy below.

**Pins are DOM buttons over the canvas, not sprites in it.** Decided in this revision. The
valley's town labels are already drei `Html` — a DOM node whose position the renderer projects
each frame — and a pin is the same thing carrying an `<img>` of its sprite, anchored at the ground
point the sidecar measured, and a `<button>` with the place name. Three things fall out. It is
**constant screen size at every zoom**, which is what a landmark map's icons are and what stops a
sprite plane from being a postage stamp at valley fit and a billboard at city zoom. The **tap target,
the accessible name and the keyboard reach are the button's**, free, which closes most of the
Keyboard section below. And the icon **never enters WebGL** — no texture atlas, no alpha sorting,
twelve `<img>` tags. The cost is that a pin draws over geometry rather than behind it, which is
the convention for a marker and correct for a landmark. In the valley the pin sits on the sampled
terrain height, as the town labels do; in the city on the ground.

**The popup is part of the pin.** It opens above the icon inside the same projected node, so it
moves with the pin and never needs its own screen-space maths. One open at a time; tap elsewhere or
`Escape` closes it. It carries kicker, name, blurb, body and — where the copy names one — the
Faiways piece the pin comes from. It is the shell plan's "click modal for short items", and for
September it is the *only* level: see the cut above.

**No edge arrows at city scale.** Decided 24 Sep 2026 unless objected to: at city zoom eight valley
pins fall outside the frame, and eight arrows on the edge would be clutter that says nothing. The
city inset is a zoom of the same pin set; the view switch in explore is the affordance for the rest.
**And no edge arrows at valley scale either, since this revision** — the one off-frame place is
clamped to the edge with its distance in the label, see "Where it stands".

**The view switch in explore is a pair, not a rail.** Futures is the only chapter with two views,
so the control appears only there: `City · Valley` in the explore bar, where "Story" used to sit
before the 24 Sep evening change moved the way back to the top. Switching is a cut between two
mounted views, as a chapter change is, and the pins are the same set in both — the city shows the
four inside its rectangle, the valley shows all twelve. This is the one place a visitor picks a
view directly, and it is still not a zoom: `views.ts` keeps its rule.

**The stem: four city pins one at a time, then the valley in groups.** The city half is as Yan
specified on 24 Sep. For the valley, eight single-pin beats on top of two intro beats and four
city beats makes a fourteen-card scroll, which is longer than Past and Present together. Proposed:
**three valley beats grouped by what they share** — the near valley (KAE at Wiang Kum Kam, Wat
Umong, Doi Suthep), the farms and the sky (Doi Saket, Lamphun hills, Mae Taeng, Chiang Dao), and
the network (Lamphun town, reaching to Tanzania) as the terminal beat. Nine cards. The first valley
beat is the view change and earns it: the camera cuts from the shed to the whole basin with three
new pins on it. Each needs copy in the doc, which is Yan's — five more beat entries.

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

In build order. Each step leaves the piece working.

- [ ] **Data.** The twelve places as `Hotspot`s in `wat-ket.json` — `chapter: 'futures'`, `view`,
      `icon`, `at` projected from approximate lat/lon with the imprecision reason at each valley
      entry. `validateCopyJoin` and `validateIconJoin` against the *real* document and doc become a
      test, so the three sides — coordinates, words, artwork — can never disagree silently
- [ ] **`Pins.tsx`.** drei `Html` buttons at each hotspot's position, sprite `<img>` on its
      measured anchor, place name as the button's text. Mounted in the city by `Diorama` and in the
      valley by `ValleyView` on the sampled height. Filtered by chapter and view; in the stem only
      the current beat's `hotspots` show, in the bowl all of them
- [ ] **Popup.** Tap opens the card above the pin — kicker, name, blurb, body, Faiways piece —
      one at a time, dismissed by tap-away or `Escape`; focus returns to the pin
- [ ] **Chiang Dao clamped** to the valley frame edge along its bearing, distance in the label —
      a pure function with the two-case test below reduced to one
- [ ] **Explore's `City · Valley` pair**, Futures only, in the explore bar
- [ ] **The valley beats** in `scores.ts` once the doc has their copy — the view change on the
      first, the terminal flag moved to the last
- [ ] **Keyboard in the bowl.** Arrows move between pins by proximity, `Enter` opens, `Escape`
      closes — `nearestPin` as a pure function
- [ ] **Credit line** for the generated artwork in the footer, carried over from `2026-09-24_pin-icons`
- [ ] **Copy in the doc, Yan's:** five valley beats; an optional `kicker` (the date) and `story`
      (the Faiways headline) on each hotspot; Thai is the bilingual pass, not this plan
- [ ] ~~`/jig` — the icon comparison page~~ superseded by the generator's contact sheets
- [x] ~~Twelve isometric icons~~ done in `2026-09-24_pin-icons`
- [ ] ~~Stories wired to the shell's overlay state~~ **proposed cut for September**, pending Yan

## UI mockups (ASCII)

**Bowl at valley scale.** Distinct oversized icons, labels on conduits. Chiang Dao sits on the
frame edge with its distance in the label rather than as an arrow.

```
┌──────────────────────────────────────┐
│ FUTURES                              │
│ 2045                                 │
│                        ╱▲╲ Chiang Dao│
│   ⌂ Mae Taeng              64 km N   │
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
        │ In Faiways: "Lanna World │
        │ School's First Cohort…"  │
        ╰─────────┬────────────────╯
                  ▼
                 ▦
```

**Story page**, over the still-mounted scene — **December, if at all** (see the cut above).

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

States that differ: **icons still loading** — the button and its name are there before the
`<img>` arrives, so a pin is tappable from the first frame; **off-frame pin** — clamped to the
edge with distance in the label; **two pins overlapping at city scale** — the nearer one wins and
the other offsets along its conduit rather than stacking; **during the stem** — only the current
beat's pins exist, and they cannot be tapped until the bowl, because a popup over a scrolling card is
two things asking for the same thumb.

## Keyboard interaction

1. **Tab order** — rail, then the stage. Pins are reached from inside the stage, not as twelve
   tab stops: the pins are DOM buttons, so one of them holds a roving `tabindex` and the rest are
   reached by arrow from it.
2. **During the stem** — `Space` or `→` advances; `Escape` skips to the bowl.
3. **In the bowl** — arrows move between pins by proximity, `Enter` opens the popup, `Escape`
   closes it. `Enter` again follows the link.
4. **Story page** — December. If built: focus moves to the heading on open and returns to the
   originating pin on close; `Escape` closes.
5. Every pin carries its place name as accessible text; an icon alone is not a label.

## Test list (TDD)

- every futures hotspot names a `view` — unit — `src/engine/__tests__/scene.test.ts`
- a pin outside the ±60 km valley frame is clamped to the edge along its bearing and reports its
  true distance — unit; Chiang Dao at 64 km north is the case, and a pin inside the frame is
  returned unchanged
- every futures hotspot's icon exists in the registry, and every icon the registry holds for the
  chapter is used by exactly one hotspot — unit, against the real `wat-ket.json` and `icons.json`
- every futures copy entry has a hotspot and every hotspot has copy — `validateCopyJoin` against
  the real document and the real doc, not a fixture
- city-scale pins all fall inside the scene rectangle — unit. Catches a pin authored at a plausible
  coordinate that is actually outside the diorama
- every Faiways piece named in the copy is named by at least one pin — unit over `copy.json`.
  **This is the test that would have caught Arusha**
- every pin has a distinct icon id — unit, pins the landmark-not-marker rule
- `nearestPin(from, direction)` is deterministic and never returns the pin it started from — unit
- the chapter's last stem beat is terminal and unlocks the bowl — unit — `chapters.test.ts`

## Verification

1. `/?view=city` or the rail's third stop — base frame, then the stem, then release.
2. In the bowl at valley scale: twelve distinct icons, none repeating a shape, each on the ground
   rather than floating — check Doi Suthep, where the height is greatest.
3. Chiang Dao sits on the northern frame edge with "64 km" in its label.
4. Zoom to city scale — Wat Ket, Ban Tawan, Anusarn and Wua Lai are present and legible. Ban Tawan
   is **west** of Tha Phae Gate.
5. Tap a pin: popup with kicker, name, blurb, body and the Faiways piece. Tap elsewhere: it
   dismisses. Zoom with it open: it stays on its pin.
6. `City · Valley` in the explore bar: the cut is immediate, the same pins are on both, and the
   **scene is never rebuilt** — confirm with a timing or a frame counter, not by eye. Back to the
   city: the four are where the streets say.
7. Keyboard alone: reach a pin, open it, read it, come back.
8. Narrow to 390 px: tap targets are thumb-sized, popups stay on screen, no horizontal scroll.

## Out of scope

- **A second scenario.** There is one 2045 and the schema already supports another for free.
- Extruded buildings of any kind, and therefore `building.intervention`.
- The printed newspaper map itself. It is an **export of the same hotspots** — see the roadmap's
  "The newspaper map is an export" — so this plan owns the data and the export consumes it, and
  nothing about the map is drawn twice.
- The eight full stories on screen, **proposed** — the popup names the piece and the newspaper is
  in the room. Thai for all copy is the bilingual pass.
- Mae Chaem. Dropped with the copy on 24 Sep; the reforestation plots have no pin.

## Open questions

- [ ] **Cut the story overlay for September?** Proposed yes — see "Where it stands". Yan's call.
- [ ] **The valley in three grouped beats rather than eight singles?** Proposed above; nine cards
      in all. The grouping is a suggestion and the copy is Yan's either way.
- [x] ~~How many beats does the stem have?~~ Two intro beats exist and read well; the rest is the
      question above.
- [x] ~~Where does the stem hand over from city to valley?~~ On the first valley beat, which is
      also the first group — the cut IS the transition, no dedicated beat.
- [ ] Does the chapter end anywhere, or is the bowl terminal? It is the last chapter, so there is
      nothing to hand to. The explore bar already shows no "Next" on the last chapter; the attract
      loop, when it exists, is what cycles back to Past.
- [x] ~~Icon style: roundels or bare sprites?~~ Bare sprites, keyed out to alpha — settled by the
      icon round Yan kept on 24 Sep.
- [ ] Do the pins show during the stem at all, or only their beat's? Proposed: only the beat's,
      cumulative within the city half, then the groups — a pin arriving is what a beat *does*.

## Outcome

_In progress. Revised 24 Sep 2026 evening against the day's work; artwork and copy done, renderer
not started._
