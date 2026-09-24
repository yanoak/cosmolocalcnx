/**
 * The population field as columns — the pure half.
 *
 * One column per populated cell, height by population, in the circle's kilometre
 * frame. This module lays them out and builds the one geometry they all share;
 * `RegionColumns.tsx` puts that on the GPU as an instanced mesh. Everything here has
 * numeric outputs and is tested, because "the Ganges plain is a hole" is a bug with
 * no stack trace.
 *
 * THIS IS NOT TERRAIN, still. `terrain` stays null in the scene document; what is
 * extruded here is people per cell in a different coordinate frame, and it lives in
 * the circle view alone. The resemblance to a heightmap is exactly how elevation
 * would creep back in, so it is spelled out here as it is in `region.ts`.
 *
 * Specified 24 Sep 2026 — see plans/2026-09-23_present-chapter.plan.md. The camera
 * needs no change: it is already isometric, so extruding cells gives the "mountains"
 * look directly.
 */

import { screenBasis } from './camera';
import { toneForNormal, type Tone } from './shading';

/**
 * How tall the tallest cell is, in kilometres, at the committed field's resolution.
 *
 * Tuned by eye against a 3,437 km circle: about a ninth of the radius, so the
 * densest cells read as peaks without the field turning into grass. The height is
 * a picture of relative density, not a quantity a visitor is expected to read.
 */
export const MAX_COLUMN_KM = 400;

/**
 * Population → the ramp position AND the height fraction, log-scaled.
 *
 * The same log10 mapping `fieldToRgba` uses for the flat plane, so a column's top
 * is exactly the colour the plane would have painted under it. Linear height would
 * render everything except the Ganges plain and the Pearl River delta as flat; a
 * cell of 10,000 people is not nothing and should not be invisible.
 */
export function populationT(people: number, max: number): number {
  if (!(people > 0) || !(max > 0)) return 0;
  const t = Math.log10(people + 1) / Math.log10(max + 1);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export interface ColumnLayout {
  /** Populated cells, in row-major order of the field. */
  count: number;
  /** Cell centre, km east of the circle's centre. */
  east: Float32Array;
  /** Cell centre, km north of the circle's centre. */
  north: Float32Array;
  /** Column height, km. */
  heightKm: Float32Array;
  /** Ramp position, 0–1. */
  t: Float32Array;
  /** Field index (`row * size + col`) of each column, for picking. */
  cell: Int32Array;
  /** The width of a cell — every column's footprint. */
  cellKm: number;
}

/**
 * Lay out one column per populated cell.
 *
 * Row 0 is north and column 0 is west, as `build-region.py` writes the raster and as
 * `cellCentreKm` in cities.ts reads it — the same arithmetic, so a tap on a column
 * and a tap on the plane name the same cell.
 */
export function layoutColumns(
  field: Float32Array,
  size: number,
  radiusKm: number,
  max: number,
  maxHeightKm: number = MAX_COLUMN_KM,
): ColumnLayout {
  const cellKm = (2 * radiusKm) / size;
  let count = 0;
  for (let i = 0; i < field.length; i++) if (field[i] > 0) count++;

  const east = new Float32Array(count);
  const north = new Float32Array(count);
  const heightKm = new Float32Array(count);
  const t = new Float32Array(count);
  const cell = new Int32Array(count);

  let k = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const i = row * size + col;
      const people = field[i];
      if (!(people > 0)) continue;
      const u = populationT(people, max);
      east[k] = (col + 0.5) * cellKm - radiusKm;
      north[k] = radiusKm - (row + 0.5) * cellKm;
      heightKm[k] = u * maxHeightKm;
      t[k] = u;
      cell[k] = i;
      k++;
    }
  }

  return { count, east, north, heightKm, t, cell, cellKm };
}

/** Field index → [col, row], the pair `cellCentreKm` and `citiesInCell` take. */
export function cellOf(index: number, size: number): [number, number] {
  return [index % size, Math.floor(index / size)];
}

