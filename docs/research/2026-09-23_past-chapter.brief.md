# Research brief — the "past" chapter

A prompt for a deep research agent. Everything below the rule is the prompt; paste it whole.
Written 23 Sep 2026 for `plans/TODO.md` item 8 (`valley-threads`).

---

## Role

You are researching source material for a documentary 3D web exhibit about Chiang Mai. Your output
will be used two ways at once, and both matter equally:

1. **As geography that gets drawn.** Alignments you find will be rendered as lines on a digital
   elevation model. Vague is useless; "the railway runs south-east" cannot be drawn.
2. **As text a visitor reads.** Short captions, 40–80 words per thread, that must be true.

You are **not** writing the captions. You are assembling the verified material someone else will
write them from, plus the spatial data an engineer will render.

## What the piece is, in one paragraph

A 3D isometric web exhibit showing the Wat Ket district of Chiang Mai. It has three views and each
view owns one tense: a **valley** view is the past, a **circle** view is the present, and a **city**
view is 2045. You are working only on the valley — the basin Chiang Mai sits in, drawn as shaded
relief — and specifically on four historical "threads" that cross it. The argument the chapter
makes is that Chiang Mai has repeatedly been reshaped by whatever connected it to the world, and
that each new connection brought new people, technologies and economies with it.

The four threads, in order, are **river → roads → rail → remote work**. The first three have
physical alignments that can be surveyed and drawn. The fourth deliberately does not, which is why
it is last and why it hands over to a different view. You should still research it; you simply
will not find a route for it.

## The geographic frame — work inside this

| | |
|---|---|
| Origin | **18.7912° N, 99.0043° E** (Wat Ket, Chiang Mai) |
| Extent | **±60 km on each axis from the origin — a 120 × 120 km square**, WGS84 |
| Elevation range in frame | 226 m to 2,565 m |

Anything outside that square cannot be drawn, so a route that runs to Yunnan or Bangkok is only
useful to us **where it crosses this square**, plus a bearing and a note saying where it goes. Give
coordinates as decimal degrees, WGS84, longitude then latitude.

## The four threads, and what to find for each

For every thread, answer both halves: **where it physically ran**, and **what it brought**.

### 1. River — the Ping

- Was the Ping navigable between Chiang Mai and Bangkok, by what craft, in which seasons, and how
  long did the journey take upstream and downstream? When did regular commercial traffic end, and
  what ended it?
- The late-nineteenth-century **teak boom**: which companies operated, under what concession
  arrangements, employing whom, over what dates. Which foreign communities arrived as a result.
- **Wat Ket specifically** — it was a landing and a trading bank. What stood there: landings,
  godowns, consulates, the temple, the mosque, the church, Chinese shrines. Why a single riverside
  district came to hold several faiths.
- Has the channel itself moved within the last 150 years? If historical maps show a different
  course, that is directly renderable and valuable.
- Flooding: major recorded floods and their extent, if documented.

### 2. Roads — caravans, then tarmac

- **Caravan routes to Yunnan.** Was Chiang Mai genuinely on the network often called the Tea Horse
  Road, or is that a loose modern attribution? Which passes and river crossings did the caravans
  actually use? Who ran them — the Haw / Chin Haw Muslim traders and others — over what period, and
  carrying what in each direction. **Treat the "Tea Horse Road" label with suspicion and say what
  the evidence supports.**
- **Modern roads.** When were the main highways out of the basin built or metalled — the
  Chiang Mai–Lampang route, the routes north and south along the valley, and the ring/superhighway.
  Construction dates, and what each changed.
- **Local streets in Wat Ket and San Pa Khoi.** Charoen Muang, Charoen Rat, Faham and the lanes
  around them: when did this grid form, and in relation to what — the river, the station, or
  later planning?

### 3. Rail — the Northern Line

- Construction chronology of the Northern Line to Chiang Mai, including the **Khun Tan tunnel**:
  dates, duration, labour, casualties if recorded. When did the first train reach Chiang Mai — give
  the precise date and say how confident you are, because sources differ.
