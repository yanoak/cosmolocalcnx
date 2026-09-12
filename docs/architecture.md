# Architecture

## The one decision everything depends on: the scene is a document

A single JSON document fully describes a city. The viewer reads it. The editor reads and writes it.
The renderer never knows or cares where it came from.

```jsonc
{
  "id": "wat-ket",
  "origin": [18.7912, 99.0043],          // lat/lon anchor for local-metre projection
  "boundary": { /* GeoJSON polygon */ },

  "baseline": {                          // generated from OSM — regenerable, never hand-edited
    "buildings": [
      { "id": "osm/way/12345", "footprint": [[x, y], /* … */], "height": 9.6, "kind": "residential" }
    ],
    "roads": [ /* … */ ],
    "water": [ /* … */ ],
    "green": [ /* … */ ]
  },

  "scenarios": [
    {
      "id": "commons-2045",
      "label": { "en": "Riverside Commons", "th": "…" },
      "edits": [                         // a DIFF over baseline, never a copy of it
        { "op": "add",     "asset": "kenney/market-hall", "at": [120, -40], "rot": 90 },
        { "op": "remove",  "target": "osm/way/12345" },
        { "op": "replace", "target": "osm/way/67890", "asset": "custom/floating-school" }
      ]
    }
  ],

  "hotspots": [ /* id, position, label{en,th}, body{en,th}, image */ ],

  "terrain": null                        // reserved. See "Skip elevation" below. Do not implement.
}
```

### Why edits are a diff and not a flat scene

Three properties fall out of this, and they are the three things that would otherwise cost weeks:

**Re-importing OSM never destroys placement work.** Edits reference baseline objects by stable OSM
id rather than embedding them, so the baseline can be regenerated at any time and manual placements
survive. If instead the editor mutated one flat scene, the first OSM re-import would wipe a day of work.

**A second 2045 is nearly free.** Another scenario is another `edits` array over the same baseline.
This is also methodologically right — the interesting artefact for a futures lab is several arguable
futures, not one predicted one. Several futures invite argument; one invites consent.

**Undo/redo is nearly free.** Edits are an append-only op list, so undo is popping a stack.
`zustand` + `zundo` gets there in an hour.

And switching what the visitor is looking at is trivial: render `baseline + edits` for whichever
2045 is selected. No partially-applied state, and `baseline` alone is never a visitor-facing view
— see "Futures only" below.

### Corollary

**The editor is the viewer plus a layer** — same renderer components, same document, one extra mode.
Building a second renderer for the editor is the failure mode to watch for.

## OSM pipeline

Simpler than it sounds. A day or two, not a week.

1. **Overpass API** query clipped to the boundary polygon. Pull `building` (ways and relations),
   `highway`, `waterway` / `natural=water`, `landuse`, `leisure=park`.
2. **Project** lat/lon to local metres against `origin`. A local tangent-plane approximation is
   correct at neighbourhood scale — do not reach for full UTM.
3. **Extrude.** three.js `ExtrudeGeometry` takes a `Shape` built straight from the footprint. Height
   from the `height` tag, else `building:levels × 3.2`, else a per-type default. That is the whole
   building generator.

Run this as a **script that writes `baseline` into the scene document**, not as a live fetch in the
viewer. The exhibition must not depend on Overpass being up.

### Limits

- Warn above ~1 km², hard-reject above ~4 km², and cap building count. Overpass will time out or
  return something unrenderable long before any real limit. Wat Ket fits comfortably.
- **ODbL attribution.** OSM is ODbL — "© OpenStreetMap contributors" must be visible in the viewer.
  One line of JSX, easy to forget until someone asks.

## Performance budget

Visitors load this on their own phones. These are requirements, not optimisations.

- **~100–150k triangles**, a few dozen draw calls
- **Initial download under 10 MB**, ideally under 5 MB
- **Merging is mandatory.** Merge baseline buildings into a handful of geometries grouped by
  category/colour, and instance repeated assets. Thousands of individual meshes will not run on a
  mid-range Android.
- **Only hotspots and placed objects need to be pickable.** Baseline buildings do not — which
  removes the main reason merging would otherwise hurt, and saves a day of picking-buffer gymnastics.
