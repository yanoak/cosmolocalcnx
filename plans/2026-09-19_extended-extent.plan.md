---
slug: 2026-09-19_extended-extent
status: done
started: 2026-09-19
finished: 2026-09-19
issue:
---

# Extend the scene across the river, three times over

## Context

With satellite-derived footprints in (`2026-09-19_satellite-footprints`), the clip that was chosen
on 12 Sep for OSM's 1,182 buildings holds 4,056 and the district reads as a district. Yan asked the
same day to extend it to the other side of the Ping and by about the current rectangle's size in
every direction.

That is 4.5 × 8.1 km, 36.5 km². Measured against Overture before deciding:

| Extent | Size | Buildings | Triangles | Scene JSON |
|---|---|---|---|---|
| Current, tambon-clipped | 1.5 × 2.7 km, 2.98 km² | 4,056 | ~61k | 1.1 MB |
| + 0.8 km west | 2.3 × 2.7 km, 6.2 km² | ~10,000 | ~150k | ~2.6 MB |
| + one rect-width west | 3.0 × 2.7 km, 8.1 km² | ~15,000 | ~220k | ~3.9 MB |
| **3× in every direction** | **4.5 × 8.1 km, 36.5 km²** | **~54,000** | **~780k** | **~14 MB** |

The west bank is denser than Wat Ket: up to 2,100 buildings per 250 m column against ~900. The
3× option is eight times the triangle ceiling in `docs/architecture.md` and far past what a
visitor's phone will load over a QR code. The concern was raised with these numbers; Yan chose the
full 3× and a plain rectangular boundary. Decided 19 Sep 2026.

## Goal

The scene document covers 4.5 × 8.1 km centred as before, clipped to the rectangle rather than the
tambon, with every building Overture and OSM know about inside it and observed heights where the
raster has them. It renders on the laptop and the projector. The phone surface is **knowingly
outside budget** until level-of-detail work lands, and the docs say so rather than pretending.

## Approach

**The extent and the clip are two constants in `scripts/fetch-osm.ts`**, exactly as before; this
changes their values and adds a `--clip rect|tambon` switch so the tambon clip stays one flag away.
The boundary written to the document becomes the rectangle. The tambon polygon stays in the repo:
it is still the attribution anchor and it can be drawn as an outline later.

**The budget checks stay, and stop rejecting.** `checkBudget` still computes the same limits and
the script still prints them. A `BUDGET` constant beside the extent chooses `phone`, where the
limits reject as they did, or `installation`, where they warn. Wat Ket is set to `installation`
with the date and the reason. This keeps the phone budget visible in every run rather than raising
the numbers until they mean nothing.

**No renderer changes for this plan.** Everything is already merged into two meshes, so 780k
triangles is two draw calls; picking is a linear raycast that will cost a few tens of milliseconds
per tap; the ground texture draws the same number of pixels over a larger area. All acceptable for
an installation machine. What is not acceptable for a phone — the 14 MB document bundled into the
page, the geometry build time, the memory — is the December level-of-detail work, not this plan.

**The three-step dance for a new extent** is exactly the one in the script's docstring:
`fetch:osm --refresh --osm-only --extent …` writes the new boundary and the new Overpass cache,
`fetch:buildings --refresh` cuts Overture and the raster to it, `fetch:osm` merges.

Rejected:

- *Raising `AREA_REJECT_KM2` and `TRIANGLE_REJECT`.* They are the phone budget. Renaming the budget
  to fit the scene is how a constraint stops being one.
- *Clipping to the union of neighbouring tambons.* Honest edges, ragged shape, an afternoon; Yan
  chose the rectangle.
- *Thinning the extension* (a higher area floor outside the original clip, or dropping the
  smallest buildings). It would make the far bank look emptier than it is, which is the opposite
  of the point.

## Tasks

- [x] `scripts/fetch-osm.ts`: `--clip` switch, `BUDGET` mode, new default extent and clip, doc
      block
- [x] Regenerate: Overpass cache, buildings cache, scene document — byte-identical on re-run
- [x] Docs: architecture "the boundary", "Limits", CLAUDE.md three-surfaces note, README regen
      lines; diary

## Test list (TDD)

- [x] `checkBudget` is unchanged — no new logic in the engine; the mode lives in the script — no
      new tests
- [x] `sceneBoundsMetres` on a rectangular boundary returns the rectangle — unit, already covered
      by `scene.test.ts`

## Verification

- `npm run fetch:buildings` and `npm run fetch:osm` both report byte-identical on a second run.
- `npm test` and `npm run typecheck` pass.
- `npm run dev`, open `/`: the district register shows both banks; Wat Ket is roughly central;
  the old city side is dense; the block register still lands on Wat Ket.
- Time from load to first frame on the laptop is noted in the diary; if it is over ~5 s, that is
  the first December item.

## Out of scope

- Level of detail, chunked loading, or any phone-side mitigation. December.
- Drawing the tambon outline.
- Any change to the region register.

## Open questions

- [ ] Does the region handover still feel right when the district footprint is 36 km² rather than
      3? `regionScale` derives from bounds, so the circle scales with it — check by eye.

## Outcome

Shipped 19 Sep 2026, and pushed one step further the same afternoon: the 3× rectangle cut the
moated old city in half, so the west edge moved to −3,300 m and the scene is **5.8 × 8.1 km,
47 km²**, the plain rectangle, both banks and the whole old city.

| | Before (tambon clip) | After |
|---|---|---|
| Buildings | 4,056 | **68,704** (OSM 21,731, Google 35,391, Microsoft 11,582) |
| Heights observed / synthesised | 76 % / 23 % | 78 % / 20 % |
| Triangles | ~61k | **~998k** |
| Scene document | 1.1 MB | **18.8 MB** (a 14.9 MB JS chunk in the export) |
| Roads / water / green | 513 / 6 / 80 | 9,594 / 118 / 727 |

Both generators byte-identical on re-run; 22 duplicates and 745 sub-12 m² polygons dropped. The
Overpass cache is 12.6 MB and the buildings cache 21 MB. The duplicate check had to become a 50 m
grid index; quadratic stalled at 42,000 × 16,000.

**Load cost, measured on the static export in a plain Chrome tab:** the R3F canvas renders its
children ~3 s after navigation and the building merge takes 3.7 s, so about 7 s to first frame on
this laptop. The 15 MB chunk parses in under 0.2 s in Node. Two false alarms on the way: with a
debugger attached (the browser automation used to verify), the same page takes 30–100 s to
evaluate the chunk and every merge runs 4–7× slower, which is the debugger, not the app; and the
first Overpass refresh only covered the tambon bbox because the query box came from the clipped
ring, so `--clip rect` had to land before the real refresh.

Ideas for the December level-of-detail work, none done here: load the scene as a fetched JSON or a
binary rather than a bundled module (a 15 MB module parse is fine on a laptop and not on a phone);
cull or coarsen buildings beyond the original clip at district zoom; a BVH for picking.
