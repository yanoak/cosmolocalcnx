# cosmolocalcnx — Claude Code Context

## What this is

A 3D isometric web app showing **Wat Ket district, Chiang Mai, in 2045**. Visitors switch between
two or three arguable futures for the neighbourhood and tap things to read about them.

The present is never shown. Each future is built as a diff over an OpenStreetMap baseline of the
real neighbourhood — so the streets, the river and most of the building stock are the ones Wat Ket
actually has — but that baseline is a substrate, not a view. There is no "today" state to switch
to. Several futures invite argument; a future measured against the present invites a verdict on
whether it is an improvement, which is a different and smaller question.

Built for the **Nomad Futures Lab** exhibition, one strand of Cosmo Local CNX September 2026.
Programme context — the people, the venue, the audience — is kept **local only at
`docs/programme-context.md` and is deliberately not committed**, because it names individuals
and links private documents. Ask Yan for it.

The engine is deliberately separated from the content: it is a general tool for generating an
editable speculative city from a boundary polygon, and Wat Ket is its first scene.

## Two deadlines

| When | What |
|---|---|
| **24 Sep 2026** | Exhibition opens, Pantip Plaza, Chiang Mai. Panels 25th, workshops 26–27th. |
| **December 2026** | Chiang Mai Design Week — the *engine* shows as a more complete product, not just this one scene. |

The September build is scaffolding. Expect to rewrite the renderer and the editor UI before
December. What must survive is the scene schema, the asset library, and the authored content —
see `docs/roadmap.md`.

## Three views are the spine

Rewritten 21 Sep 2026. **Three discrete views**, moved between deliberately. Zoom and pan stay
inside whichever one is open and can never reach another:

```
 ┌── CIRCLE ────────┐   ┌── VALLEY ────────┐   ┌── CITY ──────────┐
 │ AEQD, kilometres │ ⇄ │ DEM, 120 km      │ ⇄ │ diorama, 8 km    │
 │ 3,437 km radius  │   │ 2,565 m relief   │   │ district ⇄ block │
 │ a claim          │   │ a landscape      │   │ a place          │
 └──────────────────┘   └──────────────────┘   └──────────────────┘
```

The outermost is the **Valeriepieris circle** — 21.00°N 100.29°E, radius 3,437 km, containing half
of humanity. **Wat Ket sits 279.98 km from its centre, 8.15% of the radius.** That number is the
piece's argument made geographically, `src/engine/__tests__/aeqd.test.ts` pins it, and it is not up
for renegotiation.

**This replaced one rail**, which from 16 to 21 Sep ran the circle, the district and the block
through a single gesture. It went because a 3,437 km population raster and an 8 km building diorama
are *different kinds of rendering, not different zoom levels* — and the pretence that they were not
cost a crossfade band, a frame transform, a stage scale absorbing 2,500:1, and `RELIEF_HOLD_OUT`,
which existed only because zooming out shrank the district onto the circle before the mountains
arrived. Splitting them was mostly deletion. `views.ts` enforces it, and **no function there returns
a view from a zoom** — the only way out of a view is the switcher.

The middle view is new: the basin Chiang Mai grew in, drawn as a **hillshade** — a plaster relief
model in the city's own Warm White, form from a north-west light, heights exaggerated four times
with the caption saying so. A hypsometric gradient and a terraced contour style are both still
behind `?relief=`; terracing is what the project's own rules argued for and it lost on resolution.
See "Three views" in `docs/architecture.md`.

**A view builds on first visit and is kept.** Never pay for a world nobody is looking at.

## Three delivery surfaces

This is the biggest constraint in the project. It is not one kiosk:

| Surface | What it forces |
|---|---|
| **Visitors' own phones via QR** | Hard performance budget. Must be on a public URL. Touch-first. |
| **Projection / large screen** | Possibly non-standard aspect ratio. Likely attract-loop or staff-driven. |
| **Laptop + mouse** | The only place hover states are safe. Needs an offline fallback. |

Consequences: touch is the primary input and hover is decoration; the perf budget in
`docs/architecture.md` is a requirement, not an optimisation; the laptop/projection machine runs
a local static export so a venue wifi failure cannot take the installation down.

**The phone budget was repaid on 21 Sep 2026.** The scene still covers 5.8 × 8.1 km and 68,704
buildings, but the viewer no longer draws them all: everything beyond 1,250 m of the origin is a
pre-rendered raster hung on two planes, and the relief backdrop is decimated. Measured on the
static export — **157,532 triangles in 8 draw calls, 1.16 MB gzipped**, against ~1.13M and 4.44 MB
before. Triangles are ~5% over the 150k ceiling and the remainder is not buildings.

