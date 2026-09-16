import { describe, expect, it } from 'vitest';
import { easeInOutCubic, tweenPoint, tweenZoom } from '../tween';

describe('easeInOutCubic', () => {
  it('is pinned at both ends', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('is symmetric about the midpoint', () => {
    for (const u of [0.1, 0.25, 0.4]) {
      expect(easeInOutCubic(u)).toBeCloseTo(1 - easeInOutCubic(1 - u), 12);
    }
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
  });

  it('is monotone', () => {
    let previous = -1;
    for (let i = 0; i <= 100; i++) {
      const v = easeInOutCubic(i / 100);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
  });

  it('clamps rather than overshooting', () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});

describe('tweenZoom', () => {
  /** Linear would crawl across the continent then cover four doublings in three frames. */
  it('interpolates in log space — the midpoint is the geometric mean', () => {
    expect(tweenZoom(1, 100, 0.5)).toBeCloseTo(10, 9);
    expect(tweenZoom(2, 512, 0.5)).toBeCloseTo(32, 9);
  });

  it('is emphatically not the arithmetic midpoint', () => {
    expect(tweenZoom(1, 100, 0.5)).toBeLessThan((1 + 100) / 2);
  });

  it('hits its endpoints exactly, so a chip press lands on its register', () => {
    expect(tweenZoom(0.7, 91.3, 0)).toBe(0.7);
    expect(tweenZoom(0.7, 91.3, 1)).toBe(91.3);
  });

  it('is monotone across a realistic ladder', () => {
    let previous = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const v = tweenZoom(0.35, 14, i / 100);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
  });

  it('falls back to linear rather than returning NaN at a non-positive zoom', () => {
    expect(Number.isFinite(tweenZoom(0, 10, 0.5))).toBe(true);
    expect(Number.isFinite(tweenZoom(-1, 10, 0.5))).toBe(true);
  });

  it('clamps outside [0,1]', () => {
    expect(tweenZoom(2, 8, -1)).toBe(2);
    expect(tweenZoom(2, 8, 5)).toBe(8);
  });
});

describe('tweenPoint', () => {
  it('moves the camera target linearly, and lands exactly', () => {
    expect(tweenPoint([0, 0, 0], [10, 0, -20], 0.5)).toEqual([5, 0, -10]);
    expect(tweenPoint([0, 0, 0], [10, 0, -20], 1)).toEqual([10, 0, -20]);
    expect(tweenPoint([1, 2, 3], [10, 0, -20], 0)).toEqual([1, 2, 3]);
  });

  it('clamps rather than flying past the target', () => {
    expect(tweenPoint([0, 0, 0], [10, 0, 0], 3)).toEqual([10, 0, 0]);
  });
});
