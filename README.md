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

### Setting up the exhibition machine

**Open `/settings`.** Opening view, topography style, level of detail and language, kept in that
browser's `localStorage` — so the laptop and the projector are each set up once and stay set
across restarts. Visitors' phones have nothing stored and get the defaults, which is the point.

The same four are also URL parameters, and a parameter **wins for the load it is on** without
changing what the machine has stored — so a QR code can still aim somewhere specific.

| | |
|---|---|
| `?view=circle\|valley\|city` | open on one of the three views instead of running the on-ramp |
| `?relief=hillshade\|gradient\|terraced` | how the valley's topography is drawn |
| `?lod=near\|full` | backdrop raster, or all 68,704 buildings as real geometry |
| `?locale=en\|th` | opening language |

**`?lod=full` is what the laptop and the projector want.** The default trades sharpness for a
phone's budget: everything beyond 1,250 m is a pre-rendered raster at 4.80 m per texel, which is
at its limit at district fit and softens as you zoom. `?lod=full` fetches the 19 MB document and
draws every building for real — crisp at any zoom, about a million triangles, and the one thing a
phone cannot do.

Set it at the start of the day, not during a show: the merge is synchronous and freezes the page
for about six seconds. `f` toggles it on a keyboard and saves what it toggled to, which is there
for judging it on the machine rather than in front of an audience.

Measured on the static export — the thing the laptop actually runs — a default load fetches
4.89 MB; with full geometry turned on it fetches 13.8 MB, fires `load` at 5.1 s, and then spends
about six seconds merging.

### The print tool

`/print` turns the scene into STLs for the exhibition's 3D print: a base plate with the buildings
extruded on it, the Ping and the parks raised, the wider streets as raised ribbons, and every
water crossing as a bridge — tiled into plates that fit a Bambu A1 mini's 180 mm bed and
interlock with tabs.

Bridges print **solid to the plate**, with no void under the span. A deck on piers is an overhang
that needs supports under every bridge and snaps when they come off, so a printed bridge is a
causeway: the deck's height is real, its underside is the plate. Decks too thin to print are
widened until they can be. Heights are exaggerated —
the median Wat Ket building is 5 m, which at any printable scale is thinner than a nozzle — and
the factor is stated on screen, in each file's header and in the README the download carries.

**It is internal and is not on the deployed site.** `src/app/print/` is in `.vercelignore`, so the
Vercel build never sees it; it works on a dev server and in a local `npm run build` export. There
is no server here to put auth on, so absence is the gate.

### Regenerating the baseline

The scene document is committed, so **none of this is needed to run the app** — the exhibition
must not depend on a third-party API being up. Run it only to re-import OpenStreetMap:

```sh
npm run fetch:buildings           # Overture footprints + observed heights → data/buildings-cache/
npm run fetch:osm                 # rebuilds baseline from the two caches
npm run fetch:osm -- --refresh    # re-queries Overpass first
npm run fetch:osm -- --osm-only   # baseline from OpenStreetMap alone
npm run fetch:osm -- --clip tambon # cut the extent to the Wat Ket tambon polygon
npm run fetch:relief              # Copernicus DEM → the relief backdrop around the scene
npm run fetch:elevation           # flood-reference elevation, which the renderer never reads
```

OpenStreetMap holds about one Wat Ket building in seven, so the building layer is Overture's
conflation of OSM, Google Open Buildings and Microsoft's ML footprints, and heights come from
the Google Open Buildings 2.5D Temporal raster where it has a reading, tags first and synthesis
last. `fetch:buildings` needs Python with `duckdb rasterio shapely pyproj s2sphere numpy`; see
the docstring in `scripts/fetch-buildings.py`.

The district boundary is extracted once from the HDX Common Operational Dataset and committed as
a single polygon; the 377 MB source archive is not. See the docstring in
`scripts/extract-boundary.py` for the download URL.

## Licensing

This repository contains nine kinds of thing under several licences. A single blanket
licence would misstate the terms, because OpenStreetMap's is share-alike and cannot be
relicensed.

| What | Licence |
|---|---|
| **Code** — the engine, the OSM pipeline, the editor, everything in `src/` and `scripts/` | [MIT](./LICENSE) |
| **OSM-derived data** — building footprints, roads, water and landuse in any scene document's `baseline` | [ODbL](https://opendatacommons.org/licenses/odbl/), © OpenStreetMap contributors |
| **Satellite-derived footprints** — baseline buildings with `overture/` ids | [ODbL](https://opendatacommons.org/licenses/odbl/), [Overture Maps Foundation](https://overturemaps.org/), incorporating [Google Open Buildings](https://sites.research.google/open-buildings/) (CC BY 4.0 / ODbL) and [Microsoft Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints) (ODbL) |
| **Observed building heights** — `height` on baseline buildings where the raster had a reading | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) / ODbL, [Google Open Buildings 2.5D Temporal](https://sites.research.google/gr/open-buildings/temporal/) |
| **Relief backdrop** — `src/scenes/*.relief.png` and sidecar, the land around the scene | [Copernicus DEM GLO-30](https://registry.opendata.aws/copernicus-dem/): © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved |
| **Authored content** — the 2045 scenarios, hotspot text, images, and the Wat Ket scene's speculative layer | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| **Administrative boundary** — `src/scenes/wat-ket.boundary.geojson`, the Wat Ket tambon polygon | [CC BY-IGO](https://creativecommons.org/licenses/by/3.0/igo/), OCHA Field Information Services Section |
| **Population field** — `src/scenes/regions/*.png`, the REGION register's gridded population | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), European Commission JRC, Global Human Settlement Layer |
| **City names and positions** — `src/scenes/regions/*.cities.json` | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [GeoNames](https://www.geonames.org/) |

Elevation samples in `src/scenes/*.elevation.json` come from SRTM, which is public domain
(NASA/USGS) and needs no attribution.

**Seven of these require visible credit**, and all seven are in the viewer's footer: OpenStreetMap
for ODbL, Overture with Google and Microsoft for the satellite-derived footprints, Google for the
observed heights, the Copernicus notice for the relief, OCHA for the boundary, the JRC for the
population field, and GeoNames for the city names. Forgetting one is easy and noticing it is somebody else's job, so the footer is the
single place they live.

Third-party 3D assets keep their own licences, recorded alongside them in the asset library.
Anything that cannot be redistributed is not committed — it gets fetched by a script instead.

**Attribution in the viewer** is one paragraph of JSX at the bottom of `src/app/page.tsx`. Add a
data source, add a clause there — easy to forget until someone asks.

**A 3D print is a Produced Work and carries its own credit.** It leaves the repository as an
object with no footer attached to it, so `printSummary` in `src/engine/print.ts` writes the
sources into the `README.txt` inside every download, next to the scale and the exaggeration
factor. Add a data source that reaches the plate, add it there too.
