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
      "label": { "en": "Riverside Commons", "th": "…" },   // locale map, not a fixed pair
      "edits": [                         // a DIFF over baseline, never a copy of it.
                                         // Order exists for undo. It carries no sense of time.
        { "op": "add",     "asset": "kenney/market-hall", "at": [120, -40], "rot": 90 },
        { "op": "remove",  "target": "osm/way/12345",
                           "wasAt": [80, -12] },        // snapshot — survives OSM re-import
        { "op": "replace", "target": "osm/way/67890", "asset": "custom/floating-school",
                           "wasAt": [150, 30] }
      ],
      "hotspots": [ /* scenario-specific: about this future's own interventions */ ]
    }
  ],

  "hotspots": [                          // shared: what every future has in common
    { "id": "wat-ket-temple",
      "target": "osm/way/12345",         // attach to an object where there is one…
      "at": [60, -20],                   // …otherwise a bare position. One or the other.
      "label": { /* locale map */ }, "body": { /* locale map */ }, "image": "…" }
  ],

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

### Edits snapshot what they point at

Edits reference baseline objects by OSM id, which is what lets the baseline be regenerated without
destroying placement work. But OSM ids are not stable forever — ways get split, merged, retagged
and deleted upstream, and a re-import in November can leave an edit pointing at nothing.

So **every `remove` and `replace` also stores `wasAt`**, the target's centroid at the time the edit
was authored. Two fields' worth of cost, and it means:

- A `replace` whose target vanished still places its asset in the right spot.
- A `remove` whose target vanished is a no-op, which is the correct outcome anyway.
- The import **warns loudly** and lists every orphaned edit, rather than failing the import or
  silently dropping work. The import must keep working at 2am in week two; a triage queue that
  blocks it is worse than a warning nobody reads that day.

Decided 12 Sep 2026.

### Hotspots attach to objects, and fall back to positions

A hotspot names a `target` when it describes something that exists in the scene, so moving that
object in the editor carries its hotspot along. A hotspot about a place rather than a thing — the
riverbank, a junction, a view across the water — carries a bare `at` position instead. One or the
other, never both.

**Scope is two-level.** Hotspots about what every future shares — the river, the temple, the market
— live once at scene level. Hotspots about a specific intervention live inside that scenario, so
they appear only while that future is selected. Without the split, either the shared copy gets
written two or three times and drifts, or an intervention's hotspot shows up while looking at a
future that does not contain it.

This matters more since the present was cut: the hotspot copy now carries the before-and-after that
a "today" view used to supply, so a hotspot drifting away from its subject loses more than a label.

Decided 12 Sep 2026.

### Scenarios do not compose

Each scenario is its own `edits` array over the same baseline. There is no shared "common 2045"
layer that futures inherit and extend.

A shared layer would say something true — that these futures agree on some things — and would avoid
writing an agreed edit more than once. It was rejected anyway: it introduces a composition order to
reason about and a second place to look when something renders wrong, for a saving that only bites
at a scale this project will not reach before December. Independent lists already satisfy the
roadmap's test that a second scenario is nearly free.

Revisit if a fourth scenario ever appears. Decided 12 Sep 2026.

### Localised text is a map, not a pair

Every human-readable string in the document — scenario labels, hotspot titles and bodies — is an
object keyed by locale code, and the renderer looks up the active locale with a fallback chain. It
is **not** a fixed `{en, th}` shape, even though English and Thai are the only locales September
will ship.

The difference costs about an hour now and is painful to retrofit once a dozen hotspots across
several scenarios have been authored. Its value is entirely optionality: the content is already
designed to land late, and a residency is a plausible place for a translator or a Tai Tham reader
to appear. If one does, the only missing piece should be the words. See *Localization* in
`docs/roadmap.md` for what is and is not in scope.

## OSM pipeline

Simpler than it sounds. A day or two, not a week.

1. **Overpass API** query clipped to the boundary polygon. Pull `building` (ways and relations),
   `highway`, `waterway` / `natural=water`, `landuse`, `leisure=park`.
2. **Satellite-derived buildings** for the same box — see the next section. OSM held one Wat Ket
   building in seven, so the building layer is Overture's conflation of OSM, Google and Microsoft
   footprints, and heights are observed from a raster where it has a reading.