- **Roads as a canvas texture** drawn on the ground plane, not buffered polygons. Vastly less code,
  and at isometric low-poly it looks the same or better.
- **Draco or meshopt on every asset; KTX2 for any texture.**

### Skip elevation entirely

Wat Ket is flat river plain and SRTM is 30 m resolution. Implementing terrain would cost two days on
tile fetching, heightmap sampling and draping buildings onto a surface, and produce something
visually indistinguishable from a flat plane with stair-stepping artefacts.

`terrain` stays in the schema. Never build it. If ground relief is wanted visually, fake it with a
subtle noise displacement on the ground plane.

## Responsive across three surfaces

An orthographic diorama handles this unusually well — adapting between phone portrait, desktop, and
a projector's aspect is mostly frustum and zoom, not layout. But:

- **Touch is the primary input.** Hover is an enhancement the laptop gets, and nothing depends on it.
- **Thumb-sized hit targets everywhere**, including on desktop.
- Phones load from the public Vercel URL. The laptop/projection machine gets a **static export
  served locally**, so venue wifi failing cannot take the installation down.

## Interaction model

A fixed isometric diorama you inspect — not a world you traverse.

- **Scenario toggle** — two or three different 2045s as states of one control. This is the primary
  interaction: the visitor compares futures against each other. Build it first, and never ship it
  with only one scenario in it.
- **8–12 hotspots.** Resist going to 30.
- **No time slider and no "today" state.** Both cut on 12 Sep 2026. Consequences below.
- **No free-roam avatar.** It fails at public exhibitions: strangers do not know the controls, they
  clip into geometry, the camera ends up inside a wall, and the next visitor arrives at a
  broken-looking screen. WASD is also meaningless on a phone. If a character is wanted, use
  **click-to-move with a fixed camera** — point-and-click adventure style. 80% of the embodiment,
  10% of the risk.

Isometric is an orthographic camera at 45° around Y and ~35.264° down. `drei`'s `MapControls`,
constrained, handles pan and zoom.

### Futures only

Two cuts made on 12 Sep 2026, in order: the time slider, then the "today" view.

The scene has a small number of discrete states — **one per 2045 scenario, and nothing else**. The
toggle moves between them. There is no continuous scrub, no partially-applied scene, and no state
showing the present.

**`baseline` stays in the schema and stays essential.** It is what every scenario diffs against,
and it is why 2045 Wat Ket is recognisably Wat Ket rather than a generic block of invention — the
streets, the river and most of the building stock are the real ones. It is a substrate, not a view.
Rendering it alone is a development and editor concern; the public viewer must never expose it as
a state a visitor can select.

What the two cuts remove from the schema and the renderer:

- **Edits need no date and no ordering semantics.** The `edits` array stays an append-only op list
  for undo's sake, but its order carries no meaning about *when* something happens.
- **There is no intermediate state to render**, so nothing has to interpolate or crossfade between
  two versions of a building.
- **Merging gets much easier.** The perf budget requires merging baseline buildings into a handful
  of geometries, which sits badly with a `remove` op that targets one building inside a merge.
  With a fixed, small set of states, each state's geometry can simply be merged once ahead of time
  and swapped whole. This is the cheapest resolution of that tension and it is only available
  because the states are discrete.

What "futures only" costs, and how to pay it back: the present was the reference point that made
each intervention legible as a *change*. Without it, a visitor who does not know Wat Ket sees only
a plausible-looking neighbourhood and cannot tell what was done to it. The interventions must
therefore carry their own before-and-after, and the hotspot copy is where that lands — each
hotspot says what is there now and what replaced it. This is a content requirement, not a
rendering one, and it should shape how the 2045 material is written.

**Two scenarios is the minimum.** With one, the toggle is dead, nothing can be compared, and the
whole methodological argument for this piece collapses into a single prediction. If only one
scenario is ready by 24 Sep, that is a schedule emergency, not a soft landing.

Still open: whether switching states hard-cuts or gets a short transition. That is a presentation
choice with no schema consequence, so it can wait until there is something on screen to judge.

## Asset strategy

No 3D modelling background, twelve days, then three months. Tiers roughly in order of how much of
the scene each covers:

