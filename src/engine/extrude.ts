/**
 * Footprint to extrusion arguments, and height from OSM tags.
 *
 * Pure on purpose: this is the numeric half of the building generator, and it is
 * the half that can actually be tested. See docs/architecture.md, "OSM pipeline".
 */

export type Point2 = [number, number];

export interface ExtrudeArgs {
  /** Footprint in local metres, wound anticlockwise, with no repeated closing point. */
  points: Point2[];
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

export function footprintToExtrudeArgs(footprint: Point2[], height: number): ExtrudeArgs {
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(`extrude: height must be positive, got ${height}`);
  }

  const points = [...footprint];

  // OSM closes ways by repeating the first node; three.js does not want that.
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 1 && first[0] === last[0] && first[1] === last[1]) {
    points.pop();
  }

  if (points.length < 3) {
    throw new Error(`extrude: need at least 3 distinct points, got ${points.length}`);
  }

  // Normalise winding so downstream geometry and normals are consistent whichever
  // way the source wound the ring.
  if (signedArea(points) < 0) points.reverse();

  return { points, depth: height };
}

const LEVEL_HEIGHT_M = 3.2;

/** Per-kind fallbacks, for the majority of OSM buildings that carry neither tag. */
const DEFAULT_HEIGHT_M: Record<string, number> = {
  residential: 7,
  commercial: 9,
  civic: 12,
  industrial: 8,
  default: 6,
};

export function buildingHeight(
  tags: Record<string, string | undefined>,
  kind = 'default',
): number {
  // parseFloat rather than Number, because OSM heights carry units: "12 m".
  const tagged = Number.parseFloat(tags.height ?? '');
  if (Number.isFinite(tagged) && tagged > 0) return tagged;

  const levels = Number.parseFloat(tags['building:levels'] ?? '');
  if (Number.isFinite(levels) && levels > 0) return levels * LEVEL_HEIGHT_M;

  return DEFAULT_HEIGHT_M[kind] ?? DEFAULT_HEIGHT_M.default;
}