3. **Project** lat/lon to local metres against `origin`. A local tangent-plane approximation is
   correct at neighbourhood scale — do not reach for full UTM.
4. **Extrude.** three.js `ExtrudeGeometry` takes a `Shape` built straight from the footprint. Height
   from the `height` tag, else `building:levels × 3.2`, else the observed raster height, else a
   per-type synthesis. That is the whole building generator.

Run this as **scripts that write `baseline` into the scene document**, not as a live fetch in the
viewer. The exhibition must not depend on Overpass, S3 or Google Cloud Storage being up.

### Buildings come from Overture and a height raster, not OSM alone

Added 19 Sep 2026. Four satellite-derived sources were pulled for the tambon and matched against
the Overpass cache; the numbers are in that day's diary and in
`plans/2026-09-19_satellite-footprints.plan.md`. Two were adopted:

- **Overture Maps `buildings`** for footprints. It already conflates OpenStreetMap, Google Open
  Buildings and Microsoft's ML footprints and carries the OSM record id, so the join back to the
  Overpass cache is exact. The release is pinned in `scripts/fetch-buildings.py`. OSM-sourced
  buildings keep their `osm/way/…` ids and their Overpass geometry and tags; everything else is
  `overture/<id>` with kind `default`. A non-OSM footprint whose centroid lands inside an OSM
  building is dropped, because the Overpass cache is newer than Overture's snapshot.
- **Google Open Buildings 2.5D Temporal** for heights: a yearly raster at 4 m effective
  resolution with building presence and height bands, read as HTTP-range windows out of its
  cloud-optimised tiles and sampled at 1 m under every footprint, OSM's included. It knows Rim
  Ping Condominium is 65 m where synthesis had said 8.

The raw Google and Microsoft sets were tried and are not used directly; Overture contains them.

`npm run fetch:buildings` writes one gitignored cache under `data/buildings-cache/`;
`npm run fetch:osm` reads it beside the Overpass cache and `src/engine/satellite.ts` does the
merge, pure and unit-tested. Same invariant as everything else: re-running against the same
caches is byte-identical.

### Coordinates and units

Fixed once, here, because getting it wrong is invisible until everything is 100× too big:

- **Metres**, always. No other unit appears anywhere in the document or the scene graph.
- **three.js native orientation** — Y is up, X is east, and **−Z is north**. Footprints in the
  document are planar `[x, y]` pairs in local metres, which map to scene `[x, −y]` on the ground
  plane with height along Y.
- **`origin`** is the lat/lon that maps to `[0, 0]`. Local tangent-plane projection against it, with
  east/west scaled by `cos(latitude)` — not 1:1, which is the classic way to get a squashed city.
- **Imported assets are baked to this convention at ingest**, not rotated at runtime. Blender and
  much of the glTF world is Z-up; the normalization step described under "The normalization trap"
  is where that is resolved, once, per asset.

The projection and the footprint-to-geometry conversion are pure functions and both get unit tests.

### The boundary comes from HDX, and the scene is a clip of it

OSM has no Wat Ket polygon — no admin relation, no place polygon, nothing. The boundary is the
**ADM3 (tambon) polygon `TH500106`** from the HDX Common Operational Dataset for Thailand, pulled
out once by `scripts/extract-boundary.py` and committed as a single 174-point polygon. The 377 MB
source archive is not committed; nothing at build or run time reads it.

**The tambon is not the scene.** It is 6.85 km² and an administrative unit rather than a
neighbourhood, running 3 km south of the origin past anything a resident would call Wat Ket. The
scene is a rectangular working extent in `scripts/fetch-osm.ts`, and *that* is what lands in the
document's `boundary`. The extent is the editorial lever and it is one constant in one file; the
tambon polygon beside it stays committed and untouched as the boundary credit.

Chosen 12 Sep 2026: 1.50 × 2.70 km intersected with the tambon, 2.98 km², 1,182 OSM buildings;
4,056 once the satellite-derived footprints landed on 19 Sep 2026.

