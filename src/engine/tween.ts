/**
 * Easing and interpolation for the register chips and the attract loop.
 *
 * Deliberately small, and separate from `registers.ts`, because the two answer
 * different questions. The crossfade is a pure function of camera zoom and needs no
 * clock at all — every pinch already produces a frame. Only a jump the visitor did
 * not make with their fingers needs to be animated over time: pressing a register
 * chip. (It also served an on-ramp that played the whole rail on load; both went.)
 */

/** Smooth at both ends, linear through the middle. */
export function easeInOutCubic(u: number): number {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Interpolate zoom in LOG space.
 *
 * Zoom is multiplicative — it is pixels per world unit — so a linear lerp from the
 * circle to a shophouse spends most of its duration crawling across the continent
 * and then covers the last four doublings in three frames. Geometric interpolation
 * is what makes a jump read as one continuous movement at a constant rate.
 */
export function tweenZoom(from: number, to: number, u: number): number {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  // Pinned exactly: a 0.9999 landing leaves `t` a hair off a register boundary, and
  // the chip the visitor just pressed does not light up.
  if (t === 0) return from;
  if (t === 1) return to;
  if (from <= 0 || to <= 0) return from + (to - from) * t;
  return from * (to / from) ** t;
}

export function tweenPoint(
  from: [number, number, number],
  to: [number, number, number],
  u: number,
): [number, number, number] {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}
