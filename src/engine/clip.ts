/**
 * Polygon containment and area, in local metres.
 *
 * Pure and boring on purpose: this decides which of ~1,600 OSM buildings are in the
 * scene at all, and it decides the number the budget guard rejects on. Both are
 * numeric outputs with no visual tell when they are subtly wrong — which is exactly
 * the case CLAUDE.md says to push into a tested function.
 */

import type { Point2 } from './extrude';

/** A closed ring. A repeated closing point is tolerated everywhere in this module. */
export type Ring = Point2[];

/** `[outer, ...holes]`. A bare ring is a polygon with no holes. */
export type Poly = Ring[];

/**
 * Ray casting, counting crossings to the left of the point.
 *
 * The `yi > py !== yj > py` test is the half-open convention: an edge counts at its
 * lower endpoint and not its upper one, so a ray passing exactly through a vertex is
 * counted once rather than twice or zero times. Getting this wrong produces a
 * clipper that works on test rectangles and drops scattered buildings in the real
 * neighbourhood — the worst kind of failure here, because it looks like OSM is
 * missing data.
 */
export function pointInRing([px, py]: Point2, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
export function pointInPolygon(point: Point2, poly: Poly): boolean {
  const [outer, ...holes] = poly;
  if (!outer || !pointInRing(point, outer)) return false;
  return !holes.some((hole) => pointInRing(point, hole));
}

/** Inside any part of a multipolygon. */
export function pointInAny(point: Point2, polys: Poly[]): boolean {
  return polys.some((poly) => pointInPolygon(point, poly));
}

/** Shoelace. Positive is anticlockwise; the sign is meaningful, so do not abs() here. */
export function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Outer ring minus holes, always positive. */
export function polygonArea(poly: Poly): number {
  const [outer, ...holes] = poly;
  if (!outer) return 0;
  return holes.reduce((acc, hole) => acc - Math.abs(ringArea(hole)), Math.abs(ringArea(outer)));
}

/**
 * Area-weighted centroid of a ring.
 *
 * This is the single point that decides whether a building straddling the boundary
 * is in the scene, so it must be the same answer every run — see the `wasAt`
 * reasoning in docs/architecture.md. Degenerate rings (zero area — a sliver, or a
 * way whose nodes collapsed after rounding) fall back to the vertex mean rather than
 * dividing by zero and emitting NaN.
 */
export function centroid(ring: Ring): Point2 {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }

  if (twiceArea === 0) {
    const n = ring.length || 1;
    const sum = ring.reduce<Point2>(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
    return [sum[0] / n, sum[1] / n];
  }

  return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
}

/**
 * Sutherland–Hodgman: clip a ring against a CONVEX clip ring.
 *
 * Used to cut the Wat Ket tambon down to the scene's working extent. The convexity
 * requirement is real and is why the extent is a rectangle: against a concave
 * clipper this algorithm produces degenerate edges joining the pieces, which look
 * fine in a coordinate list and wrong on screen.
 *
 * The subject ring may be concave — which the tambon is — and that is fine, as long
 * as the clip does not cut it into disjoint parts. `fetch-osm.ts` checks the
 * resulting area against the source, which is what would catch that.
 */
export function clipRingToConvex(subject: Ring, clipper: Ring): Ring {
  if (subject.length < 3 || clipper.length < 3) return [];

  // Work anticlockwise so "inside" is consistently to the left of each clip edge.
  const clip = ringArea(clipper) < 0 ? [...clipper].reverse() : clipper;
  let output: Ring = ringArea(subject) < 0 ? [...subject].reverse() : [...subject];

  for (let i = 0; i < clip.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    if (input.length === 0) break;

    // Positive is to the left of a→b, which is inside for an anticlockwise ring.
    const side = (p: Point2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

    const intersect = (p: Point2, q: Point2): Point2 => {
      const sp = side(p);
      const sq = side(q);
      const t = sp / (sp - sq);
      return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
    };

    for (let j = 0; j < input.length; j++) {
      const current = input[j];
      const previous = input[(j + input.length - 1) % input.length];
      const currentIn = side(current) >= 0;
      const previousIn = side(previous) >= 0;

      if (currentIn) {
        if (!previousIn) output.push(intersect(previous, current));
        output.push(current);
      } else if (previousIn) {
        output.push(intersect(previous, current));
      }
    }
  }

  return output;
}

/** An axis-aligned rectangle as a ring, anticlockwise. */
export function rectRing(west: number, south: number, east: number, north: number): Ring {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
}

/** Bounding box of a set of points, as `[west, south, east, north]`. */
export function bounds(points: Point2[]): [number, number, number, number] {
  return points.reduce<[number, number, number, number]>(
    ([w, s, e, n], [x, y]) => [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}
