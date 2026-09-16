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

## Semantic zoom is the spine

Added 16 Sep 2026. Three **registers** on one rail, moved through with one gesture:

```
 t=0 ──────────────────────────────────────────────── t=1
 REGION            DISTRICT                    BLOCK
 the circle        Wat Ket                     a shophouse
 4.10 bn people    2.98 km²                    one doorstep
```

The outermost is the **Valeriepieris circle** — 21.00°N 100.29°E, radius 3,437 km, containing half
of humanity. **Wat Ket sits 279.98 km from its centre, 8.15% of the radius.** That number is the
piece's argument made geographically, and `src/engine/__tests__/aeqd.test.ts` pins it.

Three registers but only **two coordinate frames** — district and block are the same geometry
differing in emphasis, so there is one handover, not two. The frames are siblings, never nested,
and the region is authored in kilometres, which is what keeps the 2,500:1 gap out of the scene
graph. One orthographic camera serves both.

This came out of item 4's budget (the scrappy editor), which is the only week-one item whose
deadline is not the 24th. Items 3 and 5 were protected.

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
- **Six licences, not one** — code MIT, OSM-derived `baseline` data ODbL, authored 2045 content
  CC BY-SA 4.0, the HDX tambon boundary CC BY-IGO, the GHS-POP population field CC BY 4.0, and
  GeoNames city names CC BY 4.0. **Four of the six require visible credit** and all four live in
  the viewer's footer. See the table in the README. The root `LICENSE` file stays pure MIT so GitHub
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

- **Regenerating data is `npm run fetch:osm`, `npm run fetch:elevation` and
  `npm run build:region`.** None is needed to run the app. A re-run against the same cached
  source must produce a **byte-identical** output — if it does not, the height synthesis or the
  population scatter has stopped being deterministic, and every downstream placement judgement is
  unstable.
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
