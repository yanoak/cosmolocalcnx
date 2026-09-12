/**
 * Isometric camera framing.
 *
 * Pure, because "the diorama opens showing one street corner" is a numeric bug with
 * no stack trace — exactly the kind CLAUDE.md says to push into a tested function.
 *
 * The scene has to open sensibly on a phone in portrait, a laptop, and a projector
 * of unknown aspect ratio, and the scene extent itself is an editorial setting that
 * can move by a kilometre. Nothing here may be a hard-coded number.
 */

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
