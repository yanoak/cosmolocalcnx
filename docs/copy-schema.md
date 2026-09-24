# Copy schema — what goes in the Google Doc

All of the piece's copy is written in one Google Doc — *Nomad Futures Lab Exhibit [ArchieML]* —
and pulled into the repo with `npm run fetch:copy`. This page is for whoever is writing in that
doc. The engineering side is `plans/2026-09-24_copy-from-archieml.plan.md`.

## The rules that matter

- **One tab per chapter.** Overall, Past, Present, Future. The tab names are fixed; the fetch keys
  on them.
- **Write in [ArchieML](http://archieml.org/).** `key: value` on a line. A value that runs to
  several paragraphs starts on its own line after the key and ends with `:end` on its own line.
- **Links survive.** Insert a normal Google Docs hyperlink (⌘K) on any words and it comes through
  intact. That is the only formatting that does. **Bold, italic and headings are dropped** — use
  them freely to make the doc readable, they just do not reach the screen.
- **Ids are the join.** Every beat and every hotspot has an `id`. The same id names its
  coordinates, icon and view in the repo's JSON. A typo in an id is a build error, not a silent
  gap, so copy the id rather than retyping it.
- **English only for now.** Thai is a second tab later; nothing about the layout changes.
- **No names of participants or collaborators**, unless the site credits them on purpose. The
  fetched copy is committed to a public repository.

## Overall

```
title: Wat Ket and the world

past.tense: Past
past.place: The valley
present.tense: Present
present.place: The circle
futures.tense: Futures
futures.place: Wat Ket
```

The tense is what the rail says; the place is the subhead under the header. `Futures` is plural on
purpose.

## Past, Present, Future — one tab each

Two arrays per tab. `[beats]` is the guided sequence the reader scrolls through; `[hotspots]` is
what they can hover and click once released to explore.

```
[beats]
id: river
kicker: 1867
headline: The Ping carried people and goods through the valley
body: One documented journey from Bangkok to Chiang Mai took about three
months upstream, including a month working through thirty-two rapids.
:end

id: grow
kicker: About 3,400 km
headline: Half of humanity lives within this distance of Wat Ket
body: At 1,000 km the circle holds 3.6% of the world's population…
footnote: With a world total of 8.0 billion, the half-population radius is 3,416 km…
:end

id: caravans
kicker: Yunnan–Lan Na
headline: Trade is documented. A route is not.
body: …
:end
[]

[hotspots]
id: station
label: Chiang Mai railway station
blurb: Opened 1 January B.E. 2464 — 1.57 km from here.
body: The national terminus landed almost beside the older river-commercial
landscape. Modern sources render the year as 1921 or 1922; the archive gives
the Thai date, so we do too.
:end
[]
```

| Field | Where it shows |
|---|---|
| `kicker` | The small line above the headline — a date, a place, a category |
| `headline` | The card's title |
| `body` | The card text. Paragraphs are separated by a blank line; links allowed |
| `footnote` | Optional. A quieter line under the body — the method behind a number, a caveat. One line, no paragraphs |
| `label` | The hotspot's name, on hover |
| `blurb` | One or two lines in the hover popup |
| `body` (hotspot) | The full write-up in the modal or story overlay |

A `[]` on its own line closes an array. Anything outside `[beats]` and `[hotspots]` is ignored, so
notes to yourself are fine as long as they are not `key: value` lines.

## Checking your work

After `npm run fetch:copy`, `src/content/en/<tab>.md` is exactly what the parser saw — if a value
is missing on screen, look there first. `src/content/copy.json` is the parsed result.