| Tier | Source | Covers |
|---|---|---|
| 1 | Kenney / Quaternius / Poly Pizza (CC0) | Generic filler, day one |
| 2 | **Procedural generators, LLM-written** | The local vernacular — most of the building stock |
| 3 | Billboard sprites from image generation | Clutter, vegetation, people, life |
| 4 | AI 3D generation (Higgsfield / Meshy / Tripo) | Props and hero oddities |
| 5 | Bought kits (Synty POLYGON et al.) | Gap-filling — check the licence permits public display |
| 6 | Hand-made or photogrammetry | Landmarks only — Wat Ket temple itself, the bridge |

### Tier 2 is the important one

Frontier text models do not emit good meshes — ask for a `.glb` and the topology comes out broken.
But they are **excellent at writing the code that generates geometry**, and that is the actual unlock:

> A parameterized Thai shophouse generator — width, depth, storeys, roof pitch, awning depth,
> shutter spacing, balcony yes/no. A few hundred lines of three.js geometry code. One generator
> covers most of the vernacular of a Chiang Mai riverside district, which is precisely what no free
> asset kit will ever contain.

That is where the distinctiveness comes from, it is just code so it iterates at web-dev speed, and
generators *travel to the next neighbourhood* while hand-placed buildings do not. Same logic applies
to Blender Python scripts for batch normalization and LOD generation.

### Tier 3 is free real estate

Image generation is far more mature than 3D generation, and **because the camera is fixed
orthographic, billboard impostors never break**. A hundred generated sprites for trees, market
stalls, motorbikes, laundry and people is an afternoon, and does more for the sense of a lived-in
place than a week of modelling. Art direction for this tier wants a real illustrator rather than a
generator, and **nobody is lined up** — an earlier draft assumed a collaborator who turns out to
work in a different field entirely. Either find an illustrator or accept that tier 3 is generated
and art-directed by whoever is building the scene. See the open questions in the local programme
notes.

### Tier 4 is for props, not buildings

AI 3D generators are usable now for a tuk-tuk, a food cart, a spirit house, a particular tree. They
are bad at architecture — blobby, messy topology, no clean flat faces, poor at repeated structure
like window grids.

### The normalization trap

Every `.glb` arrives at a different scale, orientation and origin — some in centimetres, some Z-up,
some with the pivot floating in space. A fix-up step on ingest is needed: centre it, ground it at
y = 0, scale and rotate against a reference cube, bake the transform. Budget a real day for this; it
is what silently eats time once collaborators start sending models.

### Licence hygiene — do this from asset #1

Put a `license` field in the asset manifest immediately.

```jsonc
{
  "id": "kenney/market-hall",
  "category": "commercial",
  "footprint": [12, 8],
  "anchor": "center-ground",
  "license": "CC0",
  "source": "https://kenney.nl/assets/city-kit-commercial",
  "thumb": "…",
  "tags": ["market", "public"]
}
```

By December there will be a couple of hundred models from kits, purchases, AI tools and
collaborators. CC0 kit assets are fine forever; much of Sketchfab is CC-BY-NC, which is fine for the
exhibition but poisons anything showcased as a product. This costs nothing now and is impossible to
retrofit later.

## Editor notes (for when it gets built properly)

- Drag from a palette, raycast against the ground plane for position.
- Snap to 1 m, rotate in 15° steps. **Free placement beats a hard grid** for an organic Thai
  neighbourhood — but offer snap-to-nearest-road-alignment, which gets the tidy look without
  SimCity rigidity.
- `drei`'s `<TransformControls>` gives a working gizmo immediately. Fine for `/admin`; never ship it
  to the public viewer.
- Clicking a baseline building and hitting "demolish" just appends a `remove` op.

## Stack

| | |
|---|---|
| App | Next.js App Router + TypeScript on Vercel — `/` viewer, `/admin` editor |
| 3D | React Three Fiber + drei |
| Shared | `src/engine/` — renderer components imported by both routes |
| Scene storage | **September:** JSON committed to the repo. **Later:** Postgres (Neon) |
| Assets | **September:** static files in the repo. **Later:** Vercel Blob or R2 |
| Auth | **September:** none. **Later:** minimal — three people use the editor. No org/roles system. |
