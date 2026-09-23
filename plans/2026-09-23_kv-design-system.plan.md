---
slug: 2026-09-23_kv-design-system
status: active
started: 2026-09-23
finished:
issue:
---

# The design system comes from the printed panels

## Context

`docs/design-system.md` was written on 16 Sep from the **brand concept deck**. On 22 Sep the
actual exhibition artwork landed at `docs/references/CosmoLocal Exhibition_5.pdf` — 56 printed
panels — alongside the KV asset set that arrived on the 19th. The panels are what will be on the
wall beside the screen, so they, not the deck, are what the screen has to match.

**The palette survives this intact.** Every value the panels use is already in `theme.ts`, exactly:

| Panel element | Value | Existing token |
|---|---|---|
| Kicker, and the pipe rail | `#FF8A00` | `cosmo.orange` |
| Inverse panel ground | `#2B184C` | `cosmo.purple` |
| Headline and body ink | `#1F1F1F` | `cosmo.charcoal` |
| Reversed text | `#FCFAF6` | `cosmo.offWhite` |
| Typeface throughout | IBM Plex Sans Thai | already the project's |

Extracted from the PDF's own span colours and fill operators rather than sampled from pixels, so
these are the specified values, not rounded ones. The one apparent exception — the gold-looking
rail on p22 — samples `#FF8900`, which is Cosmo Orange with JPEG rounding. There is no separate
gold in the panel system. (There is in the *banner* system, along with a `#E7D1B1` cream, but
banners are a different artefact; see Out of scope.)

So this plan is not a repaint. **What is wrong is the register.** The panels put charcoal ink on
white, reserve purple for one inverted panel, and use orange only as a kicker and as a rail. The
app puts `ui.text: cosmo.purple` on an off-white page and has no kicker, no inverted panel and no
rail. The print has two registers and the token table has one.

Related: `plans/TODO.md` items 1, 2, 3 and 12, which this plan absorbs.

## Goal

`theme.ts` expresses **two registers** — a quiet reading register and a loud invitation register —
with the panels' roles named and contrast-tested at the sizes they are actually used. The three
DOM components the panels define exist and are used: kicker-and-headline, the orange rail with
beaded ring nodes, and the inverted panel. The valley can be rendered as embroidered tonal bands
behind `?relief=thread`. `docs/design-system.md` describes what is true.

Done means: a photograph of the screen beside a printed panel shows one system, not two.

## Approach

**Registers, not a second palette.** A register is a named pairing of ground, ink, kicker and
muted — a role group, at Layer 2, drawing on the Layer 1 values already there. Nothing in Layer 1
moves. This keeps the one rule intact: the scene document still says `kind`, the theme still says
what it looks like, and now the *page* has the same separation.

**The rail is built as the view switcher and inherits chapters later.** The pipe-and-node graphic
on p22 of the panels is already a chapter rail — a vertical conduit with a ring node at each
section heading. Building it now against the three views means it is exercised and styled before
`chapters.ts` exists, and gaining chapters is then a data change rather than a new component.
Deliberately *not* waiting for TODO 4.

**The kicker derives on light, and does not on purple.** This plan originally proposed naming a
raw `kickerLarge` alongside a derived `kicker`, on the assumption that the print's orange would
clear the 3:1 large-text threshold and fail only at body size. Building `/design` and measuring it
disproved that: **`#FF8A00` on `#FCFAF6` is 2.27:1**, which fails at every size. The panels get
away with it at 80 pt on paper under gallery light; a screen does not.

| | Value | On `cosmo.offWhite` |
|---|---|---|
| raw | `#FF8A00` | 2.27:1 ✕ |
| −10% | `#CC6E00` | 3.47:1 — large text only |
| −14% | `#B86300` | 4.18:1 ✕ at body |
| −24%, the existing `ui.accent` | `#854800` | 6.89:1 ✓ |

The asymmetry that resolves it: **raw orange on `cosmo.purple` is 6.64:1** and passes outright. So
`invert` carries the print's exact kicker colour and `page` derives one. There is no size at which
the light register can use the raw value, so no `kickerLarge` token is introduced — it would exist
only to be avoided. `ui.accent` at −24% already clears body text and is what `page.kicker` should
be.

This is worth keeping in the plan rather than quietly fixing, because the same assumption will
recur: print contrast and screen contrast are not the same problem, and the panels are not
evidence about the screen.

