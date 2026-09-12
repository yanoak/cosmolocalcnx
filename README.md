# cosmolocalcnx

A 3D isometric web app showing **Wat Ket district, Chiang Mai, in 2045** — two or three arguable
futures for the neighbourhood, which visitors switch between and tap to read about. Each is built
over an OpenStreetMap baseline of the real district, so the streets, the river and most of the
building stock are the ones Wat Ket actually has. The present itself is never shown.

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

- [`docs/architecture.md`](./docs/architecture.md) — scene schema, OSM pipeline, performance budget, asset strategy
- [`docs/design-system.md`](./docs/design-system.md) — palette, role tokens, materials
- [`docs/roadmap.md`](./docs/roadmap.md) — the week-one cut line and the path to December
- [`plans/`](./plans/) — one file per piece of substantial work: goal, approach, tasks, outcome
- [`work-diary/`](./work-diary/) — daily record of what was planned, what shipped, and what was decided

## Running it

Node lives under nvm and is not on the default PATH that tooling sees:

```sh
export PATH="$HOME/.nvm/versions/node/v22.18.0/bin:$PATH"
npm install
npm run dev          # viewer at http://localhost:3000
npm test             # the pure functions — projection, clipping, height synthesis, budget guards
npm run typecheck
```

### Regenerating the baseline

The scene document is committed, so **none of this is needed to run the app** — the exhibition
must not depend on a third-party API being up. Run it only to re-import OpenStreetMap:

```sh
npm run fetch:osm                 # rebuilds baseline from the cached Overpass response
npm run fetch:osm -- --refresh    # re-queries Overpass first
npm run fetch:elevation           # flood-reference elevation, which the renderer never reads
```

The district boundary is extracted once from the HDX Common Operational Dataset and committed as
a single polygon; the 377 MB source archive is not. See the docstring in
`scripts/extract-boundary.py` for the download URL.

## Licensing

This repository contains four kinds of thing under four different licences. A single blanket
licence would misstate the terms, because OpenStreetMap's is share-alike and cannot be
relicensed.

| What | Licence |
|---|---|
| **Code** — the engine, the OSM pipeline, the editor, everything in `src/` and `scripts/` | [MIT](./LICENSE) |
| **OSM-derived data** — building footprints, roads, water and landuse in any scene document's `baseline` | [ODbL](https://opendatacommons.org/licenses/odbl/), © OpenStreetMap contributors |
| **Authored content** — the 2045 scenarios, hotspot text, images, and the Wat Ket scene's speculative layer | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| **Administrative boundary** — `src/scenes/wat-ket.boundary.geojson`, the Wat Ket tambon polygon | [CC BY-IGO](https://creativecommons.org/licenses/by/3.0/igo/), OCHA Field Information Services Section |

Elevation samples in `src/scenes/*.elevation.json` come from SRTM, which is public domain
(NASA/USGS) and needs no attribution.

Third-party 3D assets keep their own licences, recorded alongside them in the asset library.
Anything that cannot be redistributed is not committed — it gets fetched by a script instead.

**Attribution in the viewer:** two of these require visible on-screen credit, and both are in the
viewer's footer — "© OpenStreetMap contributors" for ODbL, and OCHA for the CC BY-IGO boundary.
A few lines of JSX, easy to forget until someone asks.
