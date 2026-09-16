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
2. **Project** lat/lon to local metres against `origin`. A local tangent-plane approximation is
   correct at neighbourhood scale — do not reach for full UTM.
3. **Extrude.** three.js `ExtrudeGeometry` takes a `Shape` built straight from the footprint. Height
   from the `height` tag, else `building:levels × 3.2`, else a per-type default. That is the whole
   building generator.

Run this as a **script that writes `baseline` into the scene document**, not as a live fetch in the
viewer. The exhibition must not depend on Overpass being up.

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

**The tambon is not the scene.** It is 6.85 km² — above the hard limit below — and it is an
administrative unit rather than a neighbourhood, running 3 km south of the origin past anything a
resident would call Wat Ket. So `scripts/fetch-osm.ts` intersects it with a rectangular working
extent, and *that* is what lands in the document's `boundary`. The extent is the editorial lever
and it is one constant in one file; the tambon polygon beside it stays authoritative and untouched.

Chosen 12 Sep 2026: 1.50 × 2.70 km, 2.98 km², 1,182 buildings.

### Limits

- Warn above ~1 km², hard-reject above ~4 km², and cap building count. Overpass will time out or
  return something unrenderable long before any real limit. **The import enforces both and refuses
  to write** rather than leaving it to be discovered in the browser.
- **An extruded footprint is far cheaper than a mesh.** Measured 12 Sep 2026: about **4v − 4
  triangles for v ring vertices**, which is ~17 per real OSM building — not the 50–100 a mesh
  costs. All 1,182 buildings come to ~22k triangles against a ~100k baseline ceiling. Geometry is
  therefore *not* the constraint on how big the boundary can be; area and legibility are. Do not
  shrink the scene to save triangles without measuring first.
- **Two attributions, both required to be visible**, and both are in the viewer's footer: "©
  OpenStreetMap contributors" for ODbL, and OCHA for the CC BY-IGO boundary. A few lines of JSX,
  easy to forget until someone asks.

### Height is synthesised, not imported

96% of Wat Ket's buildings carry no height information at all — one `height` tag and 56
`building:levels` across the whole scene. So `src/engine/synth.ts` is not a fallback, it is the
primary source, and it authors almost the entire skyline.

Two properties matter, and they are the whole design of that module:

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

These are a budget, not a measurement. Roadmap item 1 ends by loading a representative scene on a
cheap Android, because the realistic failure on a low-end phone is load time and thermal
throttling rather than WebGL support — and that distinction decides whether a second renderer is
ever worth building. See *Device reach* in `docs/roadmap.md`.

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

## Registers — semantic zoom

Added 16 Sep 2026. The scene has **three registers** the visitor moves between with one gesture:

```
 t=0 ──────────────────────────────────────────────── t=1
 REGION            DISTRICT                    BLOCK
 the circle        Wat Ket                     a shophouse
 4.10 bn people    2.98 km²                    one doorstep
```

The far end is the **Valeriepieris circle** — centred 21.00°N 100.29°E with a 3,437 km radius, it
contains 50% of the world's population. **Wat Ket sits 279.98 km from that centre, 8.15% of the
radius.** That is the cosmolocal argument made geographically rather than in copy, and it only
lands if the visitor can travel between the scales instead of reading about it.

### Three registers, two coordinate frames

| Register | Frame | Unit | Magnitude |
|---|---|---|---|
| REGION | `region` | **kilometre** | ±3,437 |
| DISTRICT | `district` | metre | ±1,600 |
| BLOCK | `district` | metre | ±1,600 |

DISTRICT and BLOCK are the same geometry in the same frame and differ only in what is emphasised,
so there is exactly **one handover to build, not two**. That asymmetry is most of why this was
affordable.

The 2,500:1 scale gap never enters the scene graph, because the two frames are **siblings, never
nested**: the region group carries a scale in stage-units-per-kilometre and the district sits
beside it. float32 is a non-issue — `3437.0` in kilometres resolves finer than `1600.0` in metres.

