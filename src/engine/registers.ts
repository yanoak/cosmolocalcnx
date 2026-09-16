/**
 * Semantic zoom: one rail from the planetary to the particular.
 *
 * The visitor has one gesture — pinch, or scroll — and it runs the whole piece:
 *
 *     t=0 ─────────────────────────────────────────── t=1
 *     REGION            DISTRICT              BLOCK
 *     the circle        Wat Ket               a shophouse
 *     4.10 bn people    2.98 km²              one doorstep
 *
 * Pure, and tested, for the reason camera.ts is: "the handover happens at the wrong
 * moment" is a numeric bug with no stack trace.
 *
 * ---
 *
 * THIS IS NOT THE TIME SLIDER CUT ON 12 SEP 2026.
 *
 * A scalar in [0,1] that the visitor scrubs looks exactly like the thing that was
 * cut, and this project has already demonstrated that a rule on its own does not
 * hold — the programme-context file was committed within the hour of the rule
 * forbidding it. So, explicitly:
 *
 *   - `t` is DERIVED from camera zoom. It is not a control and has no UI.
 *   - It carries no temporal meaning. It is a scale, not a date.
 *   - No scene state is ever partially applied at an intermediate `t`. The
 *     registers crossfade; the scenario does not interpolate.
 *   - Edits still carry no date, and scene.ts's FORBIDDEN_EDIT_FIELDS guard is
 *     untouched.
 *
 * The 2026 → 2045 transition is a separate two-value `era` state in the viewer,
 * fired once by the on-ramp. See docs/architecture.md, "Registers".
 *
 * ---
 *
 * TWO FRAMES, THREE REGISTERS. DISTRICT and BLOCK are the same geometry in the
 * same frame and differ only in what is emphasised, so there is exactly ONE
 * handover to build, not two. That halves the hard part, and it is why `collapse`
 * below has no counterpart at the block end.
 */

import type { Bounds, CameraFit, Viewport } from './camera';
import { ISO_PITCH } from './camera';

export type RegisterId = 'region' | 'district' | 'block';

/**
 * Every band edge, in one block, because they are tuned together by eye and
 * changing one in isolation is how a black frame gets introduced.
 *
 * `t` anchors: region at 0, district at 0.5, block at 1.
 */
const BANDS = {
  /** Below this the region owns the screen outright. */
  regionHold: 0.3,
  /** Above this the district owns it. Between the two is the handover. */
  districtHold: 0.42,
  /** Where hero emphasis starts giving way to individual buildings. */
  detailFrom: 0.62,
  /** Where every building is drawn at full detail. */
  detailTo: 0.85,
} as const;

/**
 * Sub-bands within the handover, all driven by `collapse`.
 *
 * The ordering is the whole effect: the ground arrives BEFORE the diorama has
 * faded, so the district reads as descending onto the continent rather than
 * dissolving into a void. Opening the region's fade after the district's would
 * produce a frame with nothing in it, which on a projector looks like a crash.
 */
const HANDOVER = {
  regionFadeFrom: 0.05,
  regionFadeTo: 0.4,
  markerFadeFrom: 0.5,
  markerFadeTo: 0.85,
  districtFadeFrom: 0.7,
  districtFadeTo: 1.0,
} as const;

/** How much wider than the district the region sits. Tuned by eye; see the plan. */
export const DEFAULT_REGION_OUT = 8;

/**
 * How much more than the circle the region register frames.
 *
 * 1 would fit the circle exactly to the screen, which is what it did until the
 * world field existed — and it made the claim unfalsifiable. "Half of humanity
 * lives inside this circle" is only a claim a visitor can weigh if they can SEE
 * that there is a world outside it and that the world outside is emptier. A circle
 * that fills the frame is just a picture of Asia.
 *
 * At 1.7 the circle occupies about 60% of the shorter screen axis, with Europe,
 * east Africa, Australia and the open Pacific around it. The visitor can keep
 * pulling back from there to the whole planet — see `worldMinZoom`.
 */
export const REGION_MARGIN = 1.7;

/** How far in the block register reaches. Unchanged from the original MapControls cap. */
export const DEFAULT_BLOCK_IN = 40;

/** How dark the stock goes at district scale. Tuned by eye; 0 would be a silhouette. */
const STOCK_TINT_FLOOR = 0.62;

