/**
 * The relief backdrop: the land AROUND the scene, never the ground under it.
 *
 * `terrain` in the scene document stays null and `validateScene` keeps asserting
 * it — no building, road or water polygon ever sits on a sampled surface. What
 * this module handles is a coarse heightmap of the ~50 km around the origin,
 * distilled by `scripts/fetch-relief.py` from the Copernicus 30 m DEM, that the
 * renderer flattens under the scene rectangle so the diorama sits on its plain and
 * the mountains rise beyond it. See "Relief is a backdrop, terrain stays null" in
 * docs/architecture.md, and plans/2026-09-19_relief-backdrop.plan.md.
 *
 * Pure: the numbers here are what the tests pin. Relief.tsx turns them into a mesh.
 */

import type { Bounds } from './Ground';
import { RELIEF_RAMP, sampleRamp } from './theme';

/** What `scripts/fetch-relief.py` writes beside the PNG. */
export interface ReliefMeta {
  encoding: { min: number; max: number };
  grid: { size: number; cellM: number; bboxM: [number, number, number, number] };
  /** Median height of the plain inside the scene boundary. Decodes to y = 0. */
  base: number;
}

/**
 * Where the mesh sits under the scene rectangle: just below the ground plane at
 * −0.02 and the water at −0.01, so nothing in the baseline ever pokes through and
 * nothing z-fights.
 */
export const RELIEF_FLAT_M = -0.3;

/**
 * How far beyond the rectangle the surface takes to reach the DEM. The plain is
 * flat to ±10 m, so this mostly hides that noise at the edge; a hard step at the
 * boundary would read as the city sitting on a plinth.
 */
export const RELIEF_FEATHER_M = 600;

/**
 * How many times further out than the district fit the district is held before the
 * handover to the circle begins, when a relief exists. At 3× the frame is ~17 × 24 km
 * around a 5.8 × 8.1 km scene, which puts Doi Suthep's summit — 9 km west of the
 * origin — comfortably in view before anything starts to shrink. See zoomLadder.
 */
export const RELIEF_HOLD_OUT = 3;

/** Decode the two-channel PNG to metres above the geoid. RGBA bytes, as a canvas gives them. */
export function decodeRelief(
  bytes: Uint8ClampedArray | Uint8Array,
  size: number,
  min: number,
  max: number,
): Float32Array {
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) {
    const v = (bytes[i * 4] << 8) | bytes[i * 4 + 1];
    out[i] = min + (max - min) * (v / 65535);
  }
  return out;
}

/** Vertex ground positions, row-major from the NORTH row, in scene metres [x, north]. */
export function reliefVertexAt(meta: ReliefMeta, i: number, j: number): [number, number] {
  const [west, , , north] = meta.grid.bboxM;
  const cell = meta.grid.cellM;
  return [west + (j + 0.5) * cell, north - (i + 0.5) * cell];
}

function smoothstep(edge0: number, edge1: number, v: number): number {
  const u = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)));
  return u * u * (3 - 2 * u);
}

/** Distance outside an axis-aligned rectangle; 0 inside. */
export function distanceOutside([x, y]: [number, number], [w, s, e, n]: Bounds): number {
  const dx = Math.max(w - x, 0, x - e);
  const dy = Math.max(s - y, 0, y - n);
  return Math.hypot(dx, dy);
}

/**
 * Height above the plain for every vertex, with the scene rectangle flattened.
 *
 * Inside the rectangle exactly RELIEF_FLAT_M; beyond the feather the DEM minus
 * `base`; a smoothstep in between. Written against the rectangle at draw time, not
 * baked into the field, so the extent can move without refetching the DEM.
 */
export function reliefHeights(
  field: Float32Array,
  meta: ReliefMeta,
  scene: Bounds,
  { flat = RELIEF_FLAT_M, feather = RELIEF_FEATHER_M }: { flat?: number; feather?: number } = {},
): Float32Array {
  const { size } = meta.grid;
  const out = new Float32Array(size * size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const k = i * size + j;
      const d = distanceOutside(reliefVertexAt(meta, i, j), scene);
      const relief = field[k] - meta.base;
      const w = smoothstep(0, feather, d);
      out[k] = flat + (relief - flat) * w;
    }
  }
  return out;
}

/**
 * Hypsometric tint, as [r, g, b] in 0–255. The plain is barely off the ground
 * token so the diorama's own ground still reads as the surface it sits on; the
 * ramp climbs through the park green into the civic teal and the deep violet at
 * the summits. Brand tokens throughout, so it belongs to the same diorama rather
 * than reading as a satellite backdrop.
 */
export const RELIEF_RAMP_TOP_M = 1400;

export function reliefColour(heightAbovePlain: number): [number, number, number] {
  return sampleRamp(RELIEF_RAMP, Math.max(0, heightAbovePlain) / RELIEF_RAMP_TOP_M);
}

/**
 * The unlit form cue: steeper faces darken. `ny` is the vertex normal's upward
 * component, 1 on the flat plain. The floor keeps a cliff readable rather than black.
 */
export function reliefShade(ny: number): number {
  const up = Math.min(1, Math.max(0, ny));
  return 0.7 + 0.3 * up;
}
