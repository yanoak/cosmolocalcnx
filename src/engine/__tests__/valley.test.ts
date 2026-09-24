import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RELIEF_HILLSHADE } from '@/engine/theme';
import {
  cityMarkerAt,
  cityPatchExtent,
  valleyHeights,
  valleyRowOf,
  valleySide,
  valleyTriangles,
  valleyVertexAt,
  VALLEY_EXAGGERATION,
  VALLEY_STRIDE,
  hillshadeColour,
  HILLSHADE_FLOOR,
  PING,
  STROKE_PX,
  waterwayWeight,
} from '../valley';
import { reliefHeights, type ReliefMeta } from '../relief';

/**
 * Float32Array cannot hold 308.3 exactly, so heights come back a hundred-thousandth out.
 * Four decimal places is well inside a metre and well outside the noise.
 */
const F32 = 4;

const META: ReliefMeta = {
  encoding: { min: 264, max: 2565 },
  grid: { size: 512, cellM: 234.375, bboxM: [-60000, -60000, 60000, 60000] },
  base: 308.3,
};

describe('valleyHeights', () => {
  it('measures from the plain the city stands on', () => {
    const out = valleyHeights(Float32Array.from([META.base]), META, 1);
    expect(out[0]).toBeCloseTo(0, F32);
  });

  it('exaggerates, because 1.4 km of relief across 120 km is otherwise a flat sheet', () => {
    const out = valleyHeights(Float32Array.from([META.base + 1000]), META, 4);
    expect(out[0]).toBeCloseTo(4000, 2);
  });

  it('defaults to the stated exaggeration', () => {
    const out = valleyHeights(Float32Array.from([META.base + 100]), META);
    expect(out[0]).toBeCloseTo(100 * VALLEY_EXAGGERATION, 3);
  });

  /** The Ping's bed downstream is below the plain. That is correct, not something to clamp. */
  it('keeps ground below the plain negative', () => {
    const out = valleyHeights(Float32Array.from([264]), META);
    expect(out[0]).toBeLessThan(0);
  });

  it('is order-preserving, so the highest cell is still the peak', () => {
    const field = Float32Array.from([500, 300, 1200, 800]);
    const out = valleyHeights(field, META);
    const peak = [...out].indexOf(Math.max(...out));
    expect(peak).toBe(2);
  });

  /**
   * The distinction the whole module exists for. `reliefHeights` flattens the field under
   * the scene rectangle so the city's backdrop can never be a surface the diorama sits
   * on; the valley view must not flatten, because the topography IS the subject.
   */
  it('does NOT flatten under the scene rectangle, unlike reliefHeights', () => {
    const size = 4;
    const small: ReliefMeta = {
      encoding: { min: 0, max: 2000 },
      grid: { size, cellM: 1000, bboxM: [-2000, -2000, 2000, 2000] },
      base: 300,
    };
    const field = new Float32Array(size * size).fill(900);
    const scene: [number, number, number, number] = [-2000, -2000, 2000, 2000];

    const flattened = reliefHeights(field, small, scene);
    const valley = valleyHeights(field, small, 1);

    // Every cell is inside the rectangle, so the backdrop flattens all of them.
    expect([...flattened].every((h) => h < 0)).toBe(true);
    // The valley keeps the mountain.
    expect([...valley].every((h) => Math.abs(h - 600) < 1e-3)).toBe(true);
  });
});

describe('valleyVertexAt', () => {
  it('covers the full ±60 km box', () => {
    const { size } = META.grid;
    const first = valleyVertexAt(META, 0, 0);
    const last = valleyVertexAt(META, size - 1, size - 1);
    const half = META.grid.cellM / 2;

    expect(first[0]).toBeCloseTo(-60000 + half, 6);
    expect(first[1]).toBeCloseTo(60000 - half, 6);
    expect(last[0]).toBeCloseTo(60000 - half, 6);
    expect(last[1]).toBeCloseTo(-60000 + half, 6);
  });

  it('agrees with the backdrop field, so the two are concentric', () => {
    // Same origin, different half-widths: the centre of each is the scene origin.
    const centre = valleyVertexAt(META, META.grid.size / 2, META.grid.size / 2);
    expect(Math.abs(centre[0])).toBeLessThan(META.grid.cellM);
    expect(Math.abs(centre[1])).toBeLessThan(META.grid.cellM);
  });

  it('runs row zero from the north', () => {
    expect(valleyVertexAt(META, 0, 0)[1]).toBeGreaterThan(valleyVertexAt(META, 1, 0)[1]);
  });
});

