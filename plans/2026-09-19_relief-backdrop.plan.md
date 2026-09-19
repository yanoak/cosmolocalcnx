---
slug: 2026-09-19_relief-backdrop
status: done
started: 2026-09-19
finished: 2026-09-19
issue:
---

# Relief backdrop — the mountains around the flat city

## Context

`CLAUDE.md` has said since 12 Sep: **no elevation, no terrain**. Wat Ket is flat river plain, SRTM
is 30 m, and draping 1,182 buildings onto a sampled surface would cost days and produce stair-steps
indistinguishable from flat. `terrain` stays `null` and `validateScene` asserts it.

On 19 Sep 2026, with the scene tripled to 5.8 × 8.1 km and both banks of the Ping in, Yan asked for
"topography for real, so that when we zoom out we can see the mountains". Chiang Mai is a valley
city: Doi Suthep and Doi Pui rise 1,300 m within 10 km to the west, and a scene of it with nothing
around it is a scene of somewhere else.

The two requests are not in conflict once the distinction is drawn. What the non-goal forbids is
draping the district onto a surface. What is asked for is the land *around* the district.

## Goal

A heightmap of the ~50 km around the origin, from the Copernicus 30 m DEM, rendered as an unlit
mesh in the district's own frame, **flat under the scene rectangle** with a feathered edge so the
diorama sits on its plain and the mountains rise beyond it. Visible as the visitor zooms out from
the district, gone with the district in the handover to the circle. `terrain` stays `null`,
buildings stay flat, and the schema gains `relief`, a sibling of `region`, not a replacement for
`terrain`.

## Approach

**Copernicus GLO-30, not SRTM.** Same resolution class, but it is a public COG bucket on AWS that
rasterio can range-read, so the script pulls a window rather than an account and a tile archive.
Its licence requires a specific attribution notice, which goes in the README and the footer.

**Distilled the way the region field is.** `scripts/fetch-relief.py` reads the DEM under a
48 × 48 km box about the origin, block-averages it to a 256-cell grid (187 m cells: SRTM-class
detail at the zoom where it is seen is invented anyway), and writes a two-channel PNG plus a
sidecar, both committed, both byte-identical on re-run, both under 200 KB. The raw window is a
gitignored cache. `base` in the sidecar is the median elevation inside the scene boundary, so
the plain decodes to ~0 and the peaks to ~+1,350.

**Flattening is a render-time rule, not baked.** `reliefHeights` in `src/engine/relief.ts` takes
the decoded field and the scene bounds and returns vertex heights: a fixed −0.3 m inside the
rectangle (under the ground plane and the water), the DEM height beyond a 600 m feather, a
smoothstep between. The rectangle can move without refetching the DEM, and the rule is a pure
function with tests.

**Unlit, vertex-coloured, one draw call.** A `PlaneGeometry` with 255 segments is 130k triangles,
which on the installation surfaces is nothing and on phones is moot since the extent decision.
Colour is a hypsometric ramp from the brand palette times the same top/side/shade tone the
buildings use, so it belongs to the same diorama rather than reading as a satellite backdrop.
No shadows, no lighting model — the design system is unlit.

**It lives in the district group.** So it collapses and fades with the district in the handover
and needs no register logic of its own. At district-fit it fills the frame beyond the rectangle;
at eight times out, the ladder's region anchor, the full 48 km box is in view just before the
circle takes over.

Rejected:

- *Draping the district.* The non-goal stands. Buildings sit at y = 0 on a plain that is genuinely
  flat to ±10 m.
- *Making `terrain` non-null.* The field is reserved for the thing this is not. A second name
  keeps the invariant checkable.
- *A fourth register.* The mountains are a backdrop to the district, not a scale of their own.
  If a "valley" register is wanted later, this mesh is what it would show.
- *AWS Terrain Tiles (Terrarium).* Easier to fetch, but a stack of sources with a paragraph of
  attribution. Copernicus is one source and one notice.

## Tasks

- [x] `scripts/fetch-relief.py` + `npm run fetch:relief` + gitignore — writes
      `src/scenes/wat-ket.relief.{png,json}`
- [x] `src/engine/relief.ts` — decode, heights with flattening and feather, colours; tests
- [x] `ReliefBackdrop.tsx` in the district group; `relief` in the schema and `validateScene`; page wiring
- [x] Docs: rewrite "Skip elevation entirely", CLAUDE.md non-goal, README row, footer notice

## Test list (TDD)

- [x] heights inside the rectangle are exactly the flat level — unit — `relief.test.ts`
- [x] heights beyond the feather equal the field minus base — unit — `relief.test.ts`
- [x] heights across the feather are monotonic between the two — unit — `relief.test.ts`
- [x] vertex positions cover the sidecar bbox at cell centres, north as −Z — unit — `relief.test.ts`
- [x] `validateScene` rejects a `relief` without a field or meta, accepts null or absent — unit —
      `scene.test.ts`
- [x] `terrain` must still be null — unit — already in `scene.test.ts`

## Verification

- `npm run fetch:relief` twice → byte-identical.
- `npm test`, `npm run typecheck` pass.
- `npm run dev`: at district-fit the plain surrounds the rectangle with no visible seam; zoom out
  and Doi Suthep rises to the west, the hills to the north-east; keep going and it collapses onto
  the circle with the district.
- The block register is unchanged: nothing pokes through the ground.

## Out of scope

- Any elevation under buildings or roads.
- Hillshading or lighting. Unlit by design.
- A "valley" register.

## Open questions

- [ ] Vertical exaggeration. None to start; the relief is 1,300 m over 10 km, which in isometric
      should read on its own. Revisit by eye.

## Outcome

Shipped 19 Sep 2026. `fetch:relief` reads four Copernicus tiles (two are 24-pixel slivers at
19°N) into a 48 × 48 km window, heights 286–1,678 m, plain 308.4 m, relief above the plain 1,370 m;
130 KB PNG plus sidecar, byte-identical on re-run. `reliefGeometry` builds the 130k-triangle mesh in
~0.3 s. Nine tests on the maths, three on the schema; `terrain` still must be null.

**One thing the plan missed:** the handover began the moment the visitor pulled back, so the
district shrank onto the circle before the mountains had a frame to themselves. `zoomLadder` gained
`backdropOut`: with a relief the whole handover band slides down the rail so the district is held
at full size until the camera is 3× further out than the district fit (`RELIEF_HOLD_OUT`), then
collapses over the same band width as before. Four tests pin it. Seen in the browser: the plain
surrounds the rectangle with no seam, and in the handover the 48 km square shows the Suthep
range in teal at its north-west corner. The held plateau itself was not captured in a screenshot,
because the browser automation's debugger froze the page for minutes at a time on every reload;
check by hand with a mouse wheel from the Wat Ket chip.

The plain is deliberately barely tinted; if the mountains read too faint at the plateau, the
lever is the ramp in `theme.ts`, not the geometry.