**Rejected: adopting the embroidery into the 3D.** The KV's material is stitched thread, and
carrying that into the renderer means textures, which means the perf budget and the exactness of
the backdrop raster both come under pressure. `?relief=thread` is the one place it is cheap — the
hillshade is already a generated raster with variants behind `?relief=` — so that is the only
3D adoption here. The wider question is left in `plans/TODO.md` under "Not yet items", where it
belongs until there is a measured number attached to it.

**Rejected: changing the page ground to pure white.** The panels are white and the app page is
`cosmo.offWhite`, but the diorama's ground is `cosmo.white` and the existing comment in `GROUND`
is load-bearing — the page is deliberately a shade off the ground so the diorama reads as a
surface laid on a page rather than as the page. Pure white widens that gap rather than closing it.
Kept as an open question rather than a silent change.

## Tasks

- [x] `/design` — the system rendered from the system, every value imported from `theme.ts` so it
      cannot drift. Built first deliberately: it is what measured the kicker and disproved this
      plan's original contrast approach
- [x] Add `REGISTERS` to `theme.ts` — `page` and `invert`, each naming ground, ink, kicker and
      muted — with the contrast tests written first
- [x] Repoint `UI_TOKENS` at `REGISTERS.page`, and emit both registers from
      `cssCustomProperties()`
- [x] Kicker + headline type scale in `globals.css`, matching the panels' hierarchy
- [x] `Rail.tsx` — the orange conduit with beaded ring nodes, wired to the three views
- [x] Replace the view switcher chips with `Rail`
- [ ] ~~`InvertPanel.tsx`~~ — **deferred, no call site.** The `invert` register exists as
      tokens and as `.invert` in `globals.css`, and is demonstrated on `/design`. The piece
      has no invitation yet: the exhibition's is a physical card wall, and the viewer's
      equivalent is most likely the city's terminal chapter releasing to free interaction.
      A component with no caller is dead code; this is ten lines whenever a use appears
- [x] `posterise()` in `theme.ts`, tested, and `RELIEF_RAMP_THREAD` as purple tonal bands
- [x] `?relief=thread` wired through `relief.ts`, with the byte-identical re-run test
- [ ] Rewrite `docs/design-system.md` around the two registers; note why the panels supersede
      the deck

## UI mockups (ASCII)

**Register A — the reading register, over the scene.** Charcoal on white, orange kicker.

```
┌────────────────────────────────────┐
│ NOMAD FUTURES LAB:      ← #854800  │  kicker, DERIVED — raw orange is 2.27:1 here
│ Nomads as bridges       ← #1F1F1F  │  headline, semibold
│ to today's new rivers              │
│ of opportunity                     │
│                                    │
│ Chiang Mai has always been         │  body, #1F1F1F regular
│ shaped by the routes that          │
│ connect it to the world…           │
└────────────────────────────────────┘
   ground #FCFAF6
```

**Register B — the invitation register.** One per piece, not a general surface.

```
┌────────────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ #2B184C ▓▓▓▓│
│▓ DREAMERS,              ← #FF8A00 ▓│
│▓ it's your turn:        ← #FCFAF6 ▓│
│▓ What are your dreams             ▓│
│▓ for Chiang Mai?                  ▓│
│▓                                  ▓│
│▓ Whether you live here, work here ▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
└────────────────────────────────────┘
```

**The rail.** Vertical on wide viewports, horizontal on phones. Ring nodes are `#FF8A00`
conduit, `#FCFAF6` centre. Current node filled; visited nodes solid; unvisited hollow.

```
   wide                          phone
                                 ╭───╮   ╭───╮   ╭───╮
    ◉  Past                    ──┤ ◉ ├───┤ ○ ├───┤ ○ ├──
    │                            ╰───╯   ╰───╯   ╰───╯
    │                             Past  Present  Futures
    ○  Present
    │
    │
    ○  Futures
```

States that differ: **unbuilt** view — node hollow with no label weight, still focusable;
**unavailable** view (no `circle` or `valley` field in the scene) — node absent entirely, per
`availableViews()`, and the conduit closes up rather than leaving a gap.

## Keyboard interaction

1. **Tab order** — the rail is a single tab stop (`role="tablist"`, roving tabindex). Tab enters
   at the current node; Tab again leaves the rail entirely rather than walking every node.
