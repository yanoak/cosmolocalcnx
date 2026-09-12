import { describe, expect, it } from 'vitest';
import { buildingHeight, footprintToExtrudeArgs } from '@/engine/extrude';

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

describe('buildingHeight', () => {
  it('prefers an explicit height tag', () => {
    expect(buildingHeight({ height: '9.6', 'building:levels': '5' })).toBe(9.6);
  });

  it('falls back to levels x 3.2', () => {
    expect(buildingHeight({ 'building:levels': '3' })).toBeCloseTo(9.6, 5);
  });

  it('falls back to a per-kind default when nothing is tagged', () => {
    expect(buildingHeight({}, 'residential')).toBeGreaterThan(0);
    expect(buildingHeight({})).toBeGreaterThan(0);
  });

  it('ignores junk tags rather than producing NaN', () => {
    expect(buildingHeight({ height: 'about three' })).toBeGreaterThan(0);
    expect(Number.isFinite(buildingHeight({ height: 'about three' }))).toBe(true);
  });

  it('handles a height tag carrying units', () => {
    expect(buildingHeight({ height: '12 m' })).toBe(12);
  });
});
