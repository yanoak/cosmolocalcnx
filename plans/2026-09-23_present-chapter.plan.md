---
slug: 2026-09-23_present-chapter
status: active
started: 2026-09-23
finished:
issue:
---

# Present — the circle grows out of Wat Ket

## Context

The circle view exists and renders a GHS-POP field with a tappable readout. What it does not have
is an **argument delivered in a sequence**: you arrive cold, and the claim sits in a caption.

Two things changed on 23 Sep 2026 and this plan is their consequence.

**The circle is now centred on Wat Ket.** It used to be the Valeriepieris circle — 21.00°N
100.29°E, radius 3,437 km — with Wat Ket at 8.15% of the radius from its centre. That is
superseded. The claim is no longer where Wat Ket sits inside somebody else's circle; it is how far
you have to go *from Wat Ket* to cover half the world's population.

**Computed from the committed 12,000 km field: about 3,400 km**, bracketed 3,303 / 3,416 / 3,524
for a world of 7.8 / 8.0 / 8.2 billion. The Valeriepieris radius is 3,437 km — so **moving the
centre 280 km to Wat Ket costs almost nothing**, which is a better claim than the one it replaces.

**Each chapter is a tilted martini glass** — flat base, then an author-driven stem, then a bowl
that widens into reader exploration. Present already has its bowl: `onPickCell`, `pickedCities` and
the city readout. It has no base and no stem. This plan is mostly the stem.

See `CLAUDE.md`, "Three views are the spine".

> **Superseded in part, 24 Sep 2026.** The argument, the data pipeline, the curve and the claim
> stand. The RENDERER moves: Yan saw the columns and asked for a real map under the data, and
> `plans/2026-09-24_present-on-maplibre.plan.md` takes the chapter to MapLibre GL with a
> self-hosted PMTiles basemap. The three.js columns built here are the cost of finding that out.

## Goal

A visitor arrives at the Present chapter, is shown a circle growing outward from Wat Ket with a
running count of the people inside it, watches it stop at half of humanity at roughly 3,400 km,
and is then released to pan, zoom and tap the population field for themselves. The number on
screen is computed from committed data rather than asserted.

## Approach

**The field is extruded, not flat.** Specified 24 Sep 2026: the visualisation stops being a heat
map lying on the ground and becomes the Pudding piece's "mountains" — one column per cell, height
by population. That retires the *no extruded population columns before 24 Sep* non-goal, which has
expired on its own terms.

Two things make it cheaper than it sounds. **The camera needs no change**: it is already isometric,
so extruding cells gives the mountains look directly, without the tilt the Pudding piece needs a
Mapbox camera for. And **population is additive**, so the committed 512-cell field block-sums
exactly to 256 and 128 — which is the phone's LOD, free and lossless rather than approximated.

One instanced mesh, one column per populated cell. Sized from the committed 3,437 km field, with
an isometric camera seeing three faces of a box (6 triangles):

| Field | Populated cells | Triangles | vs the 150k phone ceiling |
|---|---|---|---|
| 512² | 89,051 | 534k | 3.56× |
| 256² | 25,954 | 156k | 1.04× |
| 128² | 7,415 | 44k | 0.30× |

**The exhibition screen draws 512² and this plan is built for that screen.** Decided 24 Sep 2026:
the laptop and the projector are the priority, and 534k triangles is well inside what that machine
already handles with `?lod=full` at roughly a million. The phone is not the design constraint for
this chapter. When it is, the block-sum makes 256 and 128 exact, so the LOD is a switch rather than
a redesign — the same shape as `?lod=full`.

**The growing radius is a shader uniform.** "Desaturate outside the circle" while the circle grows
would otherwise mean recolouring tens of thousands of instances per frame. One float uniform,
compared against instance position in the fragment shader, costs nothing. Materials stay unlit by
rule — this is `onBeforeCompile` on `MeshBasicMaterial`, not a lighting change.

**Picking moves from texel to instance.** `pickedCell` reads a texel of the flat field today; on
columns it is an instance id from the raycaster. The readout — name, country, population — already
has its data: `cities.json` carries `country`.

