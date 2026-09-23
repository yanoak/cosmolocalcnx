/**
 * Which ramp tone a face gets, from its normal.
 *
 * Materials are unlit — form comes from face orientation rather than from lights,
 * which keeps a token literally the pixel it produces. See docs/design-system.md.
 *
 * Pure and separate from three.js so the decision can be tested without a canvas.
 */

export type Tone = 'top' | 'side' | 'shade';

export function toneForNormal(x: number, y: number, z: number): Tone {
  const length = Math.hypot(x, y, z) || 1;
  const ny = y / length;

  // Upward-facing surfaces read as roofs.
  if (ny > 0.5) return 'top';

  // The camera looks down the (1, 1, 1) diagonal, so +x and +z are the two walls a
  // visitor can see. Giving them different tones is what stops a building reading
  // as a flat silhouette.
  return x / length > z / length ? 'side' : 'shade';
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