**Extended 19 Sep 2026: 5.80 × 8.10 km, 47 km², the rectangle alone.** The original rectangle
grown by its own size in every direction and then pushed west to take in the whole moated old
city, crossing the Ping. `--clip tambon` restores the intersection. The cost was measured before
deciding and is in `plans/2026-09-19_extended-extent.plan.md`: 68,704 buildings and ~1M
triangles, ten times the phone budget below, an 18.8 MB document. It was chosen with those numbers
in hand, for the installation surfaces; see "Limits" for what that means.

### Limits

- Warn above ~1 km², hard-reject above ~4 km², and cap building count. These are the **phone
  budget**: what a visitor's own device over the QR code will load. The import computes them on
  every run. In `phone` mode it refuses to write; since 19 Sep 2026 Wat Ket is in `installation`
  mode, where the same limits print as "OVER PHONE BUDGET" and the document is written anyway.
  The numbers never move — renaming the budget to fit the scene is how a constraint stops being
  one — so every run says how far over the phone budget the scene is. Getting the phone surface
  back means level-of-detail work, not a bigger number.
- **An extruded footprint is far cheaper than a mesh.** Measured 12 Sep 2026: about **4v − 4
  triangles for v ring vertices**, which is ~17 per real OSM building — not the 50–100 a mesh
  costs. The 1,182 OSM buildings came to ~22k triangles; with the satellite-derived footprints
  the 4,056 in the same clip came to ~61k, against the ~100k phone ceiling. The tripled extent is
  a different regime — see the plan for its count — and it is everything merged into two draw
  calls that makes it renderable at all on the installation machine. Do not shrink the scene to
  save triangles without measuring first.
- **Six attributions, all required to be visible**, and all in the viewer's footer: "©
  OpenStreetMap contributors" for ODbL, Overture with Google and Microsoft for the satellite-derived
  footprints, Google for the observed heights, OCHA for the CC BY-IGO boundary, the JRC for the
  population field and GeoNames for the city names. One paragraph of JSX, easy to forget until
  someone asks.

### Height is observed where it can be, synthesised where it cannot

96% of Wat Ket's buildings carry no height information in OSM — 56 `building:levels` tags across
the whole scene and no usable `height`. Until 19 Sep 2026 `src/engine/synth.ts` therefore authored
almost the entire skyline. Now the Open Buildings 2.5D Temporal raster does: it has a reading for
76% of the 4,056 buildings, and synthesis covers the remaining quarter, mostly small footprints
the 4 m raster cannot resolve.

The chain in `resolveHeight` is tag → observed → synthesis, and each rung has its own ceiling:
synthesis 30 m, observed 100 m, tags 150 m. An observation is evidence, so it may exceed anything
synthesis is allowed to invent; but the raster measured Supalai Monte at 75 m against its tagged
111, so it cannot vouch for a tower and a tag always beats it. An observation is only trusted
when at least 30% of the footprint's pixels read as building.

Two properties still matter for the synthesised quarter, and they are the whole design of that
module:

- **Deterministic.** Variation comes from a hash of the OSM id, never from `Math.random()`. A
  re-import in November must not reshuffle the skyline, or every screenshot, every hotspot position
  and every placement judgement made before it silently stops matching.
- **Not a spreadsheet.** A flat per-kind default across 1,182 buildings is a city of identical
  blocks — obviously fake to an audience who knows these streets. Storeys come from footprint area
  (logarithmically) and kind, jittered by the id hash and quantised to half-storeys.

A tagged height is trusted far further than an invented one: synthesis is capped at 30 m, tags at
150 m, because `Supalai Monte` on the east bank really is `height=111` and clamping it would delete
the tallest building in the district.

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
  and at isometric low-poly it looks the same or better. Implemented in `src/engine/roads.ts`: the
  document stores polylines and the texture is drawn at load, so roads stay editable and the
  resolution can follow the surface.
- **Baseline geometry is merged into one mesh per layer** (`src/engine/merge.ts`) — buildings,
  water, green. At 1,182 buildings a mesh each is 1,182 draw calls against a budget of "a few
  dozen". Picking survives merging: a raycast reports a face index and `idForFace` maps it back to
  an OSM id, so the architecture's permission to drop baseline picking has not had to be used.