- **The alignment**, as precisely as you can, where it crosses our 120 km square.
- **Chiang Mai railway station**: exact location, and its distance and relationship to Wat Ket and
  San Pa Khoi. We believe San Pa Khoi sits close to the station; confirm or correct this, because
  it is a load-bearing link in the chapter.
- Journey time and cost, Bangkok to Chiang Mai, **before and after** the line opened. Concrete
  numbers are the single most useful thing you can bring back here.
- Verify this specific claim from the exhibition's own printed panel: that the railway brought *"new
  building materials and designs, and with them the first steel-reinforced buildings in Lanna."*
  Is that documented? Which buildings, and do any survive?

### 4. Remote work — the thread with no route

- When did the internet arrive in Chiang Mai in a form that made remote work possible, and when did
  the first coworking spaces open?
- Chiang Mai International Airport: when it opened, when it took international flights, and how
  route growth tracked the arrival of long-stay foreigners.
- The digital-nomad population: **best available estimates with their methodology**, because most
  circulating figures are unsourced. Say plainly when a number cannot be substantiated.
- Visa regimes that made longer stays possible, including recent Thai long-stay and
  destination-type visas, with dates.
- Is there any defensible way to depict this as geography — undersea cable landings, backhaul
  routes, flight corridors? If the honest answer is no, say so. **"It cannot be drawn as a route"
  is a useful finding, not a failure**, because the chapter uses exactly that to move on.

## Sources and licensing — a hard constraint

This is a **public GitHub repository**, and it already credits nine separately licensed data
sources. Anything you propose we use must be redistributable, so:

- For **every dataset** you recommend, state: the licence by name, whether redistribution is
  permitted, the exact attribution string required, and a **stable, fetchable URL**. A dataset
  without a clear licence is not usable no matter how good it is.
- Prefer sources that can be fetched by script and produce identical output on re-run. The project
  requires byte-identical regeneration from cached sources.
- We already hold and do not need re-sourcing: **Copernicus DEM GLO-30** (the relief), **OSM** via
  Overpass, **Overture** building footprints, **GHS-POP**, **GeoNames**, and an HDX tambon boundary.
  Tell us which OSM tags carry the rail and road alignments rather than finding another source for
  something OSM already has.
- Georeferenced **historical maps** are especially valuable — the Royal Thai Survey Department, US
  Army Map Service sheets, David Rumsey, the Library of Congress. For each, state the survey date,
  the scale, and the copyright status.

## Language

Much of the best material is in Thai. Use Thai-language sources and say so. Give Thai place names in
**Thai script, a romanisation, and the English form** where all three exist. Note where a
romanisation is contested.

## Rules of evidence

- **Do not repeat the exhibition's claims back to us.** Several are quoted above precisely so you
  can check them. Where a claim is wrong or oversimplified, say so directly.
- **Two independent sources for every date.** Where they disagree, give both and say which is better
  supported rather than picking silently.
- Mark every finding **Confirmed**, **Probable** or **Contested**, and never present an inference as
  a fact.
- Distinguish what is *documented* from what is *commonly repeated*. This subject has a lot of
  travel-writing folklore attached to it.
- **Do not name living private individuals.** Historical figures and public officials are fine;
  present-day residents, business owners and interviewees must not appear.

## Deliverable

A markdown report:

1. **Summary** — the six or eight findings that most change how this chapter gets built.
2. **One section per thread**, each containing: a dated chronology; what it brought (people,
   technologies, economies); an alignment table of coordinates within the 120 km square; and the
   two or three concrete details worth putting in front of a visitor.
3. **A data table** — every recommended dataset, with licence, attribution string, URL and what it
   would be used for.
4. **Corrections** — every claim quoted above that your research contradicts or qualifies.
5. **What you could not establish**, and what would be needed to close each gap. Be explicit; a
   known hole is worth more to us than a confident guess.

Prefer depth on the Ping and the railway over breadth. Those two are where the chapter's argument
actually lands, and the roads thread can be thinner without weakening it.
