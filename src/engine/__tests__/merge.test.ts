import { describe, expect, it } from 'vitest';
import { idForFace, mergeAreas, mergeBuildings } from '../merge';
import type { PickRange } from '../merge';
import type { BaselineArea, BaselineBuilding } from '../scene';

const square = (id: string, x: number, kind = 'residential'): BaselineBuilding => ({
  id,
  footprint: [
    [x, 0],
    [x + 10, 0],
    [x + 10, 10],
    [x, 10],
  ],
  height: 6,
  kind,
});

describe('mergeBuildings', () => {
  it('produces one geometry for many buildings', () => {
    const merged = mergeBuildings([square('a', 0), square('b', 20), square('c', 40)]);
    expect(merged.ranges).toHaveLength(3);
    expect(merged.geometry.getAttribute('position').count).toBe(merged.triangles * 3);
    expect(merged.geometry.getAttribute('color').count).toBe(merged.triangles * 3);
  });

  it('lays ranges out contiguously, so a face index maps to exactly one building', () => {
    const merged = mergeBuildings([square('a', 0), square('b', 20), square('c', 40)]);
    let expected = 0;
    for (const range of merged.ranges) {
      expect(range.start).toBe(expected);
      expected += range.count;
    }
    expect(expected).toBe(merged.triangles);
  });

  it('keeps a courtyard as a hole rather than filling it in', () => {
    const solid = mergeBuildings([square('a', 0)]);
    const withHole = mergeBuildings([
      {
        ...square('a', 0),
        footprint: [
          [0, 0],
          [30, 0],
          [30, 30],
          [0, 30],
        ],
        holes: [
          [
            [10, 10],
            [20, 10],
            [20, 20],
            [10, 20],
          ],
        ],
      },
    ]);
    // A hole adds four walls and splits the caps: strictly more geometry than a box.
    expect(withHole.triangles).toBeGreaterThan(solid.triangles);
  });

  it('skips a building that cannot be extruded rather than blanking the scene', () => {
    const broken: BaselineBuilding = { id: 'bad', footprint: [[0, 0]], height: 5, kind: 'default' };
    const merged = mergeBuildings([broken, square('good', 0)]);
    expect(merged.ranges.map((r) => r.id)).toEqual(['good']);
  });

  it('is empty but valid for an empty baseline', () => {
    const merged = mergeBuildings([]);
    expect(merged.triangles).toBe(0);
    expect(merged.ranges).toEqual([]);
    expect(merged.geometry.getAttribute('position').count).toBe(0);
  });

  it('colours by kind without needing separate meshes', () => {
    const merged = mergeBuildings([square('a', 0, 'residential'), square('b', 20, 'civic')]);
    const colors = merged.geometry.getAttribute('color');
    const first = [colors.getX(0), colors.getY(0), colors.getZ(0)];
    const civicVertex = merged.ranges[1].start * 3;
    const second = [
      colors.getX(civicVertex),
      colors.getY(civicVertex),
      colors.getZ(civicVertex),
    ];
    expect(second).not.toEqual(first);
  });
});

describe('mergeAreas', () => {
  const area = (id: string, x: number): BaselineArea => ({
    id,
    footprint: [
      [x, 0],
      [x + 10, 0],
      [x + 10, 10],
      [x, 10],
    ],
    kind: 'water',
  });

  it('merges flat polygons into one geometry', () => {
    const merged = mergeAreas([area('a', 0), area('b', 20)], '#677FA2');
    expect(merged.ranges).toHaveLength(2);
    expect(merged.triangles).toBeGreaterThan(0);
    expect(merged.geometry.getAttribute('color').count).toBe(merged.triangles * 3);
  });

  it('ignores a footprint with too few points', () => {
    expect(mergeAreas([{ id: 'x', footprint: [[0, 0]], kind: 'water' }], '#000').ranges).toEqual([]);
  });
});

describe('idForFace', () => {
  const ranges: PickRange[] = [
    { id: 'a', start: 0, count: 12 },
    { id: 'b', start: 12, count: 20 },
    { id: 'c', start: 32, count: 8 },
  ];

  it('finds the building a face belongs to', () => {
    expect(idForFace(ranges, 0)).toBe('a');
    expect(idForFace(ranges, 11)).toBe('a');
    expect(idForFace(ranges, 12)).toBe('b');
    expect(idForFace(ranges, 31)).toBe('b');
    expect(idForFace(ranges, 32)).toBe('c');
    expect(idForFace(ranges, 39)).toBe('c');
  });

  it('returns null outside the merged range or with no hit', () => {
    expect(idForFace(ranges, 40)).toBeNull();
    expect(idForFace(ranges, undefined)).toBeNull();
    expect(idForFace([], 0)).toBeNull();
  });

  it('agrees with a linear scan across every face', () => {
    const linear = (face: number) =>
      ranges.find((r) => face >= r.start && face < r.start + r.count)?.id ?? null;
    for (let face = 0; face < 45; face++) {
      expect(idForFace(ranges, face)).toBe(linear(face));
    }
  });
});