- **Draco or meshopt on every asset; KTX2 for any texture.**

### Measured, 21 Sep 2026

They stopped being only a budget. Measured in a foreground browser on the static export, by
patching `drawElements`/`drawArrays` and nudging the camera — the renderer is on-demand and idles
at zero draw calls, so it has to be provoked:

| | 19 Sep | 21 Sep |
|---|---|---|
| Triangles, city view | ~1.13M | **157,532** |
| Draw calls | — | **8** |
| Payload | 4.44 MB gzip (14.23 raw) | **1.16 MB gzip (3.95 raw)** |

Draw calls are far inside "a few dozen". Triangles are about 5% over the ceiling, and the
remainder is not buildings: the near set is 112k, and the rest is the relief backdrop, water,
green and the bridges.

**Two things got it there**, both on 21 Sep. The far city became a raster — see *Level of detail*
below — and the relief backdrop, which turned out to be the largest single object in the scene at
130,050 triangles once the buildings stopped drowning it out, is drawn at every second cell.

The remaining item is still the device test: roadmap item 1 ends by loading a representative scene
on a cheap Android, because the realistic failure on a low-end phone is load time and thermal
throttling rather than WebGL support. See *Device reach* in `docs/roadmap.md`.

### Level of detail — near geometry, far backdrop

Added 21 Sep 2026, when the scene had been ten times over the phone budget for two days.

**Geometry where there is content, a pre-rendered raster where there is context.** Buildings within
1,250 m of the origin stay real geometry — 7,588 of them, 112k triangles. The other 61,116 are
rendered once, offline, into two committed 8-bit PNGs totalling 180 KB and hung on planes normal to
the view direction.

**This is exact, not an approximation, and the reason is worth guarding.** The camera is
orthographic and `enableRotate={false}`, so zooming is a 2D scale of the projected image and
panning is a 2D translation. There is no parallax to get wrong: the raster is the same picture the
geometry would have drawn, and only resolution degrades. **Enabling orbit would silently turn the
backdrop from exact into wrong**, and nothing else would complain.

Two depth slices, not one plane: 17,560 of the far buildings stand between the camera and Wat Ket,
and a single backdrop behind the near set would hide every one of them.

The raster stores **tone indices, not colours**, and `theme.ts` owns the palette — the same split
`wat-ket.relief.png` uses for its hypsometric ramp. The precedent is the 16 Sep brand swap: a
backdrop with colours baked in would have quietly kept the 1967 PROGRESS palette while every other
surface moved.

The radius is a **proxy**. The real rule is that heroes — the buildings a hotspot points at — are
always geometry at any distance, so when item 5's content lands, distance stops being load-bearing.

`wat-ket.json` keeps all 68,704 buildings and stays the source of truth; `wat-ket.viewer.json` is
the derived payload the viewer imports. `backdrop-freshness.test.ts` fingerprints the generator's
inputs into the sidecar and fails the suite if either drifts — which is the same guarantee
rendering at build time would give, without putting a six-second render on the deploy path.

### Relief is a backdrop, terrain stays null

**Nothing in the baseline ever sits on a sampled surface.** `terrain` is `null` in the scene
document, `validateScene` asserts it, and that is permanent: Wat Ket is river plain flat to
±10 m, the DEMs are 30 m, and draping buildings onto a sampled surface costs days and produces
stair-steps indistinguishable from flat. `src/scenes/*.elevation.json` is flood-reference data
the renderer never reads.

**Since 19 Sep 2026 the land *around* the scene is drawn.** Chiang Mai is a valley city — Doi
Suthep and Doi Pui rise 1,370 m within 10 km of the old city — and a scene of it with nothing
around it is a scene of somewhere else. `scripts/fetch-relief.py` distils the Copernicus 30 m DEM
under a 48 × 48 km box about the origin into a committed 256-cell field (`*.relief.png` plus a
sidecar, both byte-identical on re-run), and `src/engine/ReliefBackdrop.tsx` draws it as one unlit,
vertex-coloured mesh in the district's own frame. `reliefHeights` in `relief.ts` flattens it
under the scene rectangle at draw time, a hair below the ground plane, with a 600 m feather
beyond the edge; so the diorama sits on its plain and the mountains rise beyond it, and the
rectangle can move without refetching the DEM. It lives in the district group and collapses with
the district in the handover, so it needs no register of its own.

