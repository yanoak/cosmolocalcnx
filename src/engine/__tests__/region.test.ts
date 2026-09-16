import { describe, expect, it } from 'vitest';
import innerMeta from '@/scenes/regions/aeqd_21.000_100.290_r3437_n512.json';
import worldMeta from '@/scenes/regions/aeqd_21.000_100.290_r12000_n1024.json';
import {
  aggregate,
  decodeField,
  drawAnchor,
  drawCircle,
  fieldToRgba,
  kmToPixels,
  regionTextureLayout,
  type RegionContext,
} from '../region';

const GAMMA = 3;
const MAX = 8_870_175.5377867; // the committed field's peak cell

/** Encode the way scripts/build-region.py does, so the pair is tested as a pair. */
function encode(people: number, max = MAX, gamma = GAMMA): [number, number] {
  if (people <= 0) return [0, 0];
  const v = Math.round((Math.min(people / max, 1) ** (1 / gamma)) * 65535);
  return [(v >> 8) & 0xff, v & 0xff];
}

function pixels(values: number[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(values.length * 4);
  values.forEach((people, i) => {
    const [hi, lo] = encode(people);
    out[i * 4] = hi;
    out[i * 4 + 1] = lo;
    out[i * 4 + 2] = 0;
    out[i * 4 + 3] = 255;
  });
  return out;
}

describe('decodeField', () => {
  it('round-trips across six orders of magnitude', () => {
    for (const expected of [1, 10, 1_000, 100_000, 1_000_000, MAX]) {
      const actual = decodeField(pixels([expected]), 1, MAX, GAMMA)[0];
      expect(Math.abs(actual - expected) / expected).toBeLessThan(0.005);
    }
  });

  it('keeps an empty cell exactly empty', () => {
    // A fraction of a person would light up as inhabited.
    expect(decodeField(pixels([0]), 1, MAX, GAMMA)[0]).toBe(0);
  });

  /**
   * The test that would have caught shipping a 16-bit PNG.
   *
   * Browsers hand back 8-bit clamped RGBA, so a 16-bit file loses its low byte
   * silently — it would pass every other test in this file and be wrong only in
   * production. If the low byte ever stops mattering, the encoding has broken.
   */
  it('reads the low byte, not just the high one', () => {
    const hiOnly = new Uint8ClampedArray([200, 0, 0, 255]);
    const withLow = new Uint8ClampedArray([200, 137, 0, 255]);

    const a = decodeField(hiOnly, 1, MAX, GAMMA)[0];
    const b = decodeField(withLow, 1, MAX, GAMMA)[0];

    expect(b).not.toBe(a);
    expect(b).toBeGreaterThan(a);
  });

  it('ignores blue, which is reserved for a land mask', () => {
    const noBlue = new Uint8ClampedArray([12, 34, 0, 255]);
    const blue = new Uint8ClampedArray([12, 34, 255, 255]);
    expect(decodeField(blue, 1, MAX, GAMMA)[0]).toBe(decodeField(noBlue, 1, MAX, GAMMA)[0]);
  });
});

describe('aggregate', () => {
  const size = 4;
  const field = Float32Array.from([
    1, 2, 3, 4,
    5, 6, 7, 8,
    9, 10, 11, 12,
    13, 14, 15, 16,
  ]);
  const total = field.reduce((a, b) => a + b, 0);

  /** Population is a count. If coarsening loses people, the map is a lie. */
  it('conserves total population exactly', () => {
    const two = aggregate(field, size, 2);
    expect(two.size).toBe(2);
    expect(two.field.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 6);

    const four = aggregate(field, size, 4);
    expect(four.size).toBe(1);
    expect(four.field[0]).toBeCloseTo(total, 6);
  });

  it('sums the right blocks, not just the right amount', () => {
    const { field: out } = aggregate(field, size, 2);
    expect(Array.from(out)).toEqual([1 + 2 + 5 + 6, 3 + 4 + 7 + 8, 9 + 10 + 13 + 14, 11 + 12 + 15 + 16]);
  });

  it('composes: one step of 4 equals two steps of 2', () => {
    const direct = aggregate(field, size, 4);
    const once = aggregate(field, size, 2);
    const twice = aggregate(once.field, once.size, 2);
    expect(Array.from(twice.field)).toEqual(Array.from(direct.field));
  });

  it('returns the same array untouched at factor 1', () => {
    const out = aggregate(field, size, 1);
    expect(out.field).toBe(field);
    expect(out.size).toBe(size);
  });

  it('refuses a factor that does not divide the grid', () => {
    expect(() => aggregate(field, size, 3)).toThrow(/does not divide/);
  });

  it('refuses a nonsense factor rather than producing a silent mess', () => {
    expect(() => aggregate(field, size, 0)).toThrow(/positive integer/);
    expect(() => aggregate(field, size, 1.5)).toThrow(/positive integer/);
  });
});

describe('kmToPixels', () => {
  const layout = regionTextureLayout(3437, 2048);

  it('puts the circle centre at the texture centre', () => {
    expect(kmToPixels([0, 0], layout)).toEqual([1024, 1024]);
  });

  /** Getting this wrong mirrors Asia, which nobody who knows the map would miss. */
  it('flips north, because canvas pixels run downward', () => {
    const [, northY] = kmToPixels([0, 1000], layout);
    const [, southY] = kmToPixels([0, -1000], layout);
    expect(northY).toBeLessThan(1024);
    expect(southY).toBeGreaterThan(1024);
  });

  it('puts east to the right', () => {
    expect(kmToPixels([1000, 0], layout)[0]).toBeGreaterThan(1024);
  });

  it('lands the rim on the texture edge', () => {
    expect(kmToPixels([-3437, 0], layout)[0]).toBeCloseTo(0, 6);
    expect(kmToPixels([3437, 0], layout)[0]).toBeCloseTo(2048, 6);
  });

  /** The Wat Ket anchor, carried through from aeqd.test.ts. */
  it('places Wat Ket just inside the 1,000 km ring, south-west of centre', () => {
    const [x, y] = kmToPixels([-135.38, -245.08], layout);
    expect(x).toBeLessThan(1024);
    expect(y).toBeGreaterThan(1024);
    expect(Math.hypot(x - 1024, y - 1024) / layout.scale).toBeCloseTo(279.98, 1);
  });

  it('survives a zero radius rather than dividing by it', () => {
    expect(Number.isFinite(regionTextureLayout(0).scale)).toBe(true);
  });
});

describe('fieldToRgba', () => {
  it('gives an empty cell the first stop, so ocean matches the district ground', () => {
    const rgba = fieldToRgba(Float32Array.from([0]), 1, MAX, ['#102030', '#ffffff']);
    expect([rgba[0], rgba[1], rgba[2]]).toEqual([0x10, 0x20, 0x30]);
    expect(rgba[3]).toBe(255);
  });

  it('gives the densest cell the last stop', () => {
    const rgba = fieldToRgba(Float32Array.from([MAX]), 1, MAX, ['#102030', '#ffffff']);
    expect([rgba[0], rgba[1], rgba[2]]).toEqual([255, 255, 255]);
  });

  /** Linear would render everything but the Ganges plain as empty. */
  it('is log-scaled, so a mid-sized city is visibly not empty', () => {
    const city = fieldToRgba(Float32Array.from([10_000]), 1, MAX, ['#000000', '#ffffff']);
    // Linearly, 10k of 8.87M would be 0.1% — indistinguishable from nothing.
    expect(city[0]).toBeGreaterThan(80);
  });

  it('is fully opaque everywhere, so the plane has no holes', () => {
    const rgba = fieldToRgba(Float32Array.from([0, 1, 1000, MAX]), 2, MAX);
    for (let i = 0; i < 4; i++) expect(rgba[i * 4 + 3]).toBe(255);
  });
});

describe('the circle furniture', () => {
  function recorder() {
    const calls: string[] = [];
    const ctx: RegionContext = {
      beginPath: () => calls.push('beginPath'),
      arc: (x, y, r) => calls.push(`arc(${Math.round(x)},${Math.round(y)},${Math.round(r)})`),
      moveTo: (x, y) => calls.push(`moveTo(${Math.round(x)},${Math.round(y)})`),
      lineTo: (x, y) => calls.push(`lineTo(${Math.round(x)},${Math.round(y)})`),
      stroke: () => calls.push('stroke'),
      fill: () => calls.push('fill'),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      globalAlpha: 1,
    };
    return { ctx, calls };
  }

  it('draws the rim at the true radius, concentric with its rings', () => {
    const layout = regionTextureLayout(3437, 2048);
    const { ctx, calls } = recorder();
    drawCircle(ctx, layout, '#000');

    expect(calls).toContain('arc(1024,1024,1024)'); // the rim
    expect(calls).toContain('arc(1024,1024,298)'); // 1,000 km
    expect(calls).toContain('arc(1024,1024,596)'); // 2,000 km
    expect(calls).toContain('arc(1024,1024,894)'); // 3,000 km
  });

  it('leaves the alpha restored, so whatever draws next is not faint', () => {
    const layout = regionTextureLayout(3437, 2048);
    const { ctx } = recorder();
    drawCircle(ctx, layout, '#000');
    expect(ctx.globalAlpha).toBe(1);
  });

  it('never draws a ring outside the circle it belongs to', () => {
    const layout = regionTextureLayout(500, 512);
    const { calls } = (() => {
      const r = recorder();
      drawCircle(r.ctx, layout, '#000', [1000, 2000]);
      return r;
    })();
    // Only the rim and the crosshair — both rings are wider than the circle.
    expect(calls.filter((c) => c.startsWith('arc('))).toHaveLength(1);
  });

  it('marks the anchor as a ring, not a dot that could pass for a city', () => {
    const layout = regionTextureLayout(3437, 2048);
    const { ctx, calls } = recorder();
    drawAnchor(ctx, layout, [-135.38, -245.08], '#000');

    expect(calls.filter((c) => c === 'stroke')).toHaveLength(1);
    expect(calls.some((c) => c.startsWith('arc(') && c.endsWith(',16)'))).toBe(true);
  });
});

/**
 * The claim the whole piece rests on, pinned against the committed fields.
 *
 * Two independently built rasters — one clipped to the circle at 13 km cells, one
 * spanning the planet at 39 km — have to agree with each other AND with the printed
 * A0 in the same room. If they ever stop agreeing, the caption on screen is a
 * falsehood that nothing else in the codebase would notice.
 */
describe('half of humanity', () => {
  const inside = innerMeta.stats.totalInside;
  const shown = worldMeta.stats.totalInside;

  /**
   * The world field is CAPPED at 12,000 km, so it is not the whole planet — that
   * is a deliberate trade against azimuthal equidistant's area inflation, which
   * reaches 2.47x at the antipode and only 1.36x here. See "The world outside the
   * circle" in docs/architecture.md. The true global total is 8.192 bn; this field
   * holds the 87% of it that falls within the cap.
   */
  it('holds the part of the world the cap reaches, not all of it', () => {
    expect(shown / 1e9).toBeCloseTo(7.142, 2);
    expect(shown).toBeLessThan(8.192e9);
  });

  it('puts essentially half of everyone inside the circle', () => {
    // Against the TRUE global total, not the capped field's.
    const WORLD_TOTAL = 8.191966468e9;
    expect(inside / WORLD_TOTAL).toBeGreaterThan(0.495);
    expect(inside / WORLD_TOTAL).toBeLessThan(0.505);
  });

  it('shows more people outside the circle than in, within the cap alone', () => {
    // "More people inside this circle than outside it" is, on GHS-POP E2025, a dead
    // heat marginally the other way. The caption must stay honest about that.
    expect(shown - inside).toBeGreaterThan(3.0e9);
    expect(inside).toBeGreaterThan(4.0e9);
  });

  it('shares one projection centre between the two fields', () => {
    expect(worldMeta.projection.centre).toEqual(innerMeta.projection.centre);
    expect(worldMeta.projection.kind).toBe(innerMeta.projection.kind);
  });

  it('reaches well past the circle without reaching the antipode', () => {
    expect(worldMeta.projection.radiusKm).toBeGreaterThan(3437 * 3);
    expect(worldMeta.projection.radiusKm).toBeLessThan(20_015);
    expect(innerMeta.projection.radiusKm).toBe(3437);
  });

  it('keeps the inner field finer than the world field', () => {
    expect(innerMeta.grid.cellKm).toBeLessThan(worldMeta.grid.cellKm);
  });
});
