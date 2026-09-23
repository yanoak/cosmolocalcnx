# Past chapter — what the research established

Distilled 23 Sep 2026 from the deep-research report answering
`docs/research/2026-09-23_past-chapter.brief.md`. The full report is at
`docs/references/past-chapter-deep-research-report.md`, which is **gitignored** — this file is the
committed record, so anything needed later belongs here rather than there.

**The report's citations are tool-internal tokens, not URLs.** Every claim that actually goes on
screen needs its source resolved to a real reference before publication. Treat everything below as
*established by a research pass*, not as *cited*.

Feeds `plans/TODO.md` item 8 (`valley-threads`).

## The headline: the narrative survives, several labels do not

The four-thread argument — that Chiang Mai has repeatedly been reshaped by whatever connected it
to the world — is defensible. What does not survive is a set of specific claims, four of which the
**printed exhibition panels make**. Those panels are already produced; the screen is not obliged to
repeat them.

## Corrections

| Claim | Verdict | Replacement |
|---|---|---|
| "The Ping was the region's original highway" **(panel)** | Probable as metaphor, misleading literally | "Chiang Mai's southbound river artery — powerful, seasonal and difficult" |
| "Chiang Mai lay on the Tea Horse Road" **(panel)** | **Contested.** Yunnan–Lan Na caravan trade is established; the canonical *Chamagudao* attribution is not, and the concept itself entered scholarship only in the 1980s | "Yunnan–Lan Na caravan networks (the Southern Silk Road)" |
| "Rail brought the first steel-reinforced buildings in Lanna" **(panel)** | **Unsupported.** No architectural source establishes any "first", nor railway causation | Drop "first". Nawarat Bridge was rebuilt in 1921 with steel arches and reinforced-concrete piers, which dates the materials without claiming primacy |
| "Wat Ket has a three-storey height limit" **(panel)** | **Contested** as a current legal statement — see below | Describe the campaign as community history under verification |
| Railway opened 1921 | **Probable, with a calendar caveat.** Archival material gives 1 Jan B.E. 2464; modern sources render this as 1921 or 1922 | Give the Thai date and a qualified conversion |
| 1,000+ died building Khun Tan tunnel | **Contested.** Repeated in tourism histories; no payroll, medical, cemetery or engineering evidence found. One source calls the figure rumour | "Dangerous and disease-prone; the frequently repeated 1,000+ toll is unverified" |
| Chiang Mai airport opened 1921 | **Incorrect.** | Operations began **1934**; it joined the national airports authority 1 Mar 1988, which is a different event often conflated with it |
| "30,000 digital nomads" | **Contested.** The 2014 source that produced this figure explicitly calls it word-of-mouth | "A major regional hub" — no number |

## The Wat Ket height limit — the finding that inverted

This was the brief's highest-value question because a live height limit would constrain every 2045
scenario. **It does not, and nothing should be drawn from it yet.**

- The plural riverside heritage landscape — Buddhist, Christian, Muslim and Sikh sites within a few
  streets — is **independently confirmed** by recent planning research.
- The **interfaith campaign against rezoning is not independently corroborated.** It may well have
  happened; it is currently oral and community history.
- Chiang Mai's planning controls are **metric, not storey-counted**. A 2024 study reports 12 m
  across several land-use categories and **9 m as the lowest cited limit, in a conservation-
  residential zone**, with nearby riverfront areas governed by coverage and FAR rather than any
  height cap at all. There is no blanket "three-storey Wat Ket rule" in that literature.
- There is **active public controversy over a revised comprehensive plan as of Sep 2026**, so
  neither the 2012 plan nor a 2024 paper can support a claim about current law.

**Do not publish a height-control polygon.** Digitising one requires the currently gazetted
instrument and its official map sheets, verified by a second person. Until then the campaign is a
story about a neighbourhood organising, which is arguably the better thing to put in front of a
visitor anyway.

## Certainty becomes visual grammar

The strongest production idea in the report, and it resolves the open question in `plans/TODO.md`
item 8 — *real geography or the panel's diagram?* — with a third answer. **Each thread gets the
geometry its evidence supports, and the drawing says how much we know.**

| Thread | Geometry | Certainty | Source |
|---|---|---|---|
| Ping | Precise centreline through the full frame | **Confirmed** | OSM `waterway=river`, named Ping |
| Railway | Precise track, Chiang Mai → Saraphi → Lamphun → Khun Tan | **Confirmed** | OSM `railway=rail`; `railway=station`; use ways, not route relations |
| Highway 11 | Current alignment from the south-east | **Confirmed (current)** | OSM `highway=*` + `ref=11` |
| Caravan routes | **Broad dashed corridors between documented nodes** | **Probable corridor, low precision** | No centreline exists to find |
| Remote work | Nodes and arcs — airport, coworking districts, residences | **Conceptual only** | No route exists at all |

Two rules fall out of it:

- **Never draw a fibre-optic cable out of Wat Ket.** Internet routing is dynamic, operator-owned
  and not heritage geography. Inventing a line would be the one outright fiction in the chapter.
- **Caravan routes get an explicit `certainty` field and live in their own layer**, so nothing can
  later mistake them for surveyed alignment. A broad uncertainty band is more truthful than a clean
  invented line — and the KV already supplies dashed line styles, so *dashed means uncertain* is a
  convention the design system hands us free.

