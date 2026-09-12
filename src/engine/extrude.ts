/**
 * Footprint to extrusion arguments.
 *
 * Pure on purpose: this is the numeric half of the building generator, and it is
 * the half that can actually be tested. See docs/architecture.md, "OSM pipeline".
 *
 * Height lives in `synth.ts`, not here — 96% of Wat Ket's buildings carry no height
 * information at all, so deciding one is a substantial job of its own rather than a
 * tag lookup.
 */

export type Point2 = [number, number];

export interface ExtrudeArgs {
  /** Footprint in local metres, wound anticlockwise, with no repeated closing point. */
  points: Point2[];
  /** Courtyards, wound clockwise — the opposite of `points`, as THREE.Shape expects. */
  holes: Point2[][];
  /** Extrusion depth in metres. Becomes height once the shape is laid flat. */
  depth: number;
}

/** Twice the signed area. Positive is anticlockwise. */
function signedArea(points: Point2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum;
}

/** OSM closes ways by repeating the first node; three.js does not want that. */
function openRing(ring: Point2[]): Point2[] {
  const points = [...ring];
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 1 && first[0] === last[0] && first[1] === last[1]) {
    points.pop();
  }
  return points;
}

export function footprintToExtrudeArgs(
  footprint: Point2[],
  height: number,
  holes: Point2[][] = [],
): ExtrudeArgs {
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(`extrude: height must be positive, got ${height}`);
  }

  const points = openRing(footprint);

  if (points.length < 3) {
    throw new Error(`extrude: need at least 3 distinct points, got ${points.length}`);
  }

  // Normalise winding so downstream geometry and normals are consistent whichever
  // way the source wound the ring.
  if (signedArea(points) < 0) points.reverse();

  // Holes wind the other way. A hole wound with the outer ring is not a hole —
  // three.js triangulates it into a solid block, which is precisely the silent
  // failure the multipolygon test in osm.test.ts guards against.
  const wound = holes
    .map(openRing)
    .filter((hole) => hole.length >= 3)
    .map((hole) => (signedArea(hole) > 0 ? [...hole].reverse() : hole));

  return { points, holes: wound, depth: height };
}