That raster is **exact rather than approximate**, and the reason is load-bearing: the camera is
orthographic and never rotates, so zoom is a 2D scale and pan a 2D translation. **Enabling orbit
would silently turn it into a lie.** See "Level of detail" in `docs/architecture.md` and
`plans/2026-09-21_backdrop-lod.plan.md`. The device test on a cheap Android is still outstanding.

## Stack (decided — do not relitigate)

- **Next.js App Router + TypeScript**, deployed on **Vercel**. Public URL matters because of the QR.
- **React Three Fiber + drei** for the 3D. This is three.js with React ergonomics, not an alternative to it.
- **Not Godot, not Unity.** Considered and rejected: large wasm payloads, flaky iOS Safari, and the
  content is text panels over a 3D scene — which is DOM's job, not a game engine's.
- Viewer at `/`, editor at `/admin`. Shared renderer components in `src/engine/`.
- **`/print` is internal and is not on the public URL.** An STL exporter for the exhibition's
  3D print, added 22 Sep 2026. `src/app/print/` is listed in `.vercelignore`, so the Vercel
  build never receives the directory and the deployed export has no such page and no chunk —
  it works under `npm run dev` and in a locally built export, which is the exhibition laptop.
  **That exclusion is the only gate there is.** `output: 'export'` means no server, so no auth
  is possible; an `NEXT_PUBLIC_*` flag would ship the page and its 4 MB scene import anyway and
  is one line from being flipped by anyone reading the bundle. Deleting that line publishes the
  tool. See `plans/2026-09-22_stl-print-export.plan.md`.

## The one architectural rule

**The scene is a document. Edits are a diff over an immutable OSM baseline. The editor is the
viewer plus a layer.**

Everything good falls out of this: re-importing OSM never destroys placement work, a second 2045
scenario is nearly free, and undo is popping an op stack. Full schema in `docs/architecture.md`.

If you ever find yourself building a second renderer for the editor, stop — that is the failure mode.

## Non-goals for September

Do not build these before 24 Sep, however reasonable they sound in isolation:

- **No elevation under the city.** Wat Ket is flat river plain and the DEMs are 30 m. Leave
  `terrain` in the schema; never implement it. **The land *around* the scene is a different
  thing and is drawn since 19 Sep 2026** — `relief`, a coarse Copernicus DEM backdrop that
  `ReliefBackdrop.tsx` flattens under the scene rectangle, so the mountains rise around the flat city
  when you zoom out. See "Relief is a backdrop, terrain stays null" in `docs/architecture.md`
  and `plans/2026-09-19_relief-backdrop.plan.md`.

  **Since 21 Sep there is also a whole topographic VIEW** — the valley, 120 km of DEM drawn as a
  hillshade with nothing flattened. **This is now the non-goal most at risk**, because a mountain
  range one click from the diorama is exactly the pressure that puts the diorama on a surface. It
  does not. The valley is its own view with its own field, `terrain` is still `null`,
  `validateScene` still asserts it, and nothing in `valley.ts` takes a baseline object as an
  argument — that last one is the checkable part. `relief.ts` flattens and `valley.ts` does not,
  and they are two modules rather than one function with a flag precisely so nobody can call the
  flattening off by accident.

- **No terrain under the print either, and no second renderer to make one.** `src/engine/print.ts` reads the same document the GPU does and shares its
  winding normalisation and its triangulator; the plate is flat because Wat Ket is flat, and
  nothing in it takes a relief or elevation field. Its own conventions are millimetres and +Z
  up with **no rotation at all**, against the renderer's −Z-is-north — two conventions, each
  serving its own consumer, and both written down where they are used.

  Two things it learned that generalise. **Walls raised from a clipped RING are not the walls
  its triangulation implies**: `clipRingToConvex` joins a shape it cut in two with a zero-width
  neck, earcut drops the neck, and `ExtrudeGeometry` then leaves open edges — so `solid()`
  raises walls on the cap's own boundary and the test file checks edge pairing on the shapes
  that cause it. And **HTML5 `step` validation is `(value - min) % step` in binary floating
  point**, so a 2 mm plate against `min=0.6 step=0.2` is a silent "step mismatch" that blocks
  form submission with no error anywhere. Both cost an hour each.

- **No free-roam avatar.** Walk-around characters fail at public exhibitions — people get lost, the
  camera clips into geometry, and WASD is meaningless on a phone. This is a fixed isometric diorama
  you inspect, not a world you traverse. If a character is wanted later: click-to-move, fixed camera.
- **No auth, no uploads, no database, no admin panel.** Week one's editor is localhost-only and
  copies scene JSON to the clipboard, which gets committed to the repo. This survived the workshop
  question: participant work on 26–27 Sep is exported, merged and redeployed overnight rather than
  written live, so the exhibition still accumulates without a save endpoint. Decided 12 Sep 2026.