describe('decimation', () => {
  it('snaps the last vertex to the edge so the field keeps its extent', () => {
    const size = 512;
    const side = valleySide(size);
    expect(valleyRowOf(0, size)).toBe(0);
    expect(valleyRowOf(side - 1, size)).toBe(size - 1);
  });

  it('never samples outside the field', () => {
    const size = 512;
    const side = valleySide(size);
    for (let a = 0; a < side; a++) {
      const row = valleyRowOf(a, size);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(size);
    }
  });

  /**
   * The budget in docs/architecture.md is ~100-150k triangles. This view has no buildings
   * to share it with, so the topography can have the lot — but not more than the lot.
   */
  it('lands the mesh inside the triangle budget', () => {
    expect(valleyTriangles(512, VALLEY_STRIDE)).toBeLessThanOrEqual(150_000);
  });

  it('would blow the budget undecimated, which is why the stride exists', () => {
    expect(valleyTriangles(512, 1)).toBeGreaterThan(150_000);
  });
});

describe('the city on the valley', () => {
  it('marks the city at the origin, where both fields are centred', () => {
    expect(cityMarkerAt()).toEqual([0, 0]);
  });

  it('measures the scene rectangle as a patch', () => {
    const patch = cityPatchExtent([-3356, -4311, 2528, 3841]);
    expect(patch.width).toBeCloseTo(5884, 6);
    expect(patch.depth).toBeCloseTo(8152, 6);
    expect(patch.centre[0]).toBeCloseTo(-414, 6);
  });

  /** The scene is about 5% of the basin, and that ratio is itself part of the argument. */
  it('leaves the city a small fraction of the basin', () => {
    const patch = cityPatchExtent([-3356, -4311, 2528, 3841]);
    expect(patch.width / 120_000).toBeLessThan(0.1);
  });
});

describe('the committed valley field', () => {
  const meta = JSON.parse(
    readFileSync(new URL('../../scenes/wat-ket.valley.json', import.meta.url), 'utf8'),
  ) as ReliefMeta & { grid: { bboxM: number[] } };

  it('spans 120 km on both axes', () => {
    expect(meta.grid.bboxM).toEqual([-60000, -60000, 60000, 60000]);
  });

  it('is the 512 grid the stride was sized for', () => {
    expect(meta.grid.size).toBe(512);
    expect(valleyTriangles(meta.grid.size, VALLEY_STRIDE)).toBeLessThanOrEqual(150_000);
  });

  /**
   * Doi Inthanon is 2,565 m and Thailand's highest point, about 59 km south-west of Wat
   * Ket — just inside this box. If the peak comes back near 1,676 m instead, the window
   * was sampled from the city backdrop's narrower cached DEM and the fetch needs
   * `--refresh`. That happened once already.
   */
  it('reaches Doi Inthanon, not just Doi Suthep', () => {
    expect(meta.encoding.max).toBeGreaterThan(2000);
  });

  it('puts the plain where the city stands', () => {
    expect(meta.base).toBeGreaterThan(280);
    expect(meta.base).toBeLessThan(340);
  });
});

describe('hillshadeColour', () => {
  const lit = [1, 0.96, 0.93] as const;
  const shadow = [0.38, 0.34, 0.6] as const;

  it('is the shadow colour at the floor and the lit colour at full light', () => {
    expect(hillshadeColour(HILLSHADE_FLOOR, lit, shadow)).toEqual([...shadow]);
    expect(hillshadeColour(1, lit, shadow)).toEqual([...lit]);
  });

  it('runs straight between them and clamps outside the range', () => {
    const mid = hillshadeColour(HILLSHADE_FLOOR + (1 - HILLSHADE_FLOOR) / 2, lit, shadow);
    for (let i = 0; i < 3; i++) expect(mid[i]).toBeCloseTo((lit[i] + shadow[i]) / 2, 9);
    expect(hillshadeColour(0, lit, shadow)).toEqual([...shadow]);
    expect(hillshadeColour(2, lit, shadow)).toEqual([...lit]);
  });

  it('keeps the shade end in the purple family: blue above red above green', () => {
    const [r, g, b] = toRgb01(RELIEF_HILLSHADE.shadow);
    expect(b).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(g);
    // And darker than the lit end, so the light still carries the form.
    const litL = toRgb01(RELIEF_HILLSHADE.lit).reduce((a, c) => a + c, 0);
    expect(r + g + b).toBeLessThan(litL * 0.7);
  });
});

function toRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

describe('waterwayWeight', () => {
  it('draws the Ping heaviest, other named rivers as rivers, and unnamed outlines thin', () => {
    expect(waterwayWeight(PING)).toBe('main');
    expect(waterwayWeight('น้ำแม่แตง')).toBe('named');
    expect(waterwayWeight('')).toBe('reservoir');
    expect(STROKE_PX.main).toBeGreaterThan(STROKE_PX.named);
    expect(STROKE_PX.named).toBeGreaterThan(STROKE_PX.reservoir);
  });

  it('is what the committed features file needs: the Ping is in it under that name', () => {
    const features = JSON.parse(
      readFileSync(new URL('../../scenes/wat-ket.valley.features.json', import.meta.url), 'utf8'),
    ) as { rivers: { name: string }[] };
    expect(features.rivers.some((r) => r.name === PING)).toBe(true);
  });
});
