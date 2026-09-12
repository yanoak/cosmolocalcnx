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
See `docs/programme-context.md` for who that is and why it exists.

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

## Stack (decided — do not relitigate)

- **Next.js App Router + TypeScript**, deployed on **Vercel**. Public URL matters because of the QR.
- **React Three Fiber + drei** for the 3D. This is three.js with React ergonomics, not an alternative to it.
- **Not Godot, not Unity.** Considered and rejected: large wasm payloads, flaky iOS Safari, and the
  content is text panels over a 3D scene — which is DOM's job, not a game engine's.
- Viewer at `/`, editor at `/admin`. Shared renderer components in `src/engine/`.

## The one architectural rule

**The scene is a document. Edits are a diff over an immutable OSM baseline. The editor is the
viewer plus a layer.**

Everything good falls out of this: re-importing OSM never destroys placement work, a second 2045
scenario is nearly free, and undo is popping an op stack. Full schema in `docs/architecture.md`.

If you ever find yourself building a second renderer for the editor, stop — that is the failure mode.

## Non-goals for September

Do not build these before 24 Sep, however reasonable they sound in isolation:

- **No elevation / terrain.** Wat Ket is flat river plain and SRTM is 30 m resolution. Leave
  `terrain` in the schema; never implement it.
- **No free-roam avatar.** Walk-around characters fail at public exhibitions — people get lost, the
  camera clips into geometry, and WASD is meaningless on a phone. This is a fixed isometric diorama
  you inspect, not a world you traverse. If a character is wanted later: click-to-move, fixed camera.
- **No auth, no uploads, no database, no admin panel.** Week one's editor is localhost-only and
  copies scene JSON to the clipboard, which gets committed to the repo.
- **No time slider, and no "today" view.** Cut 12 Sep 2026. The toggle switches between 2045
  futures only; the present is never a visitor-facing state. Edits therefore carry no date and
  their order means nothing temporally, and no scene state is ever partially applied. The
  `baseline` stays in the schema as the substrate every scenario diffs against — rendering it
  alone is a development view, never something a visitor can reach. See "Futures only" in
  `docs/architecture.md`.

## Working conventions

Solo development with LLMs, over three months. The failure mode is architectural drift, not bad code.

- **Keep a debug overlay from day one** — axes, bounding boxes, wireframe toggle, a 1 m reference
  cube. Twenty lines, and it converts "looks wrong" into "is 100× too big". 3D bugs do not produce
  stack traces, which is where LLM-assisted work is weakest.
- **Push logic into pure functions and unit-test them** — projection, extrusion, transform
  normalization, snapping, the edit-op reducer. These have numeric outputs and are testable; the
  visual layer is not.
- **Keep the engine small and boring.** Resist abstraction until the second neighbourhood demands it.
- **Plans and the work diary** — see the Project management section below.
- **This is a public repo on GitHub.** Everything committed is world-readable: no keys, no tokens,
  no venue or participant contact details. Every `.env*` file is gitignored except `.env.example`,
  which documents variable names with empty values.
- **Three licences, not one** — code MIT, OSM-derived `baseline` data ODbL, authored 2045 content
  CC BY-SA 4.0. See the table in the README. The root `LICENSE` file stays pure MIT so GitHub
  detects it; the split is stated in the README. Never commit an asset that cannot be
  redistributed — fetch it with a script instead.
- **Assets live in the repo, not Git LFS.** The optimised `.glb`/`.gltf` and their textures are
  committed; authoring sources (`.blend`, `.fbx`, `.psd`) are gitignored. LFS was considered and
  rejected: it complicates Vercel builds, is metered on public repos, and would undermine the
  offline static export the exhibition machine depends on. The perf budget is the size discipline —
  anything too big for git was already too big for a phone.
- **The Overpass response cache is gitignored; the generated scene document is committed.** Same
  reason as everything else here: the exhibition must not depend on Overpass being up.
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
- **Keep a daily work diary.** Run `./scripts/work-diary.py` at the start of each day: it creates
  `work-diary/YYYY-MM-DD.md` and regenerates that day's plans and commits. Write the tasks section
  first thing and do not rewrite it later; keep the work log as you go; note decisions and
  carry-forward at the end. See `work-diary/README.md`.
- **Mark things done immediately** — `[x]` the plan task as it lands, strike through a fixed ad hoc
  todo and note the resolution, move the plan's `status` to `done` and write its Outcome only once
  its Verification section actually passed.

## Docs

- `docs/programme-context.md` — the exhibition, the people, the audience
- `docs/architecture.md` — scene schema, OSM pipeline, perf budget, asset strategy
- `docs/roadmap.md` — the week-one cut line and the path to December
- `plans/` — one file per piece of substantial work: goal, approach, tasks, outcome
- `work-diary/` — the daily record: plan of attack, what shipped, plans and their commits, decisions