This also independently confirms the seam we chose on structural grounds: remote work has no
drawable route, which is precisely why it is the thread that hands over to the circle.

## Coordinates, inside the 120 km frame

| Feature | lon, lat | Note |
|---|---|---|
| Scene origin, Wat Ket | 99.004300, 18.791200 | Already ours |
| Chiang Mai railway station | 99.016880, 18.783650 | **1.57 km south-east of origin**, east bank, in Wat Ket subdistrict |
| Khun Tan tunnel | ≈99.26542, 18.50036 | Probable point; take the track from OSM |

**The station's position is a gift to the chapter.** The national rail terminus appeared essentially
beside the existing river-commercial landscape — the new connection landing on top of the old one,
1.5 km from the scene origin. The panels' link between Wat Ket, San Pa Khoi and the station is
sound.

## Dates that are solid enough to show

- **1867** — a dated first-person account of the upstream journey: Bangkok 3 January → Chiang Mai
  3 April, about **three months**, roughly a month of it working through **thirty-two rapids**, with
  towing, poling, transhipment into smaller craft and temporary damming for depth. Frame as *one
  documented journey*, not an average. Public domain (Project Gutenberg).
- **Scorpion-tailed cargo boats** (เรือหางแมงป่อง), **16–18 m**, covered cargo areas — worth showing at
  human scale beside Wat Ket rather than as a generic longtail.
- **1867** — permanent mission established; **1896** — Royal Forest Department, amid disputes over
  northern teak concessions.
- **1907–1918** — Khun Tan tunnel construction; **≈1,352 m** long.
- **1 Jan B.E. 2464** — station opening, Gregorian rendering contested.
- **1921** — Nawarat Bridge rebuilt, steel arches and reinforced-concrete piers.
- **1969** — Highway 11, the final Superhighway section; the 1960s Superhighway is identified as a
  major spatial intervention in its own right.
- **1934** — airport operations begin.
- **2013** — the city's first coworking space; **mid-2010s** — recognised remote-work destination.
- **Current** — a five-year destination visa permitting 180 days per entry explicitly covering
  remote workers, plus a long-term "work from Thailand professional" category.

The before/after that carries the rail thread is a **change in transport regime**, not a commodity
list: a three-month upstream river journey against a fixed-track national network, with market
integration no longer hostage to the navigability of the Ping.

## Licensing decisions

- **OSM** — ODbL, already credited. Carries the river, rail, station and Highway 11.
- **Copernicus DEM GLO-30** — already ours. One operational warning worth heeding: **access to the
  30 m view service is now restricted to authorised user categories**, so a future anonymous build
  may not be able to refetch it. Cache the exact input and record its SHA-256.
- **The 1945 Survey of India 1:5,000 Chiang Mai sheet** — genuinely useful for post-rail urban
  morphology, but **rights are not clear. Reference only; do not commit the raster** because a web
  copy exists. This is exactly the case the repo's asset rule was written for.
- **The exhibition PDF** — do not assume redistribution rights. Already gitignored; keep it that way.
- Any historical map that does ship must display survey year, scale, authority, georeferencing RMSE
  and licence. A raster without a survey date and scale is not evidence of alignment.

## One correction the report got wrong about us

It warns that a ±60 km box expressed in degrees is not a square and recommends rebuilding in
EPSG:32647 (UTM 47N). A fair assumption, but not what we do: `scripts/fetch-relief.py` projects in
metres using an equirectangular tangent plane **copied verbatim from `src/engine/project.ts`**, so
the valley mesh lands on the same metres the buildings use.

The residual error from a fixed `cos(lat₀)` rather than a per-latitude one:

```
 0 km north:     0.0 m
30 km north:    96.7 m
60 km north:   194.7 m    ← worst case, at the frame corner
valley cell:   234.4 m
```

**Worst-case distortion is smaller than one cell.** Moving to UTM would break projection-sharing
with the buildings — which is deliberate and load-bearing — to fix a sub-cell error. **Decided: our
projection stands.** Recorded here so it is not re-raised.

## Gaps, and what would close them

| Gap | What is missing | Where to look |
|---|---|---|
| Rail microhistory | First-year Bangkok–Chiang Mai timetable and fares | State Railway annual reports, Royal State Railways engineering files, National Archives, period newspapers — not modern tourism pages |
| Khun Tan labour | Payroll, medical, cemetery or engineering records | Same |
| "First reinforced concrete" | A specialist architectural history | Commission a check, or drop the claim |
| Caravan geometry | Any route precise enough for metre-level placement | Does not exist. **Visualise the uncertainty rather than erasing it** |
| Height limit | The current gazetted instrument, map sheets, legend, amendments | DPT / Royal Gazette, verified by a second person |
| Nomad numbers | Any defensible denominator | No method currently exists; do not quote a figure |

## Decisions still open

1. **Do we adopt the corrected labels where the printed panels disagree?** Recommended yes, and
   worth telling the exhibition team why.
2. **Does the Wat Ket campaign appear at all**, as unverified community history, or wait?
3. **Is certainty-as-visual-grammar a design-system rule?** If so it needs line styles per
   confidence level, and that belongs with the thread work rather than after it.
