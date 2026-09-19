import { describe, expect, it } from 'vitest';
import {
  BURIED_M,
  GROUND_TOP_M,
  bridgeTriangles,
  bridgesSoup,
  crossesWater,
  deckStations,
  extendedPath,
  pierSpots,
  profileFor,
  ribbon,
  waterPolys,
} from '../bridges';
import type { Poly } from '../clip';
import type { Point2 } from '../extrude';
import type { BaselineArea, BaselineRoad } from '../scene';

/** A river 60 m wide running north–south, x from -30 to 30. */
const RIVER: Poly = [
  [
    [-30, -500],
    [30, -500],
    [30, 500],
    [-30, 500],
  ],
];

/** The same river with an island in it. */
const RIVER_WITH_ISLAND: Poly = [
  RIVER[0],
  [
    [-5, -5],
    [5, -5],
    [5, 5],
    [-5, 5],
  ],
];

const SPAN: Point2[] = [
  [-50, 0],
  [50, 0],
];

function road(path: Point2[], kind = 'secondary', width = 9.5, bridge = true): BaselineRoad {
  return bridge ? { id: 'osm/way/1', path, kind, width, bridge: true } : { id: 'osm/way/1', path, kind, width };
}

describe('crossesWater', () => {
  it('is true for a path through the river and false beside it', () => {
    expect(crossesWater(SPAN, [RIVER])).toBe(true);
    expect(crossesWater([[100, 0], [200, 0]], [RIVER])).toBe(false);
  });

  it('samples between vertices, so a long segment still finds the water', () => {
    expect(crossesWater([[-400, 0], [400, 0]], [RIVER])).toBe(true);
  });

  it('is false for a point only on the island', () => {
    expect(crossesWater([[0, 0]], [RIVER_WITH_ISLAND])).toBe(false);
    expect(crossesWater([[20, 0]], [RIVER_WITH_ISLAND])).toBe(true);
  });

  it('is false with no water at all', () => {
    expect(crossesWater(SPAN, [])).toBe(false);
  });
});

describe('ribbon', () => {
  it('keeps a straight path exactly the width apart', () => {
    const { left, right } = ribbon(SPAN, 4);
    expect(left).toEqual([[-50, 4], [50, 4]]);
    expect(right).toEqual([[-50, -4], [50, -4]]);
  });

  it('bounds the mitre at a hairpin', () => {
    const hairpin: Point2[] = [[0, 0], [100, 0], [0, 1]];
    const { left, right } = ribbon(hairpin, 4);
    const reach = Math.hypot(left[1][0] - 100, left[1][1]);
    expect(reach).toBeLessThanOrEqual(8 + 1e-9);
    expect(Math.hypot(right[1][0] - 100, right[1][1])).toBeLessThanOrEqual(8 + 1e-9);
  });
});

describe('extendedPath', () => {
  it('adds one station beyond each end along the end segments', () => {
    const ext = extendedPath(SPAN, 20);
    expect(ext).toHaveLength(4);
    expect(ext[0]).toEqual([-70, 0]);
    expect(ext[3]).toEqual([70, 0]);
  });
});

describe('deckStations', () => {
  const profile = profileFor('secondary');
  const stations = deckStations(road(SPAN), profile);

  it('holds the span at its class height and drops the ramps to the ground', () => {
    expect(stations).toHaveLength(4);
    expect(stations[1].top).toBe(profile.deckTop);
    expect(stations[2].top).toBe(profile.deckTop);
    expect(stations[0].top).toBe(GROUND_TOP_M);
    expect(stations[3].top).toBe(GROUND_TOP_M);
    expect(stations[0].bottom).toBe(BURIED_M);
  });

  it('never puts the underside above the top', () => {
    for (const s of stations) expect(s.bottom).toBeLessThan(s.top);
  });

  it('is at least 3 m wide even for a footpath', () => {
    const [s] = deckStations(road(SPAN, 'path', 1.8));
    expect(Math.hypot(s.left[0] - s.right[0], s.left[1] - s.right[1])).toBeCloseTo(3);
  });

  it('gives a footbridge a lower deck than a major road', () => {
    expect(profileFor('path').deckTop).toBeLessThan(profileFor('major').deckTop);
    expect(profileFor('nonsense')).toEqual(profileFor('street'));
  });
});

