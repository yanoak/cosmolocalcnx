# Handover — picking this up after a context refresh

**Snapshot as of 24 Sep 2026, morning. The exhibition opened today.** This file is a reading
order and a state summary, not a source of truth — `CLAUDE.md`, `docs/`, and `plans/` are. When
they disagree with this file, this file is stale; fix it or delete it.

## Read in this order

1. `CLAUDE.md` — loaded automatically. The spine, the rules, the priorities.
2. `work-diary/2026-09-23.md` and `2026-09-24.md` — what happened, why, and what went wrong.
3. `plans/2026-09-24_scrolly-shell.plan.md` — **the thing to build next.** Everything else sits
   on it.
4. The three chapter plans — `2026-09-23_present-chapter`, `_past-chapter`, `_futures-chapter`.
5. `docs/research/2026-09-23_past-chapter.findings.md` and
   `2026-09-23_futures-chapter.context.md` — the content, distilled; the raw sources are gitignored.
6. `docs/copy-schema.md` — what the writer puts in the Google Doc.

## State of the repo

- Tree clean, 543 tests green, typecheck clean. Last commits `65dc6e7` (doc seeded), `c6cfb43`
  (copy pipeline), `48c1c5f` (architecture review applied to the plans).
- **Design system: built, never verified.** `2026-09-23_kv-design-system` is `active`, 9 of 10
  tasks done, `InvertPanel` deferred with reason. Nobody has looked at the viewer since the chrome
  went charcoal, the opening view moved to the valley, the rail replaced the chips, or
  `?relief=thread` landed. Chrome's screenshot tool cannot capture `/` (the diorama pegs the
  renderer past the timeout); `/design` captures fine. **This needs human eyes at
  `localhost:3000` and `/?view=valley&relief=thread`.**
- **Copy pipeline: live.** `npm run fetch:copy` → `src/content/copy.json` + `en/*.md`. The doc is
  seeded with sample beats and hotspots whose ids match the context files. Byte-identical on
  re-run. Plan `2026-09-24_copy-from-archieml` stays `active` until a chapter renders an `href`.
- **Chapter plans: all `draft`.** Nothing built. `registers.ts` is still imported by `Diorama`
  (six symbols) — dismantling it is the shell's first task, not a leftover.

## The decisions that shape the build

All recorded in `CLAUDE.md`; listed here so you know they exist.

| Decision | Where |
|---|---|
| A view owns a tense; scale and tense are different axes; Futures spans valley *and* city | CLAUDE.md "Three views are the spine" |
| One 2045, not several — Faiways is the future; everything is a **pin**, nothing extruded | CLAUDE.md "What this is"; futures context |
| Circle centred on Wat Ket, ~3,400 km holds half the world; field must be regenerated (3 artefacts) | CLAUDE.md; present plan |
| Each chapter is a tilted martini glass — base, stem, bowl; terminal beat releases, never auto-switches | shell plan |
| Hotspots are the document's — pins and point items are `Hotspot`s in `wat-ket.json` with `chapter` | shell plan |
| `ChapterId` exists; rail and number keys move to chapters | shell plan |
| **Exhibition screen first; phone LOD later** (block-sum makes it a switch) | CLAUDE.md "Three delivery surfaces" |
| Copy from the Google Doc via ArchieML; data stays local JSON; join by id; English only | copy plan |
| Past keeps five layers incl. river; certainty is visual grammar; remote work is the seam | past plan; findings |
| Arusha has no pin — Lamphun town carries the Plexus; Lamphun gets two pins | futures context |
| Names: none in committed files unless the site credits them | CLAUDE.md working conventions |

## Build order

The shell first, in this sequence — each step is small, pure where possible, test-first:

1. **`ChapterId` + `CHAPTER_VIEWS`** in `views.ts`; tense labels move to chapters. Tests in
   `views.test.ts`. `Rail` and the `1/2/3` keys re-keyed. Smallest step, unblocks the rest.
2. **`Hotspot` extension** — `chapter`, `view`, `icon`, `date`; `validateScene` requires
   `chapter`. Tests in `scene.test.ts`.
3. **`camera.ts`** — `goTo({ view, zoom, target }, duration)`; absorb `Diorama`'s rig and the
   two live pieces of `registers.ts`; delete the rest. The riskiest step; do it with the viewer
   open.
4. **`chapters.ts`** — the beat score: view, pose, layer state, `LocaleMap` copy, terminal flag,
   beat index + continuous progress. Pure. Its invariant: **no beat derives a view from a zoom.**
5. The layout change, `Scrolly.tsx`, `Explore.tsx`, `Hotspot.tsx`, `Story.tsx`.
6. Then Present — it is the smallest chapter, its bowl exists, and its field regeneration
   (`build-region.py --centre 18.7912,99.0043`, three artefacts) can start in parallel with 1–4.

## Environment gotchas

- **Node and `gws` are under nvm**, not on the default PATH:
  `export PATH="/Users/yan/.nvm/versions/node/v22.18.0/bin:$PATH"`. Every `npx`, `npm run`, `gws`.
- **`.git/index.lock` gets left behind by Cursor's git worker** — zero bytes, no `git` process.
  Check `pgrep -fl "bin/git "` first; if nothing, `rm -f .git/index.lock`. Happened four times
  in two days.
- **Commit trailers:** `Plan: <slug>` with **no blank line** before `Co-Authored-By`, or git
  drops it silently and the diary files the commit under Unplanned. Check with
  `git log -1 --pretty=format:'%(trailers:key=Plan,valueonly)'`.
- **Chrome screenshots of `/` time out.** Verify the diorama by eye or via `/design` for
  DOM-only work.
- **Dev server is usually already running** on :3000 — `curl -s -o /dev/null -w "%{http_code}"`
  before starting another.
- `./scripts/work-diary.py` at the start of each day; it creates the file and regenerates the
  commit table from trailers.

## Owed to Yan / open

- Eyes on the viewer (above).
- Futures stem copy and the thirteen real blurbs — the doc has samples.
- Whether each chapter tab carries its own `[beats]`/`[hotspots]` (assumed yes).
- No edge arrows at city scale — decided unless objected to.
- Height-limit polygon: **do not ship**; contested. Caravan routes: corridors, never lines.
