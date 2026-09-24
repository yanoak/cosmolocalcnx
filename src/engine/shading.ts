/**
 * Which ramp tone a face gets, from its normal.
 *
 * Materials are unlit — form comes from face orientation rather than from lights,
 * which keeps a token literally the pixel it produces. See docs/design-system.md.
 *
 * Pure and separate from three.js so the decision can be tested without a canvas.
 */

import { rightness } from './camera';

export type Tone = 'top' | 'side' | 'shade';

/**
 * A wall is shaded when it faces LEFT of the screen by more than this — sin(15°).
 *
 * On the diagonal the two visible walls face the camera's right (east) and left
 * (south), so the split falls cleanly between them and the dead band never bites. It
 * is there for a camera turned nearer north-up, where every visible wall faces the
 * camera and a split at exactly zero would run through the south wall of every
 * building — two neighbours a degree apart on the OSM grid in different tones.
 */
const SHADE_BELOW = -Math.sin(Math.PI / 12);

export function toneForNormal(x: number, y: number, z: number): Tone {
  const length = Math.hypot(x, y, z) || 1;
  const ny = y / length;

  // Upward-facing surfaces read as roofs.
  if (ny > 0.5) return 'top';

  // Walls split by which way they face on screen, in the basis `camera.ts` fixes.
  // Giving them different tones is what stops a building reading as a flat silhouette.
  return rightness(x / length, ny, z / length) < SHADE_BELOW ? 'shade' : 'side';
}

// ------------------------------------------------------------- emphasis

/** How far the stock recedes at district scale. Never a silhouette. */
const STOCK_TINT_FLOOR = 0.62;

/**
 * The tint on every non-hero building, by how far in the visitor is.
 *
 * At district scale the stock recedes so the heroes read; at block scale the visitor is
 * looking at individual buildings and dimming most of them is just a dimmer scene.
 *
 * **With no heroes there is no emphasis.** Until hotspots are authored every building
 * is stock, and dimming all of them would produce a murky diorama rather than a legible
 * one — so the effect switches itself off rather than degrading. Moved here from
 * `registers.ts` on 24 Sep 2026; it was the only thing in that module about appearance.
 */
export function stockTint(detail: number, heroCount: number): number {
  if (heroCount <= 0) return 1;
  const d = detail < 0 ? 0 : detail > 1 ? 1 : detail;
  return STOCK_TINT_FLOOR + (1 - STOCK_TINT_FLOOR) * d;
}
