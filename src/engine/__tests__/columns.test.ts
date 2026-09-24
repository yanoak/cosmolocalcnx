import { describe, expect, it } from 'vitest';
import { screenBasis, wallFacesCamera } from '../camera';
import { cellCentreKm } from '../cities';
import {
  MAX_COLUMN_KM,
  TONE_FACTORS,
  cellOf,
  columnGeometry,
  layoutColumns,
  populationT,
} from '../columns';

describe('populationT', () => {
  it('is 0 for an empty cell and 1 for the densest', () => {
    expect(populationT(0, 1e6)).toBe(0);
    expect(populationT(1e6, 1e6)).toBe(1);
  });

  it('is log-scaled, so a mid-sized town is visibly not empty', () => {
    // 10,000 people against a peak of 10 million: linear would be 0.001.
    expect(populationT(1e4, 1e7)).toBeGreaterThan(0.5);
  });

  it('is monotone and clamped', () => {
    let previous = -1;
    for (const p of [0, 1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8]) {
      const t = populationT(p, 1e7);
      expect(t).toBeGreaterThanOrEqual(previous);
      expect(t).toBeLessThanOrEqual(1);
      previous = t;
    }
  });
});

describe('layoutColumns', () => {
  // 4 × 4 field, radius 100 km → 50 km cells. Row 0 is north.
  const size = 4;
  const radius = 100;
  const field = new Float32Array(size * size);
  field[0 * size + 0] = 10; // north-west corner
  field[1 * size + 3] = 1000; // second row, east edge
  field[3 * size + 1] = 100000; // south row

  it('makes one column per populated cell, in row-major order', () => {
    const layout = layoutColumns(field, size, radius, 100000);
    expect(layout.count).toBe(3);
    expect(Array.from(layout.cell)).toEqual([0, 7, 13]);
    expect(layout.cellKm).toBe(50);
  });

  it('places each column at its cell centre — the same arithmetic cities.ts uses', () => {
    const layout = layoutColumns(field, size, radius, 100000);
    for (let k = 0; k < layout.count; k++) {
      const [east, north] = cellCentreKm(cellOf(layout.cell[k], size), radius, size);
      expect(layout.east[k]).toBeCloseTo(east, 5);
      expect(layout.north[k]).toBeCloseTo(north, 5);
    }
    // And by eye: the north-west corner cell is west and north of the centre.
    expect(layout.east[0]).toBe(-75);
    expect(layout.north[0]).toBe(75);
  });

  it('gives the densest cell the full height and the others less, never zero', () => {
    const layout = layoutColumns(field, size, radius, 100000);
    expect(layout.heightKm[2]).toBeCloseTo(MAX_COLUMN_KM, 6);
    expect(layout.heightKm[0]).toBeGreaterThan(0);
    expect(layout.heightKm[0]).toBeLessThan(layout.heightKm[1]);
    expect(layout.heightKm[1]).toBeLessThan(layout.heightKm[2]);
  });

  it('handles an empty field without allocating anything', () => {
    const layout = layoutColumns(new Float32Array(16), 4, 100, 0);
    expect(layout.count).toBe(0);
    expect(layout.east.length).toBe(0);
  });
});

describe('cellOf', () => {
  it('inverts row * size + col', () => {
    expect(cellOf(0, 4)).toEqual([0, 0]);
    expect(cellOf(7, 4)).toEqual([3, 1]);
    expect(cellOf(13, 4)).toEqual([1, 3]);
  });
});

describe('columnGeometry', () => {
  const g = columnGeometry();

  it('keeps only the faces the camera can see: a top and two walls on the diagonal', () => {
    expect(g.faces).toBe(3);
    expect(g.positions.length).toBe(3 * 6 * 3);
    expect(g.tone.length).toBe(3 * 6);
  });

  it('keeps the walls that face the camera, derived from the attitude', () => {
    // Every wall vertex lies on a face whose outward normal faces the camera.
    const { groundTrack } = screenBasis();
    const xs = new Set<number>();
    const zs = new Set<number>();
    for (let v = 0; v < g.positions.length / 3; v++) {
      const y = g.positions[v * 3 + 1];
      if (g.tone[v] === 0) continue; // the top
      xs.add(g.positions[v * 3]);
      zs.add(g.positions[v * 3 + 2]);
      expect(y === 0 || y === 1).toBe(true);
    }
    // One wall is at x = ±½ on the camera's side, the other at z = ±½ likewise.
    const wallX = groundTrack[0] > 0 ? 0.5 : -0.5;
    const wallZ = groundTrack[1] < 0 ? 0.5 : -0.5;
    expect(xs.has(wallX)).toBe(true);
    expect(zs.has(wallZ)).toBe(true);
    // Scene east/north normals of those walls face the camera.
    expect(wallFacesCamera(wallX * 2, 0)).toBe(true);
    expect(wallFacesCamera(0, -wallZ * 2)).toBe(true);
  });

  it('gives the top the top tone and the two walls different tones', () => {
    const tones = new Set(Array.from(g.tone));
    expect(tones.has(0)).toBe(true);
    expect(tones.size).toBe(3);
  });

  it('is a unit column: footprint ±½, height 0..1', () => {
    for (let v = 0; v < g.positions.length / 3; v++) {
      expect(Math.abs(g.positions[v * 3])).toBe(0.5);
      expect(Math.abs(g.positions[v * 3 + 2])).toBe(0.5);
      const y = g.positions[v * 3 + 1];
      expect(y >= 0 && y <= 1).toBe(true);
    }
  });

  it('darkens walls against the top, and the shade wall most', () => {
    expect(TONE_FACTORS[0]).toBe(1);
    expect(TONE_FACTORS[1]).toBeLessThan(1);
    expect(TONE_FACTORS[2]).toBeLessThan(TONE_FACTORS[1]);
  });
});