2. **Within the rail** — `↑`/`↓` on wide, `←`/`→` on phone, move focus between nodes; `Enter` or
   `Space` activates. `Home`/`End` jump to first and last available node.
3. **Shortcuts** — `1`/`2`/`3` continue to select a view directly and stay bound to
   `VIEW_ORDER`, unchanged by this plan.
4. **Focus management** — activating a node keeps focus on the rail, so a visitor can move
   through views without re-finding it. The inverted panel, when it opens, takes focus to its
   heading and returns it to the invoking node on close.
5. Every node carries its view name as accessible text — the ring alone is not a label.

## Test list (TDD)

- `REGISTERS.page` ink on ground clears 4.5:1 — unit — `src/engine/__tests__/theme.test.ts`
- `REGISTERS.invert` ink on ground clears 4.5:1 — unit — same
- each register's `kicker` clears 4.5:1 on its own ground — unit — same. This is the test that
  catches somebody reaching for the print's raw orange on a light ground, which is the one
  mistake this plan has already made once
- `REGISTERS.invert.kicker` is `cosmo.orange` unchanged — unit — the print value survives where it
  passes, and a future palette edit that breaks it should fail here
- `muted` clears 4.5:1 in both registers — unit — same
- `cssCustomProperties()` emits every key of both registers — unit — same
- `posterise(t, bands)` returns exactly `bands` distinct values across `t ∈ [0,1]` — unit
- `posterise` is monotonic in `t`, and clamps outside `[0,1]` — unit
- `posterise(t, 1)` is constant — unit — the degenerate case
- `RELIEF_RAMP_THREAD` stops are all drawn from `PALETTE`/`PALETTE_EXTENDED` — unit, guards the
  one rule that nothing names a raw colour
- the thread relief raster is byte-identical on re-run from the same cached DEM — unit —
  `src/engine/__tests__/relief.test.ts`, per the determinism rule in `CLAUDE.md`
- `availableViews()` still drives the rail's node list, including the absent-view case — unit

## Verification

1. `npm run dev`, open `/`. The control row is a rail, not chips. Ring nodes are orange with a
   pale centre; the current view's node is filled.
2. Tab to the rail, press `↓` then `Enter` — the view changes and focus stays on the rail.
3. Press `1`, `2`, `3` — each selects its view, as before.
4. Any text panel over the scene reads charcoal on off-white with an orange kicker above the
   headline, matching p22 and p30 of `docs/references/CosmoLocal Exhibition_5_small.pdf`.
5. Open the inverted panel — purple ground, orange kicker, pale headline, matching p49. Close it;
   focus returns to where it was.
6. `/?relief=thread` in the valley — the basin renders as flat purple tonal bands with visible
   band boundaries, not a smooth hillshade. `/?relief=` unset is unchanged.
7. Narrow to 390 px. The rail is horizontal, no horizontal page scroll, kicker still legible.
8. **The real check:** photograph the screen next to a printed panel. One system or two.

## Out of scope

- **Chapters.** The rail is wired to views here. Scroll, the chapter score and terminal chapters
  are TODO 4–7 and this plan must not start them.
- **The banner register.** `#E7D1B1` cream, the embroidered landscape and the woven textile band
  belong to the pull-up banners, not the panels. They stay as image assets and get no tokens until
  something needs them.
- **Embroidery in the renderer** beyond `?relief=thread`. No thread textures on buildings, no
  stitch normals, no change to the unlit-material rule.
- **The scene's own roles** — `building.stock`, `building.intervention`, `water`, `GROUND`,
  `ROAD_TONES`, `POPULATION_RAMP`. They are Layer 2 but they are about the diorama, not the page,
  and nothing in the panels argues against them.
- Authored content of any kind.

## Open questions

- [ ] Does the page ground stay `cosmo.offWhite` or go to the panels' white? The existing
      page-versus-ground relationship is deliberate and this would change it.
- [ ] `building.civic` is teal, and **teal appears nowhere in the printed material**. Does it
      survive, move to purple, or go?
- [ ] Does `?relief=thread` actually beat the hillshade? Terracing lost on resolution once
      already, on its own merits. It arrives now with a brand argument, which is a different
      argument and may deserve a different answer — but it may also lose again, in which case
      this plan ships the other two thirds and the variant stays parked behind `?relief=`.
- [ ] Does the rail replace the chips outright, or sit beside them until chapters land?

## Outcome

_Not started._