The document names it as `relief`, a sibling of `region`, **not** as `terrain`. Two names for two
things: one is the ground the city stands on (never sampled), the other is the country the city
stands in (sampled, coarse, decorative). Keeping them apart is what keeps "buildings are never
draped" a checkable invariant rather than a memory.

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
- **No time slider.** Cut 12 Sep 2026. The "today" state was cut with it and then partly
  reinstated on 16 Sep as a one-way **on-ramp** — see "Registers" below. There is still no control
  a visitor can use to select the present.
- **Semantic zoom is the primary gesture.** Three registers on one rail. See "Registers" below.
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
Rendering it alone was a development and editor concern until 16 Sep 2026, when the on-ramp made
it visitor-*reachable*. It is still never visitor-*selectable*: there is no control that returns to
it. See "Futures only, and the 2026 on-ramp" under Registers.

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

## Three views — the circle, the valley, the city

**Rewritten 21 Sep 2026.** From 16 to 21 Sep this was one rail: three registers a visitor moved
through with a single gesture, from the Valeriepieris circle to a shophouse. That is gone. The
scene now has **three discrete views**, and zoom stays inside whichever one is open.

```
 ┌── CIRCLE ────────┐   ┌── VALLEY ────────┐   ┌── CITY ──────────┐
 │ AEQD, kilometres │   │ local metres     │   │ local metres     │
 │ population field │ ⇄ │ DEM, 120 km      │ ⇄ │ diorama, 8 km    │
 │ 3,437 km radius  │   │ 2,565 m relief   │   │ district ⇄ block │
 │ a claim          │   │ a landscape      │   │ a place          │
 └──────────────────┘   └──────────────────┘   └──────────────────┘
     zoom inside          zoom inside             zoom inside
```

The far end is still the **Valeriepieris circle** — centred 21.00°N 100.29°E with a 3,437 km
radius, containing 50% of the world's population. **Wat Ket sits 279.98 km from that centre, 8.15%
of the radius**, and `aeqd.test.ts` still pins it. That number is unchanged and is not up for
renegotiation; what changed is how a visitor travels between the scales, not what the scales say.

### Why the rail went

A 3,437 km azimuthal-equidistant population raster and an 8 km building diorama are **different
kinds of rendering, not different zoom levels**. One is a data-visualisation on a projection chosen
so a claim can be checked; the other is a physical model of a place. Putting them on one continuous
gesture asserted they were the same kind of thing seen from different distances.

The cost of that assertion was a pile of special cases in `registers.ts` — a crossfade band,
`districtTransform`, `regionScale`, `railed`, `hold`, `holdFrom` — whose only job was to stop a
2,500:1 scale gap from tearing. The clearest tell was `RELIEF_HOLD_OUT`, which existed solely
because zooming out shrank the district onto the circle before the mountains were in frame.

Splitting the views was mostly **deletion**. Keeping two frames from tearing, guaranteeing no black
frame inside the handover and holding the district while the backdrop arrived all stopped being
problems rather than getting solved differently.

### How discreteness is enforced

`views.ts`, and it is one function. Each view has a fit zoom and a range expressed as multiples of
it; `clampZoom` holds the camera inside that range. **Nothing in that module returns a view id from
a zoom** — there is no zoom in any view that selects another, and the only way out is the switcher.

| View | Frame | Unit | Fit | Range |
|---|---|---|---|---|
| CIRCLE | `region` | **kilometre** | the circle | 0.35× out, 4× in |
| VALLEY | `district` | metre | ±60,000 | 0.9× out, 8× in |
| CITY | `district` | metre | the scene rectangle | 0.5× out, 40× in |

The city's 40 is `DEFAULT_BLOCK_IN`, carried over rather than re-chosen: it is the
district-to-doorstep ratio the piece has been built around since 16 Sep, and a test holds it there.

