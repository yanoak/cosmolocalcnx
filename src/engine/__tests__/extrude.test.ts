import { describe, expect, it } from 'vitest';
import { footprintToExtrudeArgs, type Point2 } from '@/engine/extrude';

const SQUARE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe('footprintToExtrudeArgs', () => {
  it('carries the footprint through and uses height as depth', () => {
    const args = footprintToExtrudeArgs(SQUARE, 9.6);
    expect(args.depth).toBe(9.6);
    expect(args.points).toHaveLength(4);
  });

  it('normalises winding — clockwise and anticlockwise agree', () => {
    const reversed = [...SQUARE].reverse() as [number, number][];
    expect(footprintToExtrudeArgs(SQUARE, 9.6).points).toEqual(
      footprintToExtrudeArgs(reversed, 9.6).points,
    );
  });

  it('drops a duplicated closing point', () => {
    const closed = [...SQUARE, [0, 0]] as [number, number][];
    expect(footprintToExtrudeArgs(closed, 9.6).points).toHaveLength(4);
  });

  it('refuses a degenerate footprint rather than emitting broken geometry', () => {
    expect(() => footprintToExtrudeArgs([[0, 0], [1, 1]], 9.6)).toThrow();
  });

  it('refuses a non-positive height', () => {
    expect(() => footprintToExtrudeArgs(SQUARE, 0)).toThrow();
  });
});

describe('footprintToExtrudeArgs holes', () => {
  const OUTER: Point2[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  const COURTYARD: Point2[] = [
    [3, 3],
    [7, 3],
    [7, 7],
    [3, 7],
  ];

  it('has no holes by default', () => {
    expect(footprintToExtrudeArgs(OUTER, 5).holes).toEqual([]);
  });

  it('winds a hole opposite to the outer ring, whichever way it arrived', () => {
    const wind = (ring: Point2[]) => {
      let s = 0;
      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        s += x1 * y2 - x2 * y1;
      }
      return Math.sign(s);
    };

    for (const hole of [COURTYARD, [...COURTYARD].reverse()]) {
      const args = footprintToExtrudeArgs(OUTER, 5, [hole]);
      expect(wind(args.points)).toBe(1);
      expect(args.holes).toHaveLength(1);
      expect(wind(args.holes[0])).toBe(-1);
    }
  });

  it('drops a hole too small to be a ring rather than emitting broken geometry', () => {
    expect(footprintToExtrudeArgs(OUTER, 5, [[[1, 1], [2, 2]]]).holes).toEqual([]);
  });

  it('opens a closed hole ring', () => {
    const closed = [...COURTYARD, COURTYARD[0]];
    expect(footprintToExtrudeArgs(OUTER, 5, [closed]).holes[0]).toHaveLength(4);
  });
});