**The growth is the argument, not a transition.** A static circle with a caption states a fact; a
circle that grows while a counter climbs makes the reader feel the curve flatten. The curve is the
content:

| From Wat Ket | Share |
|---|---|
| 1,000 km | 4.0% |
| 2,000 km | 22.6% |
| 3,000 km | 50.4% |
| 6,000 km | 66.6% |

Half of humanity, then the next 3,000 km buys a sixth as much. That shape is why this is worth
animating rather than captioning.

**The field must be regenerated on Wat Ket.** The committed field is an AEQD raster centred on
21.00/100.29, and in that frame a constant-distance-from-Wat-Ket circle is not a circle. This is
one command — `build-region.py` already takes `--centre` and `--radius-km` — and it must stay
byte-identical on re-run, per the determinism rule.

**The radius is computed at build time, not hardcoded.** A cumulative-population-by-radius curve
is derived from the field and committed alongside it. The headline number then cannot drift from
the raster it came from, and the counter during the growth animation reads the same curve.

**Rejected: keeping the Valeriepieris centre and drawing an off-centre circle.** Cheaper, and it
would look approximately right, but distance-from-Wat-Ket would be wrong everywhere except along
one axis — and the entire claim is a distance from Wat Ket.

**Rejected: quoting a single world population figure.** The 12,000 km disc excludes everything
beyond 12,000 km from its centre, which is the Americas, so the in-field total is 7.14 bn against a
real world of roughly 8. That missing tail is all ≥11,720 km from Wat Ket, so it moves the
denominator and not the shape — but it is why the answer is honestly a bracket. **Show a rounded
number and footnote the method** rather than implying a precision the field does not have.

## Tasks

- [ ] Regenerate **three** artefacts on 18.7912/99.0043 — the 3,437 km field, the 12,000 km world
      field, and `cities.json`, whose `km` coordinates are AEQD from the old centre — each with the
      byte-identical re-run test
- [x] `halfPopulationRadius()` and the cumulative curve, derived at build time and committed
- [x] The base — a still frame on Wat Ket, before anything grows
- [x] Extrude the field — instanced columns at 512², height by population
- [x] The radius as a shader uniform on the unlit material; inside/outside by distance from origin
- [x] Picking by instance id, replacing the texel lookup
- [x] The stem — circle growth driven by the chapter score, counter reading the curve
- [x] Camera zooms out as the circle grows, so the ring holds a roughly constant share of screen
- [x] Hand the bowl its release: pan, zoom and hover stay locked until the stem ends
- [x] Hover readout on a column — name, country, population
- [ ] Copy, EN and TH — EN is the seeded sample in the doc; TH waits on the copy pipeline growing a Thai tab
- [x] Update `aeqd.test.ts` — the 279.98 km anchor is no longer the claim

## UI mockups (ASCII)

**Base.** No circle yet. One point.

```
┌──────────────────────────────────────┐
│ PRESENT                              │  ← rail
│ The circle                           │
│                                      │
│              · Wat Ket               │
│                                      │
│ Half of everyone alive is closer to  │
│ here than you think.                 │
└──────────────────────────────────────┘
```

**Stem.** The circle grows; the counter climbs; the ring carries its own radius.

```
┌──────────────────────────────────────┐
│          ╭────────────╮              │
│        ╭─╯  ░░▓▓██▓░  ╰─╮            │
│        │   ░▓███▓▓░░    │            │
│        ╰─╮  ·Wat Ket  ╭─╯            │
│          ╰────────────╯              │
│                                      │
│  2,000 km          1.61 bn   22.6%   │
└──────────────────────────────────────┘
```

**Stem, later.** The camera has zoomed out to keep the ring a constant share of screen, so the
world shrinks behind a ring that appears to stay still. The columns are the visualisation.

```
┌──────────────────────────────────────┐
│     ╭──────────────────────╮         │
│    ╭╯    ▂▃ ▅▇█▆▃  ▂       ╰╮        │
│    │  ▂▃▅███████▇▅▃▂  ▃▂    │        │
│    │     ▃▅█▇▅▃ ·Wat Ket    │        │
│    ╰╮   ▂▃▅▃▂        ▂▃    ╭╯        │
│     ╰──────────────────────╯         │
│  3,000 km          3.60 bn   50.4%   │
└──────────────────────────────────────┘
```

