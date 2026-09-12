# Roadmap

## Week one — to 24 Sep 2026

Sequenced so the schema is right on day one and everything downstream is disposable.

| # | Work |
|---|---|
| 1 | **Schema + grey-box blockout.** Orthographic camera, click-to-select, panel opens. No art. |
| 2 | **OSM baseline generation** — a script that writes `baseline` into the scene document. Not a UI. |
| 3 | **Scenario switching.** Two or three 2045 futures as states of one toggle. No time slider and no "today" view — see below. |
| 4 | **Scrappy editor, one day.** Localhost only. Click ground to place, arrow keys nudge, `R` rotates, `Delete` removes, one button copies scene JSON to the clipboard. No auth, no uploads, no database. Output gets committed to the repo. |
| 5 | **Content.** Hotspots and bilingual copy, kept in data files so the partly-formed 2045 material can land late. Each hotspot carries its own before-and-after — with no "today" view, this copy is the only thing that makes an intervention legible as a change. |
| 6 | **Exhibition hardening.** Idle reset + attract loop, fullscreen kiosk mode, static export served locally on the laptop/projection machine, thumb-sized hit targets, QR code and short URL, ambient audio. |
| 7 | **Buffer.** You will need all of it. |

### Cut: the time slider, and the present

Both dropped on 12 Sep 2026. The viewer shows **2045 futures only** — two or three of them, as
states of one toggle. No continuous scrub, and no "today" state a visitor can select.

What this simplifies: edits need no date or ordering semantics, there is no partially-applied scene
state to render, nothing has to animate between two versions of a building, and each state's
geometry can be merged once ahead of time and swapped whole.

What it does not change: **edits stay a diff over an immutable baseline.** That rule was never
mainly about the slider — it is about re-import safety, a second scenario being nearly free, and
undo being a pop off an op stack. All three survive intact, and the baseline still does the work of
making 2045 Wat Ket recognisably Wat Ket. It is simply never rendered on its own.

What it costs: the present was the reference point that made an intervention legible as a change.
The hotspot copy now has to carry that before-and-after itself, which raises the stakes on item 5
rather than lowering them. And **two scenarios becomes a hard minimum** — with one, the toggle is
dead and there is nothing to compare. See "Futures only" in `docs/architecture.md`.

### The discipline

**If the grey-box version is not interesting to click around on day one, art will not rescue it.**
Find that out on day one, not day five.

### Cheap insurance

Keep hotspot content, coordinates and copy in a plain JSON file decoupled from the renderer. If 3D
goes sideways on day five, the same content can drive a flat illustrated isometric fallback overnight.

### Why the scrappy editor is worth a whole day

Two reasons beyond convenience:

1. Hand-authoring forty building positions as coordinates in a text file is miserable enough to
   derail the week.
2. **The NFL workshops are on 26–27 Sep — two days *after* the exhibition opens.** If the editor is
   usable by then, workshop participants can place their own 2045 interventions into the live scene
   and the exhibition accumulates over its run. That turns the editor from internal tooling into
   part of the programme, and argues for building it earlier in the week rather than treating it as
   optional.

None of it is throwaway: it is the first draft of the real editor's interaction layer.

## To December — Chiang Mai Design Week

### What accumulates vs. what gets thrown away

Over twelve weeks, three things compound and everything else gets rewritten.

**Protect:**
- The **scene schema** — expensive to change later, because every authored scene and every tool
  depends on it
- The **asset library** — every model made or cleaned up is permanent value
- **Authored content** — scenarios, hotspots, the Wat Ket baseline itself

**Expect to rewrite:** the renderer and the editor UI. Write them cheaply. Do not gold-plate, do not
abstract prematurely. The mistake would be spending week one on a beautiful editor architecture
instead of on a schema that survives.

### The test for whether it is a product

**A second and third neighbourhood — not more features.** If by Design Week you can drop in a
boundary for somewhere else in Chiang Mai and have a credible baseline in twenty minutes, that is
the demo.

Judge every decision between now and December against whether it makes the second city cheaper.
This is another argument for procedural generators (tier 2 in `architecture.md`) over hand-modelled
assets: generators travel, hand-placed buildings do not.

### Deferred until after 28 Sep

All of this is a shell around a core that by then will already work and have been proven by real
public use:

- Admin panel proper, with auth
- Boundary upload UI — GeoJSON / shapefile, with the area caps enforced in the UI
- Asset upload, validation and the normalization fix-up UI
- Thumbnail generation for the asset palette
- Postgres persistence and Blob/R2 asset storage
- Multi-scene management

### Open

Whether Chiang Mai Design Week has a submission deadline or curatorial process that works backwards
from a date earlier than December — see the open questions in `programme-context.md`.