- **No time slider.** Cut 12 Sep 2026 and still cut. Edits carry no date, their order means
  nothing temporally, and no scene state is ever partially applied. `validateScene` enforces this
  at the data level via `FORBIDDEN_EDIT_FIELDS`.

  **The "today" view was cut with it and partly reinstated on 16 Sep 2026 as a one-way on-ramp.**
  The piece opens on the circle, descends to Wat Ket as it is now, and hands over to the 2045
  futures. `baseline` alone is therefore visitor-*reachable* but never visitor-*selectable* —
  it is the room you walk through, not a door you can open. The comparison control still holds
  only futures, so the piece asks "which of these?" rather than "is this an improvement?".
  Returning to 2026 happens only on an idle reset. See "Registers" in `docs/architecture.md`.

- **No extruded population columns before 24 Sep.** The region register renders flat. The
  committed field is already shaped for the December extrusion — 512 cells, and population is
  additive so 256 and 128 are exact block-sums off it.

## Working conventions

Solo development with LLMs, over three months. The failure mode is architectural drift, not bad code.

- **Keep a debug overlay from day one** — axes, bounding boxes, wireframe toggle, a 1 m reference
  cube. Twenty lines, and it converts "looks wrong" into "is 100× too big". 3D bugs do not produce
  stack traces, which is where LLM-assisted work is weakest.
- **Push logic into pure functions and unit-test them** — projection, extrusion, transform
  normalization, snapping, the edit-op reducer. These have numeric outputs and are testable; the
  visual layer is not.
- **Keep the engine small and boring.** Resist abstraction until the second neighbourhood demands it.
- **Node lives under nvm and is not on the default PATH** that tooling sees. Prefix node/npm
  commands, or nothing resolves:

  ```sh
  export PATH="/Users/yan/.nvm/versions/node/v22.18.0/bin:$PATH"
  ```
- **Plans and the work diary** — see the Project management section below.
- **This is a public repo on GitHub.** Everything committed is world-readable: no keys, no tokens,
  no venue or participant contact details. Every `.env*` file is gitignored except `.env.example`,
  which documents variable names with empty values.
- **Never name residency participants or collaborators in committed files**, and never link private
  Google Docs or Notion pages. That material lives in `docs/programme-context.md`, which is
  gitignored and local only. Do not commit it and do not quote its contents into files that are
  committed — refer to "the local programme notes" instead. This rule exists because the file was
  committed on 12 Sep 2026 and had to be pulled back out of public history.
- **A pre-commit hook enforces the rule above**, because the rule on its own did not — it was
  broken within the hour by the session that wrote it. `scripts/hooks/pre-commit` blocks staged
  content matching a name or private-link pattern, and blocks `docs/programme-context.md` outright.
  Install it once per clone:

  ```sh
  git config core.hooksPath scripts/hooks
  ```

  The name patterns live in `.local/denylist.txt`, which is gitignored — a committed list of
  people's names would defeat the purpose. Without it the hook still catches private links but
  warns that it cannot catch names; ask Yan for a copy. `--no-verify` bypasses it, which should be
  rare enough to feel wrong.
- **Nine licensed things, not one** — code MIT, OSM-derived `baseline` data ODbL,
  satellite-derived footprints ODbL via Overture (crediting Google and Microsoft), observed
  building heights CC BY 4.0 (Google Open Buildings 2.5D Temporal), the Copernicus DEM relief
  (free with its fixed notice), authored 2045 content CC BY-SA 4.0, the HDX tambon boundary
  CC BY-IGO, the GHS-POP population field CC BY 4.0, and GeoNames city names CC BY 4.0.
  **Seven of them require visible credit** and all seven live in the viewer's footer. See the table in the README. The root `LICENSE` file stays pure MIT so GitHub
  detects it; the split is stated in the README. Never commit an asset that cannot be
  redistributed — fetch it with a script instead.
- **Assets live in the repo, not Git LFS.** The optimised `.glb`/`.gltf` and their textures are
  committed; authoring sources (`.blend`, `.fbx`, `.psd`) are gitignored. LFS was considered and
  rejected: it complicates Vercel builds, is metered on public repos, and would undermine the
  offline static export the exhibition machine depends on. The perf budget is the size discipline —
  anything too big for git was already too big for a phone.
- **The Overpass response cache is gitignored; the generated scene document is committed.** Same
  reason as everything else here: the exhibition must not depend on Overpass being up. The same
  goes for the 377 MB HDX boundary archive: `scripts/extract-boundary.py` distils it to one
  committed polygon and the archive stays out of the repo.