**One orthographic camera serves both.** An ortho camera's `zoom` is pixels per stage unit, so a
group with a scale is mathematically identical to a second camera, and it keeps `MapControls`,
depth, raycasting and `onPointerMissed` all bound to one thing. Do not add a second camera; drei's
`makeDefault` binds to one anyway.

### The rail is derived, never controlled

Everything comes from one scalar `t ∈ [0,1]`, computed from live camera zoom in `registers.ts`.
Two consequences worth stating:

- **The crossfade needs no animation clock.** Every pinch already produces a frame, so
  `frameloop="demand"` is untouched and the handover costs nothing when nobody is touching the
  screen. Only jumps the visitor did not make with their fingers — a register chip, the on-ramp —
  are tweened, on a self-terminating rAF outside R3F.
- **`districtTransform(0)` is the exact identity.** Whenever no handover is happening, the render
  is bit-for-bit what it was before registers existed. That is a test, and it is what made this
  safe to ship in pieces.

`minZoom` changed meaning: it was "out to twice the district" and is now the whole circle — or
still twice the district for a scene with no `region`, which is what a second neighbourhood has
until someone runs `npm run build:region`.

### The population field is not terrain

`terrain` stays `null`, permanently, and `validateScene` keeps asserting it. The region field is
**people per cell in a different coordinate frame**, committed as a two-channel PNG. The
resemblance to a heightmap is exactly how elevation would creep back in, so the distinction is
laboured in the script, the module and the sidecar.

September renders it **flat**. December extrudes it into columns, and needs no new data to do so:
the grid is 512 cells and population is additive, so 256 and 128 are exact block-sums off it. Cell
size is a runtime decision forever.

Two encoding decisions that are not obvious:

- **Two 8-bit channels, not a 16-bit PNG.** `createImageBitmap` and `getImageData` both hand back
  8-bit clamped RGBA, so a browser silently truncates the low byte. A 16-bit file would pass a unit
  test in node and be wrong only in production.
- **Cube-root compression.** Population spans six orders of magnitude per cell; linear 16-bit
  erases inhabited Himalayan and Pacific cells to zero, which in a piece about where people are is
  a legibility loss rather than a rounding error.

Blue is reserved for a land mask and currently unused — at this density the population alone traces
India, eastern China, Java and Korea legibly.

### The world outside the circle

**Two fields, not one.** A second, larger plane sits under the first in the same projection: 12,000
km at 1024 cells (23 km), against the circle's 3,437 km at 512 cells (13 km).

One grid cannot serve both. A single raster covering that reach at 13 km would be enormous; one
coarse enough to ship would throw away the detail the hero view depends on. Each field is at the
resolution its job needs, and the seam falls exactly under the rim stroke drawn there anyway.

**This is not decoration — it is what makes the claim falsifiable.** A circle that fills the frame
is a picture of Asia. `REGION_MARGIN` (1.7) frames the register on rather more than the circle, so
a visitor can weigh "half of humanity lives inside this circle" against a visible outside. Pulling
back further reaches the whole 12,000 km field; that changes no register, because `t` is already
clamped at 0 and the crossfade is long finished.

The outside uses the same ramp blended toward the ground rather than its own colours — it is the
same quantity measured the same way, and separate colours would imply otherwise.

#### Why the world stops at 12,000 km

Azimuthal equidistant preserves distance from the centre, not area, and the area error grows with
distance:

| Extent | Area inflation | Share of the 4.10 bn outside |
|---|---|---|
| The circle (3,437 km) | **1.02×** — effectively true | — |
| 10,000 km | 1.23× | 64% |
| **12,000 km — chosen** | **1.36×** | **75%** |
| 20,015 km (the antipode) | 2.47× | 100% |

