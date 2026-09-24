/**
 * The camera's attitude, its framing, and the pose every camera move is expressed as.
 *
 * Pure, because "the diorama opens showing one street corner" is a numeric bug with
 * no stack trace — exactly the kind CLAUDE.md says to push into a tested function.
 * The one thing that applies a pose to a real camera is `CameraRig.tsx`; nothing else
 * in the piece touches `camera.zoom` directly.
 *
 * The circle's framing arithmetic lived here for one day, 24 Sep 2026, after
 * `registers.ts` was deleted; it went the same evening when the circle became a
 * MapLibre map with a camera of its own. What is left is the attitude, the fit, and
 * the pose.
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

// ------------------------------------------------------------------ the attitude

/**
 * Where the camera stands, stated once.
 *
 * The classic isometric: turned 45° from north-up, pitched so a cube's three faces
 * are equal. That is the angle the piece has had since the first greybox and the one
 * Yan asked to keep on 24 Sep 2026, after a north-up version was tried for a morning
 * and rejected — "the same angle we had before". What that morning left behind is
 * this module: until then the attitude was restated in six files (the fit's footprint
 * formula, the depth slicing, the backdrop's projection, the plane basis, the wall
 * tones and the rasteriser's cull). Now everything derives from these two numbers, and
 * the backdrop's freshness fingerprint carries them, so changing either fails a test
 * until the raster is re-rendered.
 *
 * `CAMERA_YAW` is how far the view is turned clockwise from north-up, in radians —
 * π/4 puts the camera south-east of its target, so north runs up-left on screen.
 * `CAMERA_PITCH` is the angle below horizontal. They are constants rather than
 * settings because the whole level-of-detail scheme rests on the camera never
 * turning — see `lod.ts`.
 */
export const CAMERA_YAW = Math.PI / 4;
export const CAMERA_PITCH = Math.atan(Math.SQRT1_2);

/** The pitch at which a cube's three faces are equal on the diagonal. */
export const ISO_PITCH = CAMERA_PITCH;

export type Vec3 = [number, number, number];

export interface ScreenBasis {
  /** Screen right, in three.js space. Horizontal. */
  right: Vec3;
  /** Screen up, in three.js space. */
  up: Vec3;
  /** From the target toward the camera, in three.js space. Unit length. */
  towards: Vec3;
  /** The horizontal part of `towards`, as a unit vector in SCENE (east, north) space. */
  groundTrack: [number, number];
}

/**
 * The view's axes, derived from the attitude.
 *
 * Scene coordinates are (x east, y north, h up); three.js is (x, h, -y). The ground
 * track is the compass direction from the target to the camera: south-east at yaw π/4.
 * The basis is orthonormal by construction and `camera.test.ts` checks that it stays so.
 */
export function screenBasis(yaw: number = CAMERA_YAW, pitch: number = CAMERA_PITCH): ScreenBasis {
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  const sinP = Math.sin(pitch);
  const cosP = Math.cos(pitch);
  // Scene (east, north) → three.js (x, 0, -north).
  const groundTrack: [number, number] = [sinY, -cosY];
  const g: Vec3 = [groundTrack[0], 0, -groundTrack[1]];
  return {
    right: [cosY, 0, -sinY],
    up: [-g[0] * sinP, cosP, -g[2] * sinP],
    towards: [g[0] * cosP, sinP, g[2] * cosP],
    groundTrack,
  };
}

const BASIS = screenBasis();

/**
 * Scene metres to screen metres, in the fixed attitude.
 *
 * `sy` is POSITIVE UP, like a plan drawing; a rasteriser flips it once, where it turns
 * metres into image rows. Linear, which is what makes an orthographic raster exact.
 */
export function projectView(x: number, y: number, h = 0): [number, number] {
  // three.js point (x, h, -y) dotted with right and up.
  const px = x;
  const py = h;
  const pz = -y;
  return [
    px * BASIS.right[0] + py * BASIS.right[1] + pz * BASIS.right[2],
    px * BASIS.up[0] + py * BASIS.up[1] + pz * BASIS.up[2],
  ];
}

/**
 * Metres along the camera's ground track. Larger is nearer the camera.
 *
 * Not the distance along the view ray, which is shorter by cos(pitch) because the
 * camera is elevated; the two are monotonically equivalent for ground positions, which
 * is all depth slicing needs, and the ground-track distance is the one that can be read
 * off a plan. Height is ignored on purpose.
 */
export function groundDepth(x: number, y: number): number {
  return x * BASIS.groundTrack[0] + y * BASIS.groundTrack[1];
}

/** Ground-track metres to metres along the view ray. */
export const GROUND_TRACK_TO_VIEW_RAY = Math.cos(CAMERA_PITCH);

/**
 * Whether a wall with this outward normal (scene east, north) faces the camera at all.
 * A wall edge-on to the camera does not.
 */
export function wallFacesCamera(nx: number, ny: number): boolean {
  return nx * BASIS.groundTrack[0] + ny * BASIS.groundTrack[1] > 0;
}

/**
 * How far to the screen's right a three.js normal points, −1..1.
 *
 * The wall tones in `shading.ts` split on this: a wall that faces the camera's right
 * is lit, one that faces its left is shaded — on the diagonal, the east wall and the
 * south wall of every building.
 */
export function rightness(x: number, y: number, z: number): number {
  return x * BASIS.right[0] + y * BASIS.right[1] + z * BASIS.right[2];
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

/**
 * The screen footprint of an axis-aligned ground rectangle, in screen metres.
 *
 * By projecting its corners rather than by a formula: the formula was
 * (spanX + spanZ)/√2 for the diagonal camera, and a formula is exactly the kind of
 * restated fact this module exists to stop.
 */
export function screenFootprint(bounds: Bounds): { width: number; height: number } {
  const [west, south, east, north] = bounds;
  const corners: [number, number][] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of corners) {
    const [sx, sy] = projectView(x, y, 0);
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
  }
  return { width: Math.max(1e-6, maxX - minX), height: Math.max(1e-6, maxY - minY) };
}

/**
 * The camera fit for an extent: where the camera stands, what it looks at, and the
 * orthographic zoom at which the extent fills the viewport. Named for the fixed
 * attitude it serves rather than for a particular angle.
 */
export function isometricFit(bounds: Bounds, viewport: Viewport): CameraFit {
  const [west, south, east, north] = bounds;

  const spanX = Math.max(1, east - west);
  const spanZ = Math.max(1, north - south);

  // Scene x/y are east/north; three.js has north as -Z. See "Coordinates and units".
  const target: [number, number, number] = [(west + east) / 2, 0, -(south + north) / 2];

  // Far enough back that nothing clips, in scene units rather than a fixed number.
  const reach = Math.max(spanX, spanZ) * 2;
  const back = reach * Math.sqrt(3);
  const position: [number, number, number] = [
    target[0] + BASIS.towards[0] * back,
    target[1] + BASIS.towards[1] * back,
    target[2] + BASIS.towards[2] * back,
  ];

  const { width: screenWidth, height: screenHeight } = screenFootprint(bounds);

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
