/**
 * Level of detail — which baseline objects stay geometry, and which become backdrop.
 *
 * The scene took in the whole old city on 19 Sep 2026 and has been ten times over the
 * phone budget ever since: 68,704 buildings and ~997k triangles against a ceiling of
 * 100–150k. This module is the partition that repays it — geometry where there is
 * content, a pre-rendered raster where there is context.
 *
 * **Why a raster is exact here and not an approximation.** `Diorama.tsx` sets
 * `enableRotate={false}` on an orthographic camera at a fixed isometric attitude. Under
 * an orthographic projection with a fixed orientation, zooming IS a 2D scale of the
 * projected image and panning IS a 2D translation — there is no parallax to get wrong.
 * A rendered image of the far city is the same picture the geometry would have drawn,
 * and the only thing that degrades with zoom is resolution.
 *
 * That property is load-bearing and it is not obvious. It would be destroyed by the
 * first person who enables orbit, which is why it is written here as well as in
 * `plans/2026-09-21_backdrop-lod.plan.md`.
 *
 * Everything in this file is pure, because "the wrong half of the city vanished" is a
 * numeric bug with no stack trace — the kind CLAUDE.md says to push into a tested
 * function.
 */

import type { Point2 } from './extrude';
import { centroid } from './ordering';
import type { BaselineBuilding, BaselineRoad } from './scene';

export interface LodOptions {
  /** Scene-local metres. The subject's centre, not necessarily the extent's. */
  centre: Point2;
  /**
   * How far out geometry is kept.
   *
   * A PROXY, and only that. The real rule is the hero test below: a building carries
   * geometry because someone wrote about it, not because of where it sits. Until item
   * 5's hotspots land there is nothing to test against, so distance stands in.
   */
  radiusM: number;
  /**
   * Buildings a hotspot points at. Always geometry, at any distance.
   *
   * Same set `Buildings.tsx` uses to pick heroes out of stock, and derived the same way
   * — from hotspot targets rather than a schema field — so the two cannot drift.
   */
  heroIds?: ReadonlySet<string>;
}

export interface Partition<T> {
  near: T[];
  far: T[];
}

const NO_HEROES: ReadonlySet<string> = new Set();

function within([x, y]: Point2, [cx, cy]: Point2, radiusM: number): boolean {
  // A non-positive radius means "no geometry", not "geometry for whatever happens to
  // sit exactly on the centre" — which is what `<=` would otherwise say, and is a
  // silly contract to have to explain.
  if (radiusM <= 0) return false;
  // Squared, to keep a square root out of a 68,704-iteration loop.
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radiusM * radiusM;
}

/**
 * Split the baseline buildings into the ones that stay geometry and the ones the
 * backdrop generator will draw.
 *
 * Document order is preserved inside each group. That is not cosmetic: `mergeBuildings`
 * writes pick ranges in the order it is handed them and `idForFace` binary searches
 * those ranges, so a reordering here would return the wrong building on tap.
 */
export function partitionBuildings(
  buildings: readonly BaselineBuilding[],
  { centre, radiusM, heroIds = NO_HEROES }: LodOptions,
): Partition<BaselineBuilding> {
  const near: BaselineBuilding[] = [];
  const far: BaselineBuilding[] = [];

  for (const b of buildings) {
    const keep = heroIds.has(b.id) || within(centroid(b.footprint), centre, radiusM);
    (keep ? near : far).push(b);
  }

  return { near, far };
}

/**
 * The same split for roads, on a deliberately more generous test: a road is near if
 * ANY of its vertices is.
 *
 * Clipping a road at the disc edge would leave it ending in mid-air against a backdrop
 * that draws the same road continuing — the visible seam that Verification step 1 in
 * the plan exists to catch. A road that crosses the boundary is cheap and is kept whole.
 */
export function partitionRoads(
  roads: readonly BaselineRoad[],
  { centre, radiusM }: LodOptions,
): Partition<BaselineRoad> {
  const near: BaselineRoad[] = [];
  const far: BaselineRoad[] = [];

  for (const r of roads) {
    (r.path.some((p) => within(p, centre, radiusM)) ? near : far).push(r);
  }

  return { near, far };
}

/**
 * Metres along the view axis. Larger is nearer the camera.
 *
 * `camera.ts` puts the camera at `target + (reach, reach, reach)` — so, with three.js
 * -z as north, south-east and elevated. The ground-plane component of the view
 * direction is the (x, -y) diagonal, so depth is (x - y) scaled to metres along the
 * camera's GROUND TRACK: moving 100 m south-east advances this by 100 m.
 *
 * Not the component along the view ray itself, which is shorter by a factor of
 * sqrt(2/3) because the camera is elevated. The two are monotonically equivalent for
 * ground positions, which is all the slicing needs, and the ground-track distance is
 * the one that can be read off a plan.
 *
 * Height is ignored. This orders and slices ground positions; the plane placement in
 * `BackdropPlane.tsx` works in the full camera basis.
 */
export function viewDepth([x, y]: Point2): number {
  return (x - y) * Math.SQRT1_2;
}

export interface DepthRange {
  min: number;
  max: number;
}

/** Empty is `min > max`, which `sliceFor` reads as "there is nothing to be in front of". */
const EMPTY_RANGE: DepthRange = { min: Infinity, max: -Infinity };

/**
 * The depth span of the near set, footprint corners included rather than centroids —
 * a building is only fully behind the near geometry if it is behind all of it.
 */
export function nearDepthRange(near: readonly BaselineBuilding[]): DepthRange {
  let min = Infinity;
  let max = -Infinity;

  for (const b of near) {
    for (const p of b.footprint) {
      const d = viewDepth(p);
      if (d < min) min = d;
      if (d > max) max = d;
    }
  }

  return min > max ? EMPTY_RANGE : { min, max };
}

/**
 * Which backdrop plane a far object belongs on.
 *
 * The backdrop is what the camera sees, so it is drawn on a plane normal to the view
 * direction — not on the ground. One plane behind the near geometry correctly occludes
 * everything beyond it, but would also hide the far buildings that sit BETWEEN the
 * camera and Wat Ket, which in a true render would overlap it. Hence two slices.
 *
 * ONLY what is strictly behind the whole near set goes behind. Everything else goes in
 * front, including the buildings that merely overlap the near set in depth and sit
 * laterally beside it.
 *
 * That last part was the other way round until it was seen on screen on 21 Sep 2026.
 * The reasoning for sending them behind was that being wrongly hidden reads as depth
 * while wrongly covering near geometry reads as a bug. Both halves turned out to be
 * wrong. They are not hidden subtly: the behind plane hangs behind the near set, the
 * opaque ground in that depth band is nearer than it, and the result is a clean
 * horizontal band of missing city running the full width of the stage. And they cannot
 * wrongly cover Wat Ket, because objects at the same depth lie on a line perpendicular
 * to the view axis — which is a horizontal line on screen, to the left and right of the
 * near disc rather than over it.
 */
export type BackdropSlice = 'behind' | 'front';

export function sliceFor(depth: number, range: DepthRange): BackdropSlice {
  if (range.min > range.max) return 'behind';
  return depth >= range.min ? 'front' : 'behind';
}