The 2,500:1 gap still never enters the scene graph, for the same reason as before: the frames are
**siblings, never nested**, the region group carries a scale in stage-units-per-kilometre, and the
region is authored in kilometres. **One orthographic camera still serves all three** — an ortho
camera's `zoom` is pixels per stage unit, so a scaled group is mathematically identical to a second
camera, and it keeps `MapControls`, depth, raycasting and `onPointerMissed` bound to one thing. Do
not add a second camera.

### A view builds on first visit, and is kept

Discrete views mean never paying for a world nobody is looking at. Each view builds its geometry
the first time it is opened and holds it afterwards, so switching back is instant. Opening straight
onto the valley with `?view=valley` does not extrude the city's 7,588 buildings at all.

Measured per view in a foreground browser on the static export:

| View | Triangles | Draw calls |
|---|---|---|
| The circle | 68 | 3 |
| The valley | 130,052 | 2 |
| Wat Ket | 157,532 | 8 |

Under the rail, the circle carried the whole district with it through the handover. The worst case
is now one view rather than two plus a backdrop.

### The valley view

120 × 120 km of Copernicus DEM around the scene origin, from the same generator as the city's
relief backdrop under `fetch-relief.py --field valley`. Doi Inthanon at 2,565 m down to the Ping,
with 387 named waterways and seven towns from `fetch-valley.ts`.

**Nothing is flattened and nothing is feathered.** That is the whole difference between `valley.ts`
and `relief.ts`: the backdrop flattens its field under the scene rectangle so the city can never be
sitting on a sampled surface, and here the topography *is* the subject. They are two modules rather
than one function with a flag, because the flattening is what keeps "buildings are never draped" a
checkable invariant, and a function that sometimes flattens is one somebody will eventually call
the wrong way.

Heights are **exaggerated four times, and the caption says so**. The basin holds 1.4 km of relief
across 120 km — a little over 1% — and at the fixed isometric pitch a true-scale render of it is a
flat sheet. Four is what physical relief models have used for a century. A piece that argues from
geography cannot quietly distort geography.

The Copernicus DEM is a **surface** model, so it carries buildings and tree canopy as 10–40 m of
per-cell jitter. The field is box-blurred once, in one place, before anything else touches it.

**Drawn as a hillshade**, chosen 21 Sep by rendering three styles offline and looking at them. One
warm near-white — the same Warm White the city's ground plane uses, so the valley and the diorama
are the same material at different scales — with form entirely from a north-west light. A
hypsometric `gradient` and a `terraced` contour-band style are both still there behind `?relief=`.
Terracing is the one the project's own rules argued for, being exactly what the buildings do, and
it lost anyway: at 469 m between vertices a terrace is often one cell wide, so treads and risers
alternate per cell and the mountains read as confetti. The argument is right; the resolution is
wrong.

**`terrain` is still `null` and `validateScene` still asserts it.** The valley is a view with its
own field, in its own world, and nothing in the baseline goes near it. This is the closest the
project has come to that non-goal, and the distance is kept deliberately — nothing in `valley.ts`
takes a baseline object as an argument.

### What is still derived, never controlled

- **Nothing animates by itself.** `frameloop="demand"` is untouched. Switching views is a cut, not
  a tween: a tween between views would be the rail coming back through the door.
- **Deep links.** `?view=` and `?relief=` open a given view and topography style. Not a debug
  hatch — the exhibition machine opens on a fixed view, and a QR code that lands somebody on the
  valley rather than on the circle is a real thing to want.

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

**The first Tier 2 generator is the bridge** (19 Sep 2026). Roads live in the ground texture and
water is painted over them, so every Ping crossing vanished at the bank. `src/engine/bridges.ts`
reads the roads that carry OSM's `bridge` flag, keeps those that a 5 m sample finds over water,
and builds a deck at road width raised by class (7.5 m for a major road, 4.5 m for a footbridge),
a ramp to ground beyond each abutment, low parapets, and piers at a class spacing wherever the
span is over water. 48 bridges, ~3,600 triangles, one unlit mesh, nothing placed by hand — and
the same code builds the next city's bridges. Flyovers over roads are deliberately not built:
a viaduct with nothing under it is a different generator. See `plans/2026-09-19_bridges.plan.md`.

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
