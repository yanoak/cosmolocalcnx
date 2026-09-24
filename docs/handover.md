# Handover — picking this up after a context refresh

**Snapshot as of 24 Sep 2026, mid-morning, after Yan's first look. The exhibition opened today.** This file is a
reading order and a state summary, not a source of truth — `CLAUDE.md`, `docs/`, and `plans/` are.
When they disagree with this file, this file is stale; fix it or delete it.

## Read in this order

1. `CLAUDE.md` — loaded automatically. The spine, the rules, the priorities.
2. `work-diary/2026-09-23.md` and `2026-09-24.md` — what happened, why, and what went wrong.
3. `plans/2026-09-24_scrolly-shell.plan.md` — the shell. **Five of its foundations are built**;
   the ticks and the deferrals say which.
4. `plans/2026-09-23_present-chapter.plan.md` — **the thing to build next.**
5. The other chapter plans, `_past-chapter` and `_futures-chapter`.
6. `docs/research/2026-09-23_past-chapter.findings.md` and
   `2026-09-23_futures-chapter.context.md` — the content, distilled; raw sources are gitignored.
7. `docs/copy-schema.md` — what the writer puts in the Google Doc.

## State of the repo

- Tree clean, **567 tests green, typecheck clean**, both routes build. Last real commit `ca4792f`
  (the stem scrolls), then diary chores.
- **The shell's visible layer is built and nobody has looked at it.** The viewer is now a scroll
  container in stem mode: the stage sticks, a track of one section per beat scrolls over it with a
  centred card each, the beat names the view and a pose relative to its fit, `CameraRig` moves
  there in 600 ms, and the terminal beat flips `mode` to explore with an Explore bar (← Story,
  Next →). Space/arrows step beats; Escape releases; `1`/`2`/`3` are chapters.
  Chrome's screenshot tool cannot capture `/` (the diorama pegs the renderer past the timeout);
  what was checked instead: the server-rendered HTML carries the stem, the lit first card, the
  sample headline and the round-tripped hyperlink as a `rel="noopener"` anchor; the console is
  clean across two loads. **This needs human eyes at `localhost:3000`** — and so does everything
  from yesterday: charcoal chrome, the rail, valley-first opening, `?relief=thread`.
- **Copy pipeline live.** `npm run fetch:copy` → `src/content/copy.json` + `en/*.md`, byte-identical
  on re-run. The Google Doc (`1TvCGOKkP_qagsb5SMkyGFpn4LdaFpw0obwiOpiR1RRw`, four tabs) is
  **seeded with sample copy** — 12 beats, 16 hotspots, ids matching the context files, one real
  hyperlink per chapter. `src/content/scores.ts` is the engineer-edited half; `scores.test.ts`
  fails the build if a beat id exists on one side and not the other.
- **`registers.ts` is gone.** `camera.ts` holds the circle framing and `CameraPose`;
  `CameraRig.tsx` is the only thing that touches the camera. `stockTint` is in `shading.ts`,
  `BLOCK_IN` in `views.ts`.
- **Design system**: `2026-09-23_kv-design-system` still `active`, 9/10, `InvertPanel` deferred.
  Verification never run.
- **Yan looked, and three things changed** (`plans/2026-09-24_north-up-and-chrome`, uncommitted
  as of this snapshot): credits behind an `i` in the stage's corner; topbar with no rule, no
  `EN`, no `debug`, kicker-over-headline header, text buttons and one purple `Next →` pill;
  valley town labels only while the valley is the view. **The camera attitude now lives in
  `camera.ts` alone** — `CAMERA_YAW`/`CAMERA_PITCH` with `screenBasis`, `projectView`,
  `groundDepth`, `wallFacesCamera` — and the backdrop fingerprint hashes it, so turning the
  camera fails the freshness test until `npm run render:backdrop`. It is on the diagonal, as
  before; a north-up version was built and rejected the same morning. **Open:** Yan's 06:56
  screenshot shows the valley as a tilted slab in the stem, which no camera produces from a
  square field — see the diary's ad hoc todo. **Browser verification is Yan's**, by request.

## What the shell still lacks, and why

All in the shell plan's task list, unticked with reasons:

