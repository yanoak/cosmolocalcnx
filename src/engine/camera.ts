/**
 * Isometric camera framing, and the pose every camera move is expressed as.
 *
 * Pure, because "the diorama opens showing one street corner" is a numeric bug with
 * no stack trace — exactly the kind CLAUDE.md says to push into a tested function.
 * The one thing that applies a pose to a real camera is `CameraRig.tsx`; nothing else
 * in the piece touches `camera.zoom` directly.
 *
 * Since 24 Sep 2026 this also holds what survived `registers.ts`: the circle's framing
 * arithmetic. The rest of that module — the zoom ladder, the crossfade bands, the
 * district collapse — described a rail that was cut on 21 Sep, and it was still being
 * imported three days later. Deleted, not renamed.
 *
 * The scene has to open sensibly on a phone in portrait, a laptop, and a projector
 * of unknown aspect ratio, and the scene extent itself is an editorial setting that
 * can move by a kilometre. Nothing here may be a hard-coded number.
 */

import { tweenPoint, tweenZoom } from './tween';
import type { ViewId } from './views';

export type Bounds = [number, number, number, number];

export interface Viewport {
  width: number;
  height: number;
}

export interface CameraFit {
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
  near: number;
  far: number;
}

/** Isometric: 45 degrees around Y, atan(1/sqrt(2)) ≈ 35.264 degrees down. */
export const ISO_PITCH = Math.atan(Math.SQRT1_2);

// ------------------------------------------------------------- the circle's frame

/** How much wider than the district the circle view sits. Tuned by eye. */
export const DEFAULT_REGION_OUT = 8;

/**
 * How much more than the circle the circle view frames.
 *
 * 1 would fit the circle exactly to the screen — and it made the claim unfalsifiable.
 * "Half of humanity lives inside this circle" is only a claim a visitor can weigh if
 * they can SEE that there is a world outside it and that the world outside is emptier.
 * A circle that fills the frame is just a picture of Asia. At 1.7 the circle occupies
 * about 60% of the shorter screen axis, with the rest of the world around it.
 */
export const REGION_MARGIN = 1.7;

/**
 * Stage units per kilometre for the circle's group.
 *
 * The stage unit is a district metre, so this is the one constant that absorbs the
 * 2,500:1 scale gap. Deriving it rather than hard-coding it is what makes the circle
 * work for a second neighbourhood.
 *
 * It needs no viewport, and that is not an oversight. isometricFit's screen footprint
 * is always (spanX + spanZ)·√½ with the vertical a fixed multiple of it, so the
 * constraining axis is the same for a square circle and a rectangular district on every
 * aspect ratio — phone portrait, laptop, and a projector of unknown shape alike. The
 * ratio of the two fits is exactly `regionOut` regardless. A gift from the orthographic
 * choice, and camera.test.ts pins it, because it is precisely the sort of thing that
 * would hold on a laptop and break silently at the venue.
 */
export function regionScale(
  districtBounds: Bounds,
  radiusKm: number,
  regionOut: number = DEFAULT_REGION_OUT,
  margin: number = REGION_MARGIN,
): number {
  const [west, south, east, north] = districtBounds;
  const spanX = Math.max(1, east - west);
  const spanZ = Math.max(1, north - south);
  if (!(radiusKm > 0)) return 1;
  return (regionOut * (spanX + spanZ)) / (4 * radiusKm * Math.max(1e-6, margin));
}

/**
 * The circle view's fitted zoom, from the district's. `regionOut` times further out.
 *
 * This is all that survives of the zoom ladder: the circle's anchor was
 * `districtFit / regionOut`, and with discrete views it is simply the circle's fit.
 */
export function circleFitZoom(districtFitZoom: number, regionOut: number = DEFAULT_REGION_OUT): number {
  return districtFitZoom / Math.max(1e-6, regionOut);
}

/**
 * A camera frustum deep enough for BOTH frames.
 *
 * isometricFit stays untouched — it still decides where the camera sits and what the
 * district fit is. This only widens near/far so the circle's plane, which is thousands
 * of stage units across, is not clipped away.
 */
export function stageFit(
  districtBounds: Bounds,
  regionRadiusStage: number,
  fit: CameraFit,
): CameraFit {
  const [west, south, east, north] = districtBounds;
  const spanX = Math.max(1, east - west);
  const spanZ = Math.max(1, north - south);
  const reach = Math.max(Math.max(spanX, spanZ) * 2, regionRadiusStage * 2);
  return { ...fit, near: -reach * 4, far: reach * 8 };
}

// ------------------------------------------------------------- poses and moves

/**
 * Where the camera is, or should be. The one thing every mover in the piece hands
 * around: a view switch, a chapter beat, the attract loop — all produce a pose, and
 * `CameraRig` is the only thing that applies one.
 *
 * `view` is NAMED, never derived. A pose says which view it belongs to because a zoom
 * cannot: "no function returns a view from a zoom" is the rule the 21 Sep rail removal
 * bought, and it is kept here by construction.
 */
export interface CameraPose {
  view: ViewId;
  zoom: number;
  target: [number, number, number];
}

/**
 * The pose `u` of the way from one to another. Zoom in log space, because zoom is
 * multiplicative and a linear lerp spends most of its time crawling and then covers
 * the last four doublings in three frames; target linearly. The view is the
 * destination's throughout — there is no such thing as half a view.
 */
export function poseBetween(from: CameraPose, to: CameraPose, u: number): CameraPose {
  return {
    view: to.view,
    zoom: tweenZoom(from.zoom, to.zoom, u),
    target: tweenPoint(from.target, to.target, u),
  };
}

export function samePose(a: CameraPose, b: CameraPose): boolean {
  return (
    a.view === b.view &&
    a.zoom === b.zoom &&
    a.target[0] === b.target[0] &&
    a.target[1] === b.target[1] &&
    a.target[2] === b.target[2]
  );
}

/** A little air around the district, so it does not touch the screen edges. */
const MARGIN = 0.92;

export function isometricFit(bounds: Bounds, viewport: Viewport): CameraFit {
  const [west, south, east, north] = bounds;

  const spanX = Math.max(1, east - west);
  const spanZ = Math.max(1, north - south);

  // Scene x/y are east/north; three.js has north as -Z. See "Coordinates and units".
  const target: [number, number, number] = [(west + east) / 2, 0, -(south + north) / 2];

  // Far enough back that nothing clips, in scene units rather than a fixed number.
  const reach = Math.max(spanX, spanZ) * 2;
  const position: [number, number, number] = [
    target[0] + reach,
    reach,
    target[2] + reach,
  ];

  // Screen footprint of an axis-aligned ground rectangle seen isometrically: BOTH
  // ground axes project onto both screen axes, which is why this is not just spanX.
  const screenWidth = (spanX + spanZ) * Math.SQRT1_2;
  const screenHeight = screenWidth * Math.sin(ISO_PITCH);

  // An orthographic camera's zoom is pixels per world unit, so the fit is just the
  // more constraining of the two axes.
  const raw =
    MARGIN * Math.min(viewport.width / screenWidth, viewport.height / screenHeight);

  return {
    position,
    target,
    // A zero-sized viewport is a real state during layout; never emit a zoom of 0.
    zoom: Number.isFinite(raw) && raw > 0 ? raw : 1,
    // Negative near is legal and normal for an orthographic camera.
    near: -reach * 4,
    far: reach * 8,
  };
}
