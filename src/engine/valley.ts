/**
 * The valley view — the basin Chiang Mai grew in, as a surface rather than a backdrop.
 *
 * Shares a field format and a generator with `relief.ts`: both are Copernicus DEM
 * windows written by `fetch-relief.py`, one at ±24 km for the city's backdrop and one at
 * ±60 km under `--field valley`. What differs is what happens to the heights.
 *
 * `reliefHeights` FLATTENS the field under the scene rectangle, because the city's
 * backdrop must never be a surface the diorama sits on. Here the topography IS the
 * subject, so nothing is flattened and nothing is feathered. That is the whole
 * difference, and it is also why the two are separate modules rather than a flag: the
 * flattening is what keeps "buildings are never draped" checkable, and a function that
 * sometimes flattens is a function someone will one day call the wrong way.
 *
 * **`terrain` is still null and still asserted.** The valley is a VIEW with its own
 * field, in its own world. No building, road or water polygon in the baseline sits on
 * it. This module is the closest this project has come to the non-goal in CLAUDE.md, and
 * the distance is kept deliberately: nothing here takes a baseline object as an argument.
 *
 * See `plans/2026-09-21_three-views.plan.md`.
 */

import { reliefVertexAt, type ReliefMeta } from './relief';
import type { Point2 } from './extrude';

/**
 * Vertical exaggeration, and it is not a cheat as long as it is stated.
 *
 * The basin is 120 km across and holds about 1.4 km of relief. That is a little over 1%,
 * and at the fixed isometric pitch a true-scale render of it is a flat sheet with some
 * shading on it — which fails the one thing this view was asked for, a clear view of the
 * mountain topography.
 *
 * 4x is in the range physical relief models and hypsometric wall maps have used for a
 * century, for the same reason. The caption says so, because a piece that argues from
 * geography cannot quietly distort geography.
 */
export const VALLEY_EXAGGERATION = 4;

/**
 * Every second cell of the field, which is what fits the budget.
 *
 * The committed field is 512 x 512 — 522k triangles undecimated, against a ceiling of
 * 100–150k. At 2 it is 130k, and this view has no buildings in it to share the budget
 * with, so the topography can have the lot. 469 m sampling across a 120 km basin still
 * resolves Doi Suthep's ridge, which is about 5 km wide.
 */
export const VALLEY_STRIDE = 2;

/**
 * Heights above the plain, in metres, exaggerated. No flattening, no feather.
 *
 * `base` is the median height of the plain inside the scene boundary, so 0 is the
 * ground the city stands on and the mountains rise from there. Below-plain ground —
 * the Ping's bed downstream, which the DEM puts at 264 m against a base of 308 — comes
 * out negative, and that is correct rather than something to clamp.
 */
export function valleyHeights(
  field: Float32Array,
  meta: ReliefMeta,
  exaggeration: number = VALLEY_EXAGGERATION,
  smooth = 0,
): Float32Array {
  const source = smoothField(field, meta.grid.size, smooth);
  const out = new Float32Array(source.length);
  for (let i = 0; i < source.length; i++) {
    out[i] = (source[i] - meta.base) * exaggeration;
  }
  return out;
}

/**
 * Ground position of a field vertex, in scene metres.
 *
 * Deliberately the same function the backdrop uses. The two fields are concentric on the
 * same origin, so a point on the valley and the same point on the city's relief agree —
 * which is what lets the city's marker sit where the city is.
 */
export function valleyVertexAt(meta: ReliefMeta, i: number, j: number): Point2 {
  return reliefVertexAt(meta, i, j);
}

/** Vertices per side after decimating, with the last one snapped to the field's edge. */
export function valleySide(size: number, stride: number = VALLEY_STRIDE): number {
  return Math.floor((size - 1) / stride) + 1;
}

export function valleyRowOf(a: number, size: number, stride: number = VALLEY_STRIDE): number {
  const side = valleySide(size, stride);
  return a === side - 1 ? size - 1 : a * stride;
}