| Missing | Arrives with |
|---|---|
| Hover blurb / click modal (`Hotspot.tsx`), story overlay (`Story.tsx`) | the first rendered pins — nothing to hover yet |
| Layer toggles in Explore | the Past's five threads, the first thing with layers |
| Line hit-testing | the threads |
| Icon sprite registry, `/jig` | the Futures pins and the Higgsfield loop |
| Nested rail (three chapters × N beats) | after the stem is verified by eye |
| Attract loop (timer driver over the beat score) | same |

Known rough edges in what *is* built: the topbar sits over the top of the stage during the stem;
cards have no entrance animation; the old caption is hidden during the stem; the Futures stem
never reaches the valley because the sample doc has only four city beats — add valley beats to
the doc and `scores.ts` and it will.

## The decisions that shape the build

All recorded in `CLAUDE.md`; listed so you know they exist.

| Decision | Where |
|---|---|
| A view owns a tense; scale and tense are different axes; Futures spans valley *and* city | CLAUDE.md "Three views are the spine" |
| One 2045 — Faiways; everything is a **pin**, nothing extruded | CLAUDE.md; futures context |
| Circle centred on Wat Ket, ~3,400 km holds half the world; **regenerate three artefacts** | CLAUDE.md; present plan |
| Each chapter is a tilted martini glass; the terminal beat releases, never auto-switches | shell plan, and now `chapters.ts` |
| Scroll → beat index + progress, **never a camera, never a view**; a beat names its view | `chapters.ts`, pinned by tests |
| Hotspots are the document's, with `chapter` and `view`; no `date` field | `scene.ts` |
| `ChapterId` drives rail, keys, tense; `VIEW_PLACE` stays on views | `views.ts` |
| **Exhibition screen first; phone LOD later** | CLAUDE.md "Three delivery surfaces" |
| Copy from the doc via ArchieML, links kept; data local; joined by id; English only | copy plan |
| Past keeps five layers incl. river; certainty is visual grammar; remote work is the seam | past plan; findings |
| Arusha has no pin — Lamphun town carries the Plexus | futures context |
| Names: none in committed files unless the site credits them | CLAUDE.md |

## Build order from here

1. **Eyes on the viewer, again** — the new chrome, and the tilted-valley question above.
2. **Present** — `plans/2026-09-23_present-chapter`. Regenerate the three region artefacts on
   `18.7912,99.0043` (`build-region.py --centre …`), commit the cumulative curve, extrude the field
   as instanced columns at 512² (exhibition screen), radius as a shader uniform, pick by instance.
   Bind the growing circle to the beat's `t` — the shell already delivers it.
3. **Past** — `threads.ts` with `certainty`, OSM fetch for the Ping / rail / Highway 11, line
   styles per certainty, point items as `Hotspot`s, layer toggles in Explore, and the first
   `Hotspot.tsx`.
4. **Futures** — pins as `Hotspot`s, the icon registry and `/jig`, `Story.tsx`.
5. Nested rail, attract loop.

## Environment gotchas

- **Node and `gws` are under nvm**: `export PATH="/Users/yan/.nvm/versions/node/v22.18.0/bin:$PATH"`
  before every `npx`, `npm run`, `gws`.
- **`.git/index.lock` gets left behind by Cursor's git worker** — zero bytes, no `git` process.
  `pgrep -fl "bin/git "`; if nothing, `rm -f .git/index.lock`. Five times in two days.
- **Commit trailers:** `Plan: <slug>` with **no blank line** before `Co-Authored-By`, or git drops
  it and the diary files the commit under Unplanned. Check with
  `git log -1 --pretty=format:'%(trailers:key=Plan,valueonly)'`.
- **Chrome screenshots of `/` time out.** `/design` captures fine. For `/`, use the console
  (`read_console_messages` after a reload — tracking starts on first call) and `curl` the HTML.
- **Dev server is usually already running** on :3000.
- `./scripts/work-diary.py` at the start of each day, and after commits to regenerate the table.
- Writing to the Google Doc: `gws docs documents batchUpdate --params '{"documentId":…}' --json '…'`;
  `--dry-run` first; `insertText` at `{tabId, index: 1}` on an empty tab; links via
  `updateTextStyle` with `fields: "link"`. Atomic — check the doc's state before ever re-running.

## Owed to Yan / open

- Eyes on the viewer.
- Real Futures stem copy and blurbs; valley beats so the stem can shift views.
- Whether each chapter tab carries its own `[beats]`/`[hotspots]` (assumed yes, and built that way).
- No edge arrows at city scale — decided unless objected to.
- Height-limit polygon: **do not ship**; contested. Caravan routes: corridors, never lines.
