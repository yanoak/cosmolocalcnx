import { describe, expect, it } from 'vitest';
import { toneForNormal } from '@/engine/shading';

describe('toneForNormal', () => {
  it('gives upward faces the top tone', () => {
    expect(toneForNormal(0, 1, 0)).toBe('top');
  });

  it('splits the two camera-facing vertical faces', () => {
    // The camera sits at 45deg, so +x and +z are the two visible walls.
    // They must differ or every building reads as a flat silhouette.
    expect(toneForNormal(1, 0, 0)).toBe('side');
    expect(toneForNormal(0, 0, 1)).toBe('shade');
    expect(toneForNormal(1, 0, 0)).not.toBe(toneForNormal(0, 0, 1));
  });

  it('gives downward faces a tone rather than undefined', () => {
    expect(['top', 'side', 'shade']).toContain(toneForNormal(0, -1, 0));
  });

  it('handles unnormalised input', () => {
    expect(toneForNormal(0, 5, 0)).toBe('top');
  });
});

import { stockTint } from '../shading';

/** Migrated from registers.test.ts on 24 Sep 2026. */
describe('stockTint', () => {
  it('switches itself off entirely when nothing is a hero', () => {
    for (const detail of [0, 0.25, 0.5, 0.75, 1]) expect(stockTint(detail, 0)).toBe(1);
  });

  it('recedes the stock at district scale and restores it at block scale', () => {
    expect(stockTint(0, 8)).toBeLessThan(1);
    expect(stockTint(1, 8)).toBe(1);
  });

  it('is monotone in detail, so the stock never brightens on the way in', () => {
    let previous = -1;
    for (let i = 0; i <= 50; i++) {
      const tint = stockTint(i / 50, 8);
      expect(tint).toBeGreaterThanOrEqual(previous);
      previous = tint;
    }
  });

  it('never goes to a silhouette, however far out the visitor is', () => {
    expect(stockTint(-5, 8)).toBeGreaterThan(0.5);
  });
});
