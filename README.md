# cosmolocalcnx

A 3D isometric web app showing **Wat Ket district, Chiang Mai, in 2045** — the neighbourhood as it
is today, generated from OpenStreetMap, with speculative 2045 interventions layered on top. Visitors
scrub a time slider, switch between alternative futures, and tap things to read about them.

Built for the **Nomad Futures Lab** exhibition at Pantip Plaza, Chiang Mai, opening **24 September
2026**, as part of Cosmo Local CNX September 2026.

The engine is deliberately separate from the content: a general tool for generating an editable
speculative city from a boundary polygon, with Wat Ket as its first scene. The second horizon is
**Chiang Mai Design Week, December 2026**, where the engine itself is meant to show as a more
complete product.

## Stack

Next.js App Router + TypeScript · React Three Fiber + drei · deployed on Vercel.

## Docs

Start with [`CLAUDE.md`](./CLAUDE.md) — the project context, the locked decisions, and the non-goals.

- [`docs/programme-context.md`](./docs/programme-context.md) — the exhibition, the people, the audience
- [`docs/architecture.md`](./docs/architecture.md) — scene schema, OSM pipeline, performance budget, asset strategy
- [`docs/roadmap.md`](./docs/roadmap.md) — the week-one cut line and the path to December
- [`plans/`](./plans/) — one file per piece of substantial work: goal, approach, tasks, outcome
- [`work-diary/`](./work-diary/) — daily record of what was planned, what shipped, and what was decided

## Running it

Not yet scaffolded. This repo currently contains planning documentation only.

## Licensing

This repository contains three kinds of thing under three different licences. A single blanket
licence would misstate the terms, because OpenStreetMap's is share-alike and cannot be
relicensed.

| What | Licence |
|---|---|
| **Code** — the engine, the OSM pipeline, the editor, everything in `src/` and `scripts/` | [MIT](./LICENSE) |
| **OSM-derived data** — building footprints, roads, water and landuse in any scene document's `baseline` | [ODbL](https://opendatacommons.org/licenses/odbl/), © OpenStreetMap contributors |
| **Authored content** — the 2045 scenarios, hotspot text, images, and the Wat Ket scene's speculative layer | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

Third-party 3D assets keep their own licences, recorded alongside them in the asset library.
Anything that cannot be redistributed is not committed — it gets fetched by a script instead.

**Attribution in the viewer:** "© OpenStreetMap contributors" must be visible on screen. ODbL
requires it and it is one line of JSX, easy to forget until someone asks.
