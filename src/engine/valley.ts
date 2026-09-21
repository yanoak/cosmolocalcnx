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
): Float32Array {
  const out = new Float32Array(field.length);
  for (let i = 0; i < field.length; i++) {
    out[i] = (field[i] - meta.base) * exaggeration;
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