describe('pierSpots', () => {
  it('spaces piers along the way and keeps only those over water', () => {
    // 100 m span, 24 m spacing: 4 piers, centred, at -36, -12, 12, 36 — the outer two on land.
    const spots = pierSpots(SPAN, 24, [RIVER]);
    expect(spots.map((s) => Math.round(s.at[0]))).toEqual([-12, 12]);
    for (const s of spots) expect(s.dir).toEqual([1, 0]);
  });

  it('gives a short span one pier in the middle', () => {
    const spots = pierSpots([[-10, 0], [10, 0]], 24, [RIVER]);
    expect(spots).toHaveLength(1);
    expect(spots[0].at).toEqual([0, 0]);
  });

  it('is empty over dry land', () => {
    expect(pierSpots([[100, 0], [200, 0]], 24, [RIVER])).toEqual([]);
  });
});

describe('bridgeTriangles', () => {
  const soup = bridgeTriangles(road(SPAN), [RIVER]);

  it('emits whole triangles with unit normals and colours in range', () => {
    expect(soup.positions.length % 9).toBe(0);
    expect(soup.positions.length).toBeGreaterThan(0);
    expect(soup.normals.length).toBe(soup.positions.length);
    expect(soup.colors.length).toBe(soup.positions.length);
    for (let i = 0; i < soup.normals.length; i += 3) {
      expect(Math.hypot(soup.normals[i], soup.normals[i + 1], soup.normals[i + 2])).toBeCloseTo(1);
    }
    for (const c of soup.colors) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it('puts the deck top at its class height, facing up, and the piers under it', () => {
    const profile = profileFor('secondary');
    let topFaces = 0;
    let lowest = Infinity;
    let highest = -Infinity;
    for (let i = 0; i < soup.positions.length; i += 9) {
      const y = soup.positions[i + 1];
      lowest = Math.min(lowest, y);
      highest = Math.max(highest, y);
      const ny = soup.normals[i + 1];
      if (Math.abs(y - profile.deckTop) < 1e-6 && ny > 0.99) topFaces += 1;
    }
    expect(topFaces).toBeGreaterThan(0);
    expect(lowest).toBe(BURIED_M);
    expect(highest).toBeCloseTo(profile.deckTop + profile.parapet);
  });

  it('spans in three.js orientation: north is −z', () => {
    const northSpan = bridgeTriangles(road([[0, -50], [0, 50]]), [
      [[[-500, -30], [500, -30], [500, 30], [-500, 30]]],
    ]);
    const zs = [];
    for (let i = 2; i < northSpan.positions.length; i += 3) zs.push(northSpan.positions[i]);
    expect(Math.min(...zs)).toBeLessThan(-50);
    expect(Math.max(...zs)).toBeGreaterThan(50);
  });
});

describe('bridgesSoup', () => {
  const water: BaselineArea[] = [{ id: 'osm/way/9', footprint: RIVER[0], kind: 'water' }];

  it('builds only flagged roads that cross water', () => {
    const flaggedOverWater = road(SPAN);
    const flaggedOverLand = { ...road([[100, 0], [200, 0]]), id: 'osm/way/2' };
    const unflaggedOverWater = { ...road(SPAN, 'secondary', 9.5, false), id: 'osm/way/3' };
    const soup = bridgesSoup([flaggedOverWater, flaggedOverLand, unflaggedOverWater], water);
    const alone = bridgeTriangles(flaggedOverWater, waterPolys(water));
    expect(soup.positions.length).toBe(alone.positions.length);
  });

  it('is empty for a scene with no bridges', () => {
    expect(bridgesSoup([road(SPAN, 'secondary', 9.5, false)], water).positions).toEqual([]);
  });
});