- **The name hook has one known false positive**, in the city file
  `src/scenes/regions/*.cities.json` that `scripts/build-region.py` writes. Exactly one of its
  2,220 GeoNames entries — a district of Bangkok — contains a token that is both a common Thai
  given name and a common Thai place-name element, so a denylist pattern matches it and no
  anchoring can fix it. Regenerating that file needs `--no-verify` with the reason in the commit
  message; check the link patterns separately first. **Do not write the offending name into any
  committed file**, including this one, or every future commit that touches it is blocked too.

- **Regenerating data is `npm run fetch:buildings`, `npm run fetch:osm`, `npm run fetch:relief`,
  `npm run fetch:elevation` and `npm run build:region`.** None is needed to run the app. A re-run
  against the same cached source must produce a **byte-identical** output — if it does not, the
  height synthesis, the raster sampling or the population scatter has stopped being
  deterministic, and every downstream placement judgement is unstable.
- **Buildings come from Overture plus OSM, heights from a satellite raster.** Decided 19 Sep 2026:
  OSM held one Wat Ket building in seven. `scripts/fetch-buildings.py` pulls Overture's conflated
  footprints (OSM + Google + Microsoft) and samples the Google Open Buildings 2.5D Temporal
  height raster; `src/engine/satellite.ts` merges them. OSM buildings keep `osm/way/…` ids, the
  rest are `overture/<id>`. Height chain: tag → observed → synthesis. See
  `plans/2026-09-19_satellite-footprints.plan.md`.
- **The scene is the rectangle, not the tambon, since 19 Sep 2026.** `--clip tambon` restores the
  intersection; the tambon polygon stays committed as the boundary credit. Changing the extent is
  three commands: `fetch:osm --refresh --osm-only --extent …`, `fetch:buildings --refresh`,
  `fetch:osm`.
- Update this file when a decision is made, so the next session inherits it. The diary is the trail;
  this file and `docs/` are the source of truth.

## Project management

Plans live in `plans/`, the daily work diary in `work-diary/`. Both are committed alongside
the code they describe, never left untracked.

- **Substantial work gets a plan before implementation**, at
  `plans/YYYY-MM-DD_short-name.plan.md` — the date is the day the plan was started. Copy
  `plans/_template.plan.md` and keep the frontmatter `status` current. The template's four
  conditional sections are **required when they apply**: UI mockups (ASCII) for visible UI,
  Keyboard interaction for anything clickable, Test list (TDD) for any logic, Verification for
  anything users perceive. Delete only the ones that genuinely do not apply. See
  `plans/README.md`.
- **Never delete an abandoned plan** — the reason something was dropped is the part worth keeping.
  Set `status: abandoned` and write the Outcome.
- **Commits that advance a plan carry a `Plan:` trailer** naming that plan's slug, e.g.
  `Plan: 2026-09-13_scene-schema-greybox`. This is the only link between a commit and the thinking
  behind it, and the diary's commit table is generated from it — so it cannot drift.

  **No blank line between `Plan:` and any other trailer.** Git recognises only the *last*
  contiguous `Key: value` block as trailers, so a blank line before `Co-Authored-By:` leaves
  `Plan:` present, correct and invisible to `%(trailers)` — the commit looks right and silently
  lands under "Unplanned". This ate eleven commits on 16 Sep 2026 before anyone noticed. Check with
  `git log -1 --pretty=format:'%(trailers:key=Plan,valueonly)'`.
- **Keep a daily work diary.** Run `./scripts/work-diary.py` at the start of each day: it creates
  `work-diary/YYYY-MM-DD.md` and regenerates that day's plans and commits. Write the tasks section
  first thing and do not rewrite it later; keep the work log as you go; note decisions and
  carry-forward at the end. See `work-diary/README.md`.
- **Mark things done immediately** — `[x]` the plan task as it lands, strike through a fixed ad hoc
  todo and note the resolution, move the plan's `status` to `done` and write its Outcome only once
  its Verification section actually passed.

## Docs

- `docs/programme-context.md` — the exhibition, the people, the audience. **Local only, never
  committed** — see the public-repo note in Working conventions.
- `docs/architecture.md` — scene schema, OSM pipeline, perf budget, asset strategy
- `docs/design-system.md` — the Cosmo Local CNX brand palette, role tokens, unlit materials,
  IBM Plex Sans Thai. Replaced the 1967 PROGRESS palette on 16 Sep 2026 because the exhibition
  has print and signage the screen has to match.
- `docs/roadmap.md` — the week-one cut line and the path to December
- `plans/` — one file per piece of substantial work: goal, approach, tasks, outcome
- `work-diary/` — the daily record: plan of attack, what shipped, plans and their commits, decisions

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
