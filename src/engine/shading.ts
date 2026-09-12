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
