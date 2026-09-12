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