Inside the circle AEQD is area-true to 2%, so the hero view is honest. A full-world field inflates
the far ring by 2.47×, and the bias runs the wrong way: the same people spread over inflated land
make the outside look emptier than it is, which **overstates the circle's claim**. 12,000 km keeps
the error at 1.36× and cuts off before the rim smearing, at the cost of the Americas and a quarter
of the outside population.

**Web Mercator was considered and is disqualified**, notwithstanding that pudding.cool's Population
Mountains used it via Mapbox on the same GHSL data. They rendered individual cities at high zoom,
where Mercator distortion is nil. Here, a 3,437 km geodesic circle plots in Mercator as an egg —
and the claim depends on it being a circle. Area inflation reaching 8.5× at Greenland's latitude is
the second, independent disqualification for a piece about where people are.

**Lambert azimuthal equal-area was the real alternative** and was rejected on balance. Being
azimuthal, it would keep the circle a true circle *and* make areas exact. But distances stop being
linear, so the distance rings compress and "Karachi, 3,433 km" loses its visual meaning — and the
printed A0 in the same room is azimuthal equidistant. The screen and the wall disagreeing in front
of a visitor is worse than 1.36×.

**The arithmetic, which is a test:**

| | |
|---|---|
| Inside the circle | 4,090,724,518 — **49.94%** of the world |
| Within the 12,000 km field | 7,141,630,214 |
| True world total (GHS-POP E2025) | 8,191,966,468 |

The full-world scatter matched GHS-POP's stated 8.192 billion to five significant figures before
the cap was applied, from an independent pass over 346 tiles. Note the honest wrinkle: on this
dataset the original 2013 claim is a **dead heat, marginally the other way** — very slightly more
people live outside than in. The caption says "4.09 billion inside, 4.10 billion everywhere else"
rather than rounding in the circle's favour.

### Cities

`build-region.py` also writes every city over 100,000 inside the circle. A spatially-separated
selection carries a permanent label; pointing at a cell names what is in it.

**Label selection is not "the biggest N".** The eight most populous cities in this circle are seven
Chinese ones and Ho Chi Minh City, which would stack eight labels in one corner and leave India,
Indonesia and Japan unnamed. Greedy-by-population subject to a minimum separation fixes it, and
that separation is **tuned**: at 18% of the radius the rule excluded Delhi, because Lahore is
410 km away with a slightly larger GeoNames figure. The expected names are pinned in a test.

The unit is a **cell, not a city**, because a 13 km cell routinely holds two — Dhaka and
Narayanganj, Shenzhen and Dongguan — and naming only the largest misreports the patch.

Our rim distances agree with the printed A0 to within 13 km on every city it names, and to within
1 km on four of them. That agreement is a test.

### Futures only, and the 2026 on-ramp

Reversed on 16 Sep 2026, carefully. The piece now **opens on the circle, descends to Wat Ket as it
is now, and hands over to the 2045 futures.**

This is *not* the time slider cut on 12 Sep, and the difference is the whole point:

| Cut on 12 Sep | The on-ramp |
|---|---|
| Continuous scrub 2026→2045 | Two discrete states, one one-way transition |
| Edits carry dates | Edits carry no date. `era: 'now'` is zero edits applied |
| Scene partially applied at intermediate positions | Never. Both states fully resolved and merged ahead of time |
| "Today" as a toggle state inviting a verdict | 2026 is passed *through*, once |

**`FORBIDDEN_EDIT_FIELDS` is untouched** and every test around it still passes. Returning to 2026
happens only on an idle reset, never by zooming out — that would make the rail a scrub, which *is*
the cut feature.

The carve-out to the "futures only" rule, stated precisely: **`baseline` alone is now
visitor-reachable but never visitor-selectable.** It is the room you walk through, not a door you
can open. The comparison control still holds only futures, so the piece keeps asking "which of
these?" rather than "is this an improvement?".

The on-ramp and the attract loop (roadmap item 6) are the same machinery, which is most of why this
fit in the week.

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