export interface ColumnGeometry {
  /** xyz triples. A unit column: footprint x, z ∈ [−½, ½], height y ∈ [0, 1]. */
  positions: Float32Array;
  /** One per vertex: 0 top, 1 side, 2 shade — the ramp tone the face takes. */
  tone: Float32Array;
  /** How many faces were kept. */
  faces: number;
}

const TONE_INDEX: Record<Tone, number> = { top: 0, side: 1, shade: 2 };

/**
 * The one geometry every column shares: a unit box with ONLY the faces the camera
 * can see.
 *
 * The camera never rotates (`lod.ts` rests on it), so of a box's six faces exactly
 * three are ever visible — the top and the two walls that face the camera's ground
 * track. Building the other three would double the triangle count of 85,000
 * columns for nothing. Which two walls is derived from `screenBasis`, not assumed,
 * so this follows the attitude if it ever changes.
 *
 * Each face carries the tone `toneForNormal` gives its normal, as a vertex attribute,
 * so the shader can darken walls the way the diorama's ramp does without a light.
 */
export function columnGeometry(): ColumnGeometry {
  const { groundTrack } = screenBasis();
  // Scene (east, north) → three.js (x, -z): a wall faces the camera when its outward
  // normal has a positive component along the ground track.
  const wallX = groundTrack[0] > 0 ? 1 : groundTrack[0] < 0 ? -1 : 0;
  const wallZ = groundTrack[1] < 0 ? 1 : groundTrack[1] > 0 ? -1 : 0;

  type Quad = { normal: [number, number, number]; corners: [number, number, number][] };
  const quads: Quad[] = [
    {
      normal: [0, 1, 0],
      corners: [
        [-0.5, 1, -0.5],
        [-0.5, 1, 0.5],
        [0.5, 1, 0.5],
        [0.5, 1, -0.5],
      ],
    },
  ];
  if (wallX !== 0) {
    const x = wallX * 0.5;
    quads.push({
      normal: [wallX, 0, 0],
      corners:
        wallX > 0
          ? [
              [x, 0, 0.5],
              [x, 1, 0.5],
              [x, 1, -0.5],
              [x, 0, -0.5],
            ]
          : [
              [x, 0, -0.5],
              [x, 1, -0.5],
              [x, 1, 0.5],
              [x, 0, 0.5],
            ],
    });
  }
  if (wallZ !== 0) {
    const z = wallZ * 0.5;
    quads.push({
      normal: [0, 0, wallZ],
      corners:
        wallZ > 0
          ? [
              [-0.5, 0, z],
              [-0.5, 1, z],
              [0.5, 1, z],
              [0.5, 0, z],
            ]
          : [
              [0.5, 0, z],
              [0.5, 1, z],
              [-0.5, 1, z],
              [-0.5, 0, z],
            ],
    });
  }

  const positions = new Float32Array(quads.length * 6 * 3);
  const tone = new Float32Array(quads.length * 6);
  let v = 0;
  for (const q of quads) {
    const t = TONE_INDEX[toneForNormal(q.normal[0], q.normal[1], q.normal[2])];
    const [a, b, c, d] = q.corners;
    // Two triangles, wound so the face's outward normal is the one given.
    for (const p of [a, b, c, a, c, d]) {
      positions[v * 3] = p[0];
      positions[v * 3 + 1] = p[1];
      positions[v * 3 + 2] = p[2];
      tone[v] = t;
      v++;
    }
  }

  return { positions, tone, faces: quads.length };
}

/**
 * How much a wall tone darkens against the top, as a multiplier the shader applies.
 *
 * The diorama's ramp derives its side and shade tones by shifting lightness, which
 * needs HSL and is done per token on the CPU. Columns take their top colour from the
 * population ramp per instance, so the walls are a fixed factor of it instead —
 * close to the ramp's own −12% and −24% on a mid-tone, and the same for every column.
 */
export const TONE_FACTORS: readonly [number, number, number] = [1, 0.86, 0.72];

/** How far a column outside the ring recedes toward the ground — `POPULATION_RAMP_OUTSIDE`'s 0.55. */
export const OUTSIDE_MIX = 0.55;
