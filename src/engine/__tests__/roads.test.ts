import { describe, expect, it } from 'vitest';
import { drawRoads, metresToPixels, roadTextureLayout } from '../roads';
import type { StrokeContext, TextureLayout } from '../roads';
import type { BaselineRoad } from '../scene';

/** Records what was drawn, so the drawing can be asserted without a DOM. */
function fakeContext() {
  const calls: { width: number; style: string; points: [number, number][] }[] = [];
  let current: (typeof calls)[number] | null = null;

  const ctx: StrokeContext & { calls: typeof calls } = {
    lineCap: '',
    lineJoin: '',
    lineWidth: 0,
    strokeStyle: '',
    beginPath() {
      current = { width: ctx.lineWidth, style: String(ctx.strokeStyle), points: [] };
    },
    moveTo(x, y) {
      if (current) current.points.push([x, y]);
    },
    lineTo(x, y) {
      if (current) current.points.push([x, y]);
    },
    stroke() {
      if (current) {
        current.width = ctx.lineWidth;
        current.style = String(ctx.strokeStyle);
        calls.push(current);
      }
      current = null;
    },
    calls,
  };
  return ctx;
}

describe('roadTextureLayout', () => {
  it('caps the long edge and keeps pixels square', () => {
    const layout = roadTextureLayout([-500, -1600, 1000, 1100], 2048);
    expect(Math.max(layout.width, layout.height)).toBe(2048);
    // 1500 x 2700 m plus padding: taller than it is wide, and in proportion.
    expect(layout.height).toBeGreaterThan(layout.width);
    expect(layout.width / layout.height).toBeCloseTo(1520 / 2720, 2);
  });

  it('pads the bounds so an edge road is not sliced', () => {
    const layout = roadTextureLayout([0, 0, 100, 100], 256);
    expect(layout.bounds[0]).toBeLessThan(0);
    expect(layout.bounds[2]).toBeGreaterThan(100);
  });

  it('never produces a zero-sized texture from a degenerate extent', () => {
    const layout = roadTextureLayout([0, 0, 0, 0], 256);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    expect(Number.isFinite(layout.metresPerPixel)).toBe(true);
  });
});

describe('metresToPixels', () => {
  const layout: TextureLayout = {
    width: 100,
    height: 100,
    metresPerPixel: 1,
    bounds: [0, 0, 100, 100],
  };

  it('flips north onto a downward pixel axis', () => {
    // North-west corner of the world is the top-left of the texture.
    expect(metresToPixels([0, 100], layout)).toEqual([0, 0]);
    // South-west corner is bottom-left.
    expect(metresToPixels([0, 0], layout)).toEqual([0, 100]);
    // Moving north must DECREASE the pixel y.
    expect(metresToPixels([50, 75], layout)[1]).toBeLessThan(
      metresToPixels([50, 25], layout)[1],
    );
  });

  it('does not mirror east and west', () => {
    expect(metresToPixels([80, 50], layout)[0]).toBeGreaterThan(
      metresToPixels([20, 50], layout)[0],
    );
  });
});

describe('drawRoads', () => {
  const layout = roadTextureLayout([0, 0, 100, 100], 100);

  const road = (id: string, kind: string, width: number): BaselineRoad => ({
    id,
    kind,
    width,
    path: [
      [10, 10],
      [90, 90],
    ],
  });

  it('draws widest first, so a main road wins its junctions', () => {
    const ctx = fakeContext();
    drawRoads(
      ctx,
      [road('a', 'path', 2), road('b', 'major', 12), road('c', 'street', 6)],
      layout,
      () => '#000',
    );
    expect(ctx.calls.map((c) => c.width)).toEqual(
      [...ctx.calls.map((c) => c.width)].sort((x, y) => y - x),
    );
  });

  it('gives a thin path a visible minimum stroke', () => {
    const coarse = roadTextureLayout([0, 0, 4000, 4000], 64);
    const ctx = fakeContext();
    drawRoads(ctx, [road('a', 'path', 1.8)], coarse, () => '#000');
    expect(ctx.calls[0].width).toBeGreaterThanOrEqual(1.25);
  });

  it('takes its colour from the tone function, by kind', () => {
    const ctx = fakeContext();
    drawRoads(ctx, [road('a', 'major', 12)], layout, (k) => (k === 'major' ? '#111' : '#999'));
    expect(ctx.calls[0].style).toBe('#111');
  });

  it('skips a degenerate path rather than drawing a dot', () => {
    const ctx = fakeContext();
    drawRoads(ctx, [{ id: 'x', kind: 'street', width: 6, path: [[1, 1]] }], layout, () => '#000');
    expect(ctx.calls).toHaveLength(0);
  });
});
