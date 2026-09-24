import { describe, expect, it } from 'vitest';
import { crossing, indexCells, upperBound } from '../ringstate';

describe('upperBound', () => {
  const s = [10, 20, 20, 30];
  it('is the first index past x', () => {
    expect(upperBound(s, 5)).toBe(0);
    expect(upperBound(s, 10)).toBe(1);
    expect(upperBound(s, 20)).toBe(3);
    expect(upperBound(s, 25)).toBe(3);
    expect(upperBound(s, 30)).toBe(4);
    expect(upperBound([], 1)).toBe(0);
  });
});

describe('crossing', () => {
  const km = [100, 200, 300, 400, 500];

  it('grows: the cells in (from, to] come inside, a cell on the ring included', () => {
    expect(crossing(km, 150, 300)).toEqual({ lo: 1, hi: 3, inside: true });
  });

  it('shrinks: the cells in (to, from] go outside', () => {
    expect(crossing(km, 450, 250)).toEqual({ lo: 2, hi: 4, inside: false });
  });

  it('is empty when nothing moved, or nothing lies between', () => {
    expect(crossing(km, 300, 300).hi).toBe(0);
    const c = crossing(km, 310, 390);
    expect(c.hi - c.lo).toBe(0);
  });

  it('from zero takes everything up to the ring', () => {
    expect(crossing(km, 0, 10_000)).toEqual({ lo: 0, hi: 5, inside: true });
  });
});

describe('indexCells', () => {
  it('sorts by distance and keeps one entry per id', () => {
    const index = indexCells([
      [7, 300],
      [3, 100],
      [7, 300],
      [5, 200],
    ]);
    expect(Array.from(index.km)).toEqual([100, 200, 300]);
    expect(Array.from(index.ids)).toEqual([3, 5, 7]);
  });
});