/** Triangles the decimated mesh will cost, so the budget can be asserted in a test. */
export function valleyTriangles(size: number, stride: number = VALLEY_STRIDE): number {
  const side = valleySide(size, stride);
  return (side - 1) * (side - 1) * 2;
}

/**
 * Where the city sits on the valley field, in the field's own metres.
 *
 * The origin, because both the scene and the valley field are centred on it. Written as
 * a function anyway: a second neighbourhood may well want its marker off-centre, and the
 * call site should not have to know that today it is [0, 0].
 */
export function cityMarkerAt(): Point2 {
  return [0, 0];
}

/**
 * Half-width of the patch drawn for the city, in metres.
 *
 * A dot says "here". A patch says "this is how much of the valley the city is", which is
 * nearer the argument the piece makes — and at 120 km across, the 5.9 x 8.2 km scene is
 * about 5% of the frame, which is itself the point.
 */
export function cityPatchExtent(bounds: [number, number, number, number]): {
  centre: Point2;
  width: number;
  depth: number;
} {
  const [west, south, east, north] = bounds;
  return {
    centre: [(west + east) / 2, (south + north) / 2],
    width: Math.abs(east - west),
    depth: Math.abs(north - south),
  };
}


// ---------------------------------------------------------------------------
// Rendering styles.
//
// Added 21 Sep 2026: a hypsometric gradient alone was not enough to read as
// mountains. Three ways of drawing the same field, chosen by the scene rather than
// hard-coded, so the choice can be made by looking at all three.

export type ValleyStyle = 'gradient' | 'terraced' | 'hillshade' | 'thread';

export const VALLEY_STYLES: readonly ValleyStyle[] = [
  'gradient',
  'terraced',
  'hillshade',
  'thread',
];

/**
 * `hillshade`, chosen 21 Sep 2026 by rendering all three and looking at them.
 *
 * It reads as a plaster relief model: the basin is obviously a flat floor between two
 * ranges, and the ridges and side valleys have form without any colour doing the work.
 *
 * `gradient` was the original and reads as a stain rather than as ground. `terraced` was
 * the one the project's own rules argued for — quantised bands, flat faces, three tones
 * by normal, exactly what the buildings do — and it lost anyway: at 469 m between
 * vertices a terrace is often one cell wide, so treads and risers alternate per cell and
 * the mountains come out as confetti. Both are kept, switchable with `?relief=`, because
 * the argument for terracing is still right and only the resolution is wrong.
 *
 * `thread` was added 23 Sep 2026 from the exhibition's key visual, where the ranges are
 * embroidered in five flat tones of purple. It is the terracing argument won on a
 * different field: it quantises the SHADING and leaves the mesh alone, so the 469 m
 * vertex spacing that turned terraced contours into confetti does not apply to it. Same
 * smooth geometry as `hillshade`, posterised and mapped onto RELIEF_RAMP_THREAD.
 */
export const DEFAULT_VALLEY_STYLE: ValleyStyle = 'hillshade';

/**
 * Contour interval for the terraced style, in TRUE metres above the plain.
 *
 * Set by what the mesh can actually draw, not by cartographic convention. At 469 m
 * between vertices, a band narrower than this leaves most terraces one cell wide — the
 * tread and the riser then alternate every cell and the mountains read as static rather
 * than as contours. That is what 100 m looked like, and it was unusable.
 *
 * 500 m gives four or five bands from the plain to Doi Inthanon, which is close to what
 * a laser-cut site model of this valley would have layers of.
 */
export const TERRACE_STEP_M = 500;

/**
 * Cells of box blur applied before anything else is done with the field.
 *
 * The Copernicus DEM is a DSM — a SURFACE model — so it includes buildings and tree
 * canopy, which puts 10-40 m of jitter on every cell. Untouched, that jitter crosses a
 * contour band at random and terracing turns it into speckle rather than terraces; the
 * first attempt at the stepped style looked like static and was unusable.
 *
 * Five cells is about 1.2 km of smoothing, which is below the width of every ridge in
 * this basin and far above the canopy that was making the noise. It also widens the
 * terraces, which is the other half of making them read.
 */