/** Pixels per stage unit at each anchor. `district` is today's isometricFit zoom. */
export interface ZoomLadder {
  region: number;
  district: number;
  block: number;
  hasRegion: boolean;
}

export interface RegisterState {
  t: number;
  /** Which register owns the DOM chrome. Ties resolve to the more zoomed-out one. */
  active: RegisterId;
  /** 1 fully collapsed onto the region plane, 0 fully district-sized. */
  collapse: number;
  regionOpacity: number;
  districtOpacity: number;
  /** The pin at the scene origin's true position on the circle. */
  markerOpacity: number;
  /** 0 at district-fit, 1 at block-fit. Hero emphasis, label density, pin scale. */
  detail: number;
  /** True while the handover owns the camera target — pan is disabled. */
  railed: boolean;
}

export interface FrameTransform {
  scale: number;
  position: [number, number, number];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Hermite smoothstep. Zero derivative at both ends, so the fades have no visible seam. */
export function smoothstep(edge0: number, edge1: number, v: number): number {
  if (edge1 === edge0) return v < edge0 ? 0 : 1;
  const u = clamp01((v - edge0) / (edge1 - edge0));
  return u * u * (3 - 2 * u);
}

/**
 * The three zoom anchors.
 *
 * A scene with no `region` gets a two-anchor ladder whose region slot degenerates
 * to the original "out to twice the district" cap — so a second neighbourhood with
 * no population raster still works, and still cannot reach a register that has
 * nothing in it.
 */
export function zoomLadder(
  districtFit: number,
  opts: { regionOut?: number; blockIn?: number; hasRegion?: boolean } = {},
): ZoomLadder {
  const {
    regionOut = DEFAULT_REGION_OUT,
    blockIn = DEFAULT_BLOCK_IN,
    hasRegion = true,
  } = opts;

  return {
    region: districtFit / (hasRegion ? regionOut : 2),
    district: districtFit,
    block: districtFit * blockIn,
    hasRegion,
  };
}

/**
 * Zoom to rail position: piecewise-logarithmic, pinned so district is exactly 0.5.
 *
 * Logarithmic because zoom is multiplicative — a linear map would spend almost the
 * whole rail in the last doubling and the region register would be a hairline at
 * the very end of the scroll. Piecewise because the two halves span very different
 * factors (8x out, 40x in) and pinning the district anchor is what lets the chips
 * and the attract loop address a register by name.
 */
export function zoomToT(zoom: number, ladder: ZoomLadder): number {
  const z = Math.max(Number.MIN_VALUE, zoom);

  if (z <= ladder.district) {
    const span = Math.log(ladder.district / ladder.region);
    if (!(span > 0)) return 0.5;
    return clamp01(0.5 * (1 - Math.log(ladder.district / z) / span));
  }

  const span = Math.log(ladder.block / ladder.district);
  if (!(span > 0)) return 0.5;
  return clamp01(0.5 + 0.5 * (Math.log(z / ladder.district) / span));
}

/** The exact inverse. The register chips and the attract loop steer by `t`. */
export function tToZoom(t: number, ladder: ZoomLadder): number {
  const u = clamp01(t);
  // Pinned exactly, not approximately: a 0.4999 landing leaves `active` one frame
  // off the register the visitor just asked for.
  if (u === 0.5) return ladder.district;
  if (u < 0.5) return ladder.region * (ladder.district / ladder.region) ** (u / 0.5);
  return ladder.district * (ladder.block / ladder.district) ** ((u - 0.5) / 0.5);
}

/** Everything the renderer needs for one frame, from one number. */
export function registerState(zoom: number, ladder: ZoomLadder): RegisterState {
  const t = zoomToT(zoom, ladder);

  const collapse = ladder.hasRegion
    ? 1 - smoothstep(BANDS.regionHold, BANDS.districtHold, t)
    : 0;

  const regionOpacity = ladder.hasRegion
    ? smoothstep(HANDOVER.regionFadeFrom, HANDOVER.regionFadeTo, collapse)
    : 0;

  const districtOpacity =
    1 - smoothstep(HANDOVER.districtFadeFrom, HANDOVER.districtFadeTo, collapse);

  const markerOpacity = ladder.hasRegion
    ? smoothstep(HANDOVER.markerFadeFrom, HANDOVER.markerFadeTo, collapse)
    : 0;

  // Ties resolve outward: at exactly the district anchor the visitor is in the
  // district, not the block, which is what the chip highlighting should say.
  const active: RegisterId =
    collapse >= 1 ? 'region' : t >= BANDS.detailTo ? 'block' : 'district';

  return {
    t,
    active,
    collapse,
    regionOpacity,
    districtOpacity,
    markerOpacity,
    detail: smoothstep(BANDS.detailFrom, BANDS.detailTo, t),
    railed: collapse > 0 && collapse < 1,
  };
}

/**
 * How far the ordinary building stock recedes so the hero buildings read.
 *
 * Returns a multiplier for the stock material's colour, which three.js multiplies
 * into the vertex colours — so this needs no shader and no second palette. At
 * district scale the stock drops back and the buildings that carry content stand
 * out; zooming in returns everything to full strength, because at block scale the
 * visitor is looking at individual buildings and dimming most of them is just a
 * dimmer scene.
 *
 * **With no heroes there is no emphasis.** Until hotspots are authored, every
 * building is stock, and dimming all of them would produce a murky diorama rather
 * than a legible one. So the effect switches itself off rather than degrading.
 */
export function stockTint(detail: number, heroCount: number): number {
  if (heroCount <= 0) return 1;
  return STOCK_TINT_FLOOR + (1 - STOCK_TINT_FLOOR) * clamp01(detail);
}

/**
 * Stage units per kilometre for the region group.
 *
 * The stage unit is a district metre, so this is the one constant that absorbs the
 * 2,500:1 scale gap. Deriving it rather than hard-coding it is what makes the region
 * register work for a second neighbourhood.
 *
 * It needs no viewport, and that is not an oversight. isometricFit's screen
 * footprint is always (spanX + spanZ)·√½ with the vertical a fixed multiple of it,
 * so the constraining axis is the same for a square region and a rectangular
 * district on every aspect ratio — phone portrait, laptop, and a projector of
 * unknown shape alike. The ratio of the two fits is exactly `regionOut` regardless.
 * That is a gift from the orthographic choice, and registers.test.ts pins it,
 * because it is precisely the sort of thing that would hold on a laptop and break
 * silently at the venue.
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
 * How far out MapControls may go, so the whole planet is reachable.
 *
 * Returns a zoom, not a factor, and it is relative to the region anchor rather than
 * absolute so it means the same on a phone and a projector. Pulling back past the
 * region anchor does not change register — `t` is already clamped at 0 and the
 * crossfade is long finished — so this adds reach without adding a state.
 */
export function worldMinZoom(
  ladder: ZoomLadder,
  radiusKm: number,
  worldRadiusKm: number,
  margin: number = REGION_MARGIN,
): number {
  if (!(worldRadiusKm > 0) || !(radiusKm > 0)) return ladder.region * 0.95;
  const framed = radiusKm * margin;
  if (worldRadiusKm <= framed) return ladder.region * 0.95;
  return ladder.region * (framed / worldRadiusKm);
}

/**
 * Where the district group sits, and how big, at a given collapse.
 *
 * At collapse 0 this is the exact identity — scale 1, sitting at its own centre —
 * so the render whenever no handover is happening is bit-for-bit what it is today.
 * That is a test, and it is the thing that makes this change safe to ship halfway.
 *
 * The scale interpolates in LOG space. Linearly, a 410x shrink spends the first
 * two-thirds of the band barely moving and then vanishes in the last few frames;
 * logarithmically it reads as one continuous zoom at a constant rate, which is the
 * whole illusion.
 */
export function districtTransform(
  collapse: number,
  districtCentre: [number, number],
  anchorStage: [number, number],
  sigma: number,
): FrameTransform {
  const u = clamp01(collapse);

  const scale = sigma > 0 ? Math.exp(u * Math.log(sigma)) : 1;

  return {
    scale,
    position: [
      districtCentre[0] + (anchorStage[0] - districtCentre[0]) * u,
      0,
      districtCentre[1] + (anchorStage[1] - districtCentre[1]) * u,
    ],
  };
}

/**
 * A camera frustum deep enough for BOTH frames.
 *
 * isometricFit stays untouched — it still decides where the camera sits and what
 * the district fit is. This only widens near/far so the region plane, which is
 * thousands of stage units across, is not clipped away the moment it fades in.
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

/** Exported for the debug overlay and the tests, so the bands have one home. */
export const REGISTER_BANDS = { ...BANDS, ...HANDOVER, ISO_PITCH } as const;