**Bowl.** The ring stops, the controls unlock, a column answers on hover or tap.

```
┌──────────────────────────────────────┐
│     ╭──────────────────────╮         │
│    ╭╯    ▂▃ ▅▇█▆▃ ╭──────────────╮   │
│    │  ▂▃▅███████▇▅│ Dhaka        │   │
│    │     ▃▅█▇▅▃ · │ Bangladesh   │   │
│    ╰╮   ▂▃▅▃▂     │ 22,478,116   │   │
│     ╰─────────────╰──────────────╯   │
└──────────────────────────────────────┘
```

States that differ: **field still loading** — the base holds rather than starting the stem;
**stem interrupted** by a deliberate input — jumps to the end state rather than pausing, because a
half-grown circle is not a claim.

## Keyboard interaction

1. **Tab order** — rail, then the stage. The stage is already `role="application"` and focusable.
2. **During the stem** — `Space` or `→` advances a beat; `Escape` skips to the end of the stem and
   unlocks the bowl. Nothing else is bound, because nothing else should be possible yet.
3. **In the bowl** — arrows pan, `+`/`-` zoom, `Enter` reads out the focused cell. `1`/`2`/`3`
   still switch chapters.
4. **Focus management** — focus stays on the stage across the stem-to-bowl handover; the readout is
   `aria-live="polite"` so a tap announces without stealing focus.

## Test list (TDD)

- `halfPopulationRadius(curve, worldTotal)` returns the radius where cumulative crosses half — unit
  — `src/engine/__tests__/region.test.ts`
- …is monotonic in `worldTotal` — a bigger world means a bigger radius — unit
- …clamps rather than throwing when the curve never reaches half — unit, the case a smaller field
  would actually produce
- the committed curve is monotonic non-decreasing in radius — unit, guards a corrupt regeneration
- the curve's final value equals the field's `stats.totalInside` — unit, ties the two artefacts
- the regenerated field is byte-identical on re-run from the same cached tiles — unit
- the field's projection centre equals the scene origin — unit. **This is the test that catches
  somebody regenerating on the old centre**, which would silently make every distance wrong
- chapter score: the stem's last beat is terminal and unlocks the bowl — unit — `chapters.test.ts`

## Verification

1. `/?view=circle` — a single point on Wat Ket, no ring, copy visible. Nothing pans or zooms.
2. Press `Space` repeatedly — the ring grows, the counter climbs, the radius label tracks it.
3. It stops at roughly 3,400 km and about half. The number shown is rounded and footnoted.
4. Press `Escape` mid-growth — jumps to the end state rather than freezing part-grown.
5. After the stem, drag to pan and pinch or `+`/`-` to zoom. Both were inert before and work now.
6. Hover or tap a tall column — name, country and population. Distance from Wat Ket is measured
   from Wat Ket, not from 21.00/100.29.
9. On the exhibition machine at projector resolution: the full 512² field holds a smooth frame
   rate through the whole growth animation. Note the number; it is the baseline every later chapter
   is measured against.
7. Narrow to 390 px: the counter stays legible and nothing overflows.
8. `1`/`2`/`3` still move between chapters from anywhere in the sequence.

## Out of scope

- The Past and Futures chapters, and the shared `chapters.ts` module beyond what this needs.
- Any change to `aeqd.ts` itself — the projection is unchanged, only its centre argument moves.
- Re-fetching GHS-POP for a true global total. The bracket is honest; closing it is a separate,
  optional task.

## Open questions

- [ ] Which world total does the on-screen number use — or does it say "about 3,400 km" and leave
      the bracket to a footnote? Leaning the latter.
- [ ] Does the ring keep growing past half, greyed, to show the flattening? It is the strongest
      part of the data and the stem currently stops right where it gets interesting.
- [ ] The old 3,437 km Valeriepieris radius: drawn as a ghost for comparison, or dropped entirely?
      Showing both makes "Wat Ket is as good a centre" visible rather than stated.

## Outcome

_Not started._
