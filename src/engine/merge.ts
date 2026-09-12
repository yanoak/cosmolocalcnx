/**
 * Baseline geometry, merged.
 *
 * `docs/architecture.md` calls merging mandatory, and at 1,182 buildings it stops
 * being an optimisation: a mesh each is 1,182 draw calls against a budget of "a few
 * dozen", which is the difference between this running on a mid-range Android in a
 * hot mall and not.
 *
 * Everything here produces ONE geometry per layer. Picking survives it — see
 * `PickRange` — so the viewer's selection behaviour is unchanged. Nothing about the
 * scene document changes; this is purely how it reaches the GPU.
 */

import * as THREE from 'three';
import { footprintToExtrudeArgs } from './extrude';
import type { Point2 } from './extrude';
import type { BaselineArea, BaselineBuilding } from './scene';
import { toneForNormal } from './shading';
import { roleForKind, type Ramp } from './theme';

/**
 * Which triangles of a merged geometry belong to which object.
 *
 * A raycast against a merged mesh reports a face index; this maps that back to an
 * id. It is the whole reason merging costs nothing here — the alternative, and the
 * thing the perf note in the old Building.tsx warned about, is giving up picking.
 */
export interface PickRange {
  id: string;
  /** First triangle, inclusive. */
  start: number;
  count: number;
}

export interface MergedLayer {
  geometry: THREE.BufferGeometry;
  ranges: PickRange[];
  triangles: number;
}

function shapeFor(footprint: Point2[], holes: Point2[][] | undefined, height: number): THREE.Shape {
  const args = footprintToExtrudeArgs(footprint, height, holes ?? []);
  const shape = new THREE.Shape(args.points.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of args.holes) {
    shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  }
  return shape;
}

/**
 * One extruded building, unlit, with each face taking a ramp tone from its normal.
 *
 * Kept as a separate export because the selection outline needs exactly one
 * building's geometry, and rebuilding it is far cheaper than slicing it back out of
 * the merged buffer.
 */
export function buildingGeometry(building: BaselineBuilding): THREE.BufferGeometry {
  const shape = shapeFor(building.footprint, building.holes, building.height);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: building.height,
    bevelEnabled: false,
  });
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Writes the three-tone ramp into vertex colours, chosen per face normal.
 *
 * Form comes from face orientation rather than from lights, so the merged mesh can
 * carry every kind at once on a single unlit material — which is what makes one
 * draw call possible in the first place.
 */
function applyRampColors(geometry: THREE.BufferGeometry, ramp: Ramp): Float32Array {
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(normals.count * 3);
  const cache: Record<string, THREE.Color> = {
    top: new THREE.Color(ramp.top),
    side: new THREE.Color(ramp.side),
    shade: new THREE.Color(ramp.shade),
  };

  for (let i = 0; i < normals.count; i++) {
    const tone = cache[toneForNormal(normals.getX(i), normals.getY(i), normals.getZ(i))];
    colors[i * 3] = tone.r;
    colors[i * 3 + 1] = tone.g;
    colors[i * 3 + 2] = tone.b;
  }

  return colors;
}

/** Non-indexed, because merging buffers with different index bases is needless work. */
function flatten(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

export function mergeBuildings(buildings: BaselineBuilding[]): MergedLayer {
  const positions: Float32Array[] = [];
  const colors: Float32Array[] = [];
  const ranges: PickRange[] = [];
  let triangles = 0;

  for (const building of buildings) {
    let geometry: THREE.BufferGeometry;
    try {
      geometry = flatten(buildingGeometry(building));
    } catch {
      // A footprint that cannot be extruded is skipped rather than failing the whole
      // scene. The import already rejects degenerate rings, so this should never
      // fire — but one bad building must not blank the exhibition.
      continue;
    }

    const position = geometry.getAttribute('position');
    const colour = applyRampColors(geometry, roleForKind(building.kind));
    const count = position.count / 3;

    positions.push(position.array as Float32Array);
    colors.push(colour);
    ranges.push({ id: building.id, start: triangles, count });
    triangles += count;

    geometry.dispose();
  }

  return { geometry: assemble(positions, colors), ranges, triangles };
}

/**
 * Water and green: flat polygons on the ground plane, merged into one geometry each.
 *
 * Laid out in the same XY-then-rotate convention as the buildings so both layers
 * share one transform, rather than each carrying its own and drifting apart.
 */
export function mergeAreas(areas: BaselineArea[], colour: string): MergedLayer {
  const positions: Float32Array[] = [];
  const colors: Float32Array[] = [];
  const ranges: PickRange[] = [];
  const tone = new THREE.Color(colour);
  let triangles = 0;

  for (const area of areas) {
    if (area.footprint.length < 3) continue;

    let geometry: THREE.BufferGeometry;
    try {
      // Height 1 is a placeholder: ShapeGeometry ignores it, but footprintToExtrudeArgs
      // insists on a positive one because it refuses to normalise a zero-height solid.
      geometry = flatten(new THREE.ShapeGeometry(shapeFor(area.footprint, area.holes, 1)));
    } catch {
      continue;
    }

    const position = geometry.getAttribute('position');
    const count = position.count / 3;
    const colourArray = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      colourArray[i * 3] = tone.r;
      colourArray[i * 3 + 1] = tone.g;
      colourArray[i * 3 + 2] = tone.b;
    }

    positions.push(position.array as Float32Array);
    colors.push(colourArray);
    ranges.push({ id: area.id, start: triangles, count });
    triangles += count;

    geometry.dispose();
  }

  return { geometry: assemble(positions, colors), ranges, triangles };
}

function assemble(positions: Float32Array[], colors: Float32Array[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(concat(positions), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(concat(colors), 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function concat(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, chunk) => n + chunk.length, 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * Which object a raycast hit. Binary search, because this runs on every tap and the
 * ranges list is as long as the building count.
 */
export function idForFace(
  ranges: PickRange[],
  // R3F reports `number | null | undefined` — a miss, not a hit at triangle zero.
  faceIndex: number | null | undefined,
): string | null {
  if (faceIndex === null || faceIndex === undefined || ranges.length === 0) return null;

  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const range = ranges[mid];
    if (faceIndex < range.start) hi = mid - 1;
    else if (faceIndex >= range.start + range.count) lo = mid + 1;
    else return range.id;
  }
  return null;
}
