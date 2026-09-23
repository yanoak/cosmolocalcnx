---
slug: 2026-09-24_copy-from-archieml
status: active
started: 2026-09-24
finished:
issue:
---

# Copy comes from a Google Doc, via ArchieML, with links intact

## Context

Every chapter plan lists copy as a task — beats, blurbs, bodies, labels — and none says where it
lives. Decided 24 Sep 2026: **all copy is authored in one Google Doc and pulled into the repo as
ArchieML.** The doc exists — *Nomad Futures Lab Exhibit [ArchieML]*, id
`1TvCGOKkP_qagsb5SMkyGFpn4LdaFpw0obwiOpiR1RRw` — with four tabs, **Overall, Past, Present,
Future**, all empty. So this plan defines the pipeline *and* the shape the writer fills in.

**Copy, not data.** The doc holds what a writer edits. Datasets — `cities.json`, hotspot
coordinates, icon ids, thread geometry — stay in local JSON, keyed by the same ids. English only
for now; the output is still a `LocaleMap` so Thai is a second tab later, not a refactor.

Reference: `~/Coding_work/malaysia-data-center-story/scripts/fetchArchieMLData.mjs` — public HTML
export → Turndown → `archieml.load`, saving both `.md` and `.json`. Two things do not carry over:
the doc here is **private** (the export URL returns 401), and that script is not tab-aware.

## Goal

`npm run fetch:copy` reads the doc through the authenticated `gws` CLI, writes one markdown file
per tab with hyperlinks preserved as `[text](url)`, parses each as ArchieML into
`src/content/copy.json`, and is byte-identical on re-run. The app renders any copy string —
including its links and paragraphs — through one pure, tested function.

## Approach

**Transport is `gws`, not the export URL.** Same call the rest of the project already uses:
`gws docs documents get --params '{"documentId":…,"includeTabsContent":true}'`. It works on a
private doc, returns per-tab content, and every text run carries `textStyle.link.url`. The script
shells out to `gws`, so **no credential ever enters the repo** — auth lives in the OS keyring on the
machine that runs it, which is the same arrangement as the Overpass and GHS-POP fetches.

**Links survive because the API hands them over, not because we scrape them.** The converter walks
paragraph runs and emits `[text](url)` for any run with a link. That is the only formatting kept.
Bold and italic are **dropped on purpose**: a bold `key:` line would become `**key:**` and break
ArchieML — the reference script needed a regex hack for exactly this. Plain text plus links is what
ArchieML wants.

**Paragraphs survive too.** Multi-line values use ArchieML's `:end` convention, and the doc's
paragraph breaks come through as newlines. A story body is many paragraphs; the renderer splits on
blank lines.

**Rendering is a pure function, not a markdown library.** `renderCopy(text)` returns paragraphs of
runs — `{ text }` or `{ text, href }` — and the DOM maps that to `<p>` and `<a>`. No `marked`, no
HTML-in-strings, links open with `rel="noopener"`. Testable in node, and it cannot render anything
the converter did not emit.

**Locale is the top-level key, not a leaf wrapper.** `copy.json` is `{ en: { overall, past,
present, futures } }` — a whole tab is one language, so wrapping every string as `{ en: … }` would
be noise. Thai becomes `{ th: … }` beside it. Chapter code reads `copy[locale]` and falls back the
way `pickLocale` does.

**Rejected: making the doc public to use the export URL.** It would also drop tabs.
**Rejected: Turndown.** It reconstructs links from HTML and cannot see tabs; the API is upstream of
both.
**Rejected: `marked`.** Copy needs paragraphs and links, nothing else, and a dependency that
renders arbitrary HTML from a writer's doc is a larger surface than the feature.

## The shape the writer fills in

Per tab. ArchieML syntax; `:end` closes any multi-paragraph value.

```
# Overall
title: Wat Ket, 2045
past.tense: Past
past.place: The valley
present.tense: Present
present.place: The circle
futures.tense: Futures
futures.place: Wat Ket

# Past / Present / Future — one tab each
[beats]
id: river
kicker: 1867
headline: The river was the road
body: Three months upstream from Bangkok, a month of it through [thirty-two rapids](https://…).
:end

id: rail
…
[]

[hotspots]
id: station
label: Chiang Mai railway station
blurb: Opened 1 January B.E. 2464, 1.57 km from here.
body: …
:end
[]
```

Ids are the join key to local JSON. A hotspot with copy but no coordinates, or the reverse, is a
build error rather than a silent gap.

## Tasks

- [x] `archieml` as a devDependency
- [x] `scripts/fetch-copy.ts` — `gws` → per-tab markdown with links → `archieml.load` →
      `src/content/copy.json` and `src/content/<tab>.md`
- [x] `src/engine/copy.ts` — `docToMarkdown` (pure, on the Docs JSON) and `renderCopy` (pure)
- [x] Tests for both, including the link and `:end` cases
- [x] `npm run fetch:copy`, and a run against the empty doc to prove the pipeline end to end
- [x] `docs/copy-schema.md` — the shape above, for the writer

## Test list (TDD)

- a run with `link.url` becomes `[text](url)` — unit — `src/engine/__tests__/copy.test.ts`
- adjacent runs, one linked, concatenate without losing the link boundary — unit
- bold and italic are dropped, text kept — unit; **the test that keeps `key:` lines parseable**
- paragraph breaks become newlines; a heading is plain text — unit
- a bulleted paragraph keeps its text and gains no marker ArchieML would misread — unit
- `renderCopy` splits paragraphs on blank lines and yields link runs with `href` — unit
- `renderCopy` on a string with no links yields one text run per paragraph — unit
- `renderCopy` never emits HTML — unit; the surface-area guarantee
- the fetch is byte-identical on re-run from the same doc — verified by running it twice

## Verification

1. `npm run fetch:copy` — four `.md` files and one `copy.json` appear under `src/content/`.
2. Run it again — `git status` shows no change.
3. Put a link in the doc, refetch — it appears as `[text](url)` in the `.md` and survives into
   `copy.json`.
4. `renderCopy` on that value gives a run with `href`; the DOM shows an anchor.

## Out of scope

- Thai. A second tab or doc, later; the structure already allows it.
- Wiring copy into chapters — that is each chapter plan's job once the shell exists. This plan makes
  `copy.json` importable and correct.
- Images in the doc.

## Open questions

- [ ] Do beats and hotspots share one `[hotspots]` array per tab, or does each chapter tab carry its
      own sections? The shape above assumes per tab.
- [ ] Seed the doc's tabs with the skeleton so the writer starts from it? Needs a write to the doc.

## Outcome

_Active, 24 Sep 2026._ Pipeline proven end to end on the real (still empty) doc: `gws` → four
tabs → markdown → ArchieML → `copy.json`, **byte-identical on re-run**. Link preservation proven
on a real doc that has a hyperlink — the run's `link.url` comes through as `[text](url)` with no
scraping. 15 tests, typecheck clean. Verification steps 3 and 4 wait on copy existing in the doc
and on a chapter rendering it; the plan stays active until then.

Two things learned. The public export URL is a dead end for a private doc, and `gws` is upstream of
it anyway — the API hands over links and tabs that HTML export would have to reconstruct. And a
"never emits HTML" test is wrong as written the first time: runs are *data*, so `<script>` in copy
is legitimate text; the real guarantee is the shape of the run.