export const VALLEY_SMOOTH_CELLS = 5;

/**
 * Separable box blur, edge-clamped. Cheap, and its only job is to take the canopy off.
 *
 * Runs on the FIELD, before heights or bands are derived, so every style sees the same
 * surface and the gradient style benefits from it too.
 *
 * Called ONCE, by `ValleyView`, and memoised there. The height functions below default
 * to no smoothing on purpose: smoothing inside them meant two full blurs of a quarter
 * of a million cells per render — enough to wedge the tab — and it quietly coupled pure
 * arithmetic to `meta.grid.size` matching the field's length, which the unit tests
 * immediately caught.
 */
export function smoothField(
  field: Float32Array,
  size: number,
  radius: number = VALLEY_SMOOTH_CELLS,
): Float32Array {
  if (radius < 1 || field.length !== size * size) return field;
  const clamp = (v: number) => Math.min(size - 1, Math.max(0, v));
  const pass = (src: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(src.length);
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        let total = 0;
        for (let d = -radius; d <= radius; d++) {
          const a = horizontal ? i : clamp(i + d);
          const b = horizontal ? clamp(j + d) : j;
          total += src[a * size + b];
        }
        out[i * size + j] = total / (radius * 2 + 1);
      }
    }
    return out;
  };
  return pass(pass(field, true), false);
}

/** Quantise to the contour band below a height. The plain becomes exactly one step. */
export function terrace(heightAbovePlain: number, step: number = TERRACE_STEP_M): number {
  return Math.floor(heightAbovePlain / step) * step;
}

/**
 * Heights above the plain, stepped into contour bands and then exaggerated.
 *
 * Quantising BEFORE exaggerating is what keeps the steps at a real contour interval:
 * the bands are 100 true metres whatever the exaggeration, so the terraces mean
 * something a reader could check against a map.
 */
export function terracedHeights(
  field: Float32Array,
  meta: ReliefMeta,
  step: number = TERRACE_STEP_M,
  exaggeration: number = VALLEY_EXAGGERATION,
  smooth = 0,
): Float32Array {
  const source = smoothField(field, meta.grid.size, smooth);
  const out = new Float32Array(source.length);
  for (let i = 0; i < source.length; i++) {
    out[i] = terrace(source[i] - meta.base, step) * exaggeration;
  }
  return out;
}

/**
 * Directional hillshade, for the style that carries form with light rather than colour.
 *
 * North-west at 45 degrees, which is the cartographic convention — and the one people
 * read as raised rather than sunken. Everything else in this project is unlit and takes
 * its tone from face orientation; this is the one place a light direction is named, and
 * it is named because a shaded-relief map is a drawing convention rather than a
 * simulation.
 */
export function hillshade(nx: number, ny: number, nz: number): number {
  const length = Math.hypot(nx, ny, nz) || 1;
  // Light from the north-west, well above the horizon. Scene north is -z.
  const lx = -0.5;
  const ly = 0.7071;
  const lz = -0.5;
  const dot = (nx / length) * lx + (ny / length) * ly + (nz / length) * lz;
  // Lifted off the floor so a slope facing away is still readable rather than black,
  // but with enough range that a ridge reads at a glance.
  return 0.32 + 0.68 * Math.max(0, dot);
}

/**
 * Nearest-cell height lookup, for hanging rivers and town markers on the surface.
 *
 * Nearest rather than bilinear on purpose: in the terraced style a river interpolated
 * across a step would float above one terrace and sink into the next, and nearest keeps
 * it on whichever terrace it is actually crossing.
 */
export function sampleHeight(
  heights: Float32Array,
  meta: ReliefMeta,
  [x, y]: Point2,
): number {
  const { size, cellM } = meta.grid;
  const [west, , , north] = meta.grid.bboxM;
  const j = Math.round((x - west) / cellM - 0.5);
  const i = Math.round((north - y) / cellM - 0.5);
  if (i < 0 || j < 0 || i >= size || j >= size) return 0;
  return heights[i * size + j];
}
