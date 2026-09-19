import { describe, expect, it } from 'vitest';
import {
  RELIEF_FEATHER_M,
  RELIEF_FLAT_M,
  decodeRelief,
  distanceOutside,
  reliefColour,
  reliefHeights,
  reliefShade,
  reliefVertexAt,
} from '../relief';
import type { ReliefMeta } from '../relief';

/** A 16-cell grid of 1 km cells over ±8 km, plain at 300 m. */
const META: ReliefMeta = {
  encoding: { min: 250, max: 1650 },
  grid: { size: 16, cellM: 1000, bboxM: [-8000, -8000, 8000, 8000] },
  base: 300,
};

/** A field that is the plain everywhere except a 1,000 m ridge along the west edge. */
function field(): Float32Array {
  const f = new Float32Array(16 * 16).fill(310);
  for (let i = 0; i < 16; i++) f[i * 16] = 1300;
  return f;
}

const SCENE: [number, number, number, number] = [-2000, -3000, 2000, 3000];

describe('decodeRelief', () => {
  it('maps the two channels linearly between min and max', () => {
    // Four RGBA pixels: 0, 65535, 32768 and 256.
    const bytes = new Uint8Array([
      0x00, 0x00, 0, 255,
      0xff, 0xff, 0, 255,
      0x80, 0x00, 0, 255,
      0x01, 0x00, 0, 255,
    ]);
    const out = decodeRelief(bytes, 2, 100, 1100);
    expect(out[0]).toBe(100);
    expect(out[1]).toBe(1100);
    expect(out[2]).toBeCloseTo(600, 0);
    expect(out[3]).toBeCloseTo(103.9, 1);
  });
});

describe('reliefVertexAt', () => {
  it('puts row 0 at the north edge and column 0 at the west edge, at cell centres', () => {
    expect(reliefVertexAt(META, 0, 0)).toEqual([-7500, 7500]);
    expect(reliefVertexAt(META, 15, 15)).toEqual([7500, -7500]);
  });
});

describe('distanceOutside', () => {
  it('is zero inside and on the edge, Euclidean beyond', () => {
    expect(distanceOutside([0, 0], SCENE)).toBe(0);
    expect(distanceOutside([2000, 0], SCENE)).toBe(0);
    expect(distanceOutside([2300, 0], SCENE)).toBe(300);
    expect(distanceOutside([2300, 3400], SCENE)).toBeCloseTo(500);
  });
});

describe('reliefHeights', () => {
  const heights = reliefHeights(field(), META, SCENE);
  const at = (i: number, j: number) => heights[i * 16 + j];

  it('is exactly the flat level under the scene rectangle', () => {
    // (7,7) and (8,8) are the cells nearest the origin, well inside ±2 km × ±3 km.
    expect(at(7, 7)).toBeCloseTo(RELIEF_FLAT_M, 5);
    expect(at(8, 8)).toBeCloseTo(RELIEF_FLAT_M, 5);
  });

  it('is the field minus the base beyond the feather', () => {
    // The west ridge column at x = -7,500 is 5,500 m past the rectangle's west edge.
    expect(at(7, 0)).toBeCloseTo(1000);
    // The plain far to the east.
    expect(at(7, 15)).toBeCloseTo(10);
  });

  it('feathers monotonically between the two', () => {
    // Walk east from the rectangle's edge with a finer meta so several vertices
    // fall inside the feather.
    const fine: ReliefMeta = {
      ...META,
      grid: { size: 64, cellM: 250, bboxM: [-8000, -8000, 8000, 8000] },
    };
    const f = new Float32Array(64 * 64).fill(400); // 100 m above the plain everywhere
    const h = reliefHeights(f, fine, SCENE);
    const row = 32; // y = -125, inside the rectangle's north–south span
    const values: number[] = [];
    for (let j = 40; j < 43; j++) values.push(h[row * 64 + j]); // x = 2,125, 2,375, 2,625
    for (let k = 1; k < values.length; k++) expect(values[k]).toBeGreaterThan(values[k - 1]);
    expect(values[0]).toBeGreaterThan(RELIEF_FLAT_M);
    expect(values[1]).toBeLessThan(100);
    expect(h[row * 64 + 43]).toBeCloseTo(100); // x = 2,875, past the 600 m feather
    expect(RELIEF_FEATHER_M).toBe(600);
  });

  it('honours a custom flat level and feather', () => {
    const h = reliefHeights(field(), META, SCENE, { flat: -5, feather: 1 });
    expect(h[7 * 16 + 7]).toBeCloseTo(-5, 5);
    expect(h[7 * 16 + 15]).toBeCloseTo(10);
  });
});

describe('colour and shade', () => {
  it('climbs the ramp with height and clamps at the top', () => {
    const plain = reliefColour(0);
    const mid = reliefColour(700);
    const top = reliefColour(5000);
    expect(plain).not.toEqual(mid);
    expect(top).toEqual(reliefColour(1400));
    for (const c of [...plain, ...mid, ...top]) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(255);
    }
  });

  it('darkens steeper faces and never goes black', () => {
    expect(reliefShade(1)).toBe(1);
    expect(reliefShade(0)).toBeCloseTo(0.7);
    expect(reliefShade(-1)).toBeCloseTo(0.7);
    expect(reliefShade(0.5)).toBeGreaterThan(reliefShade(0.2));
  });
});
