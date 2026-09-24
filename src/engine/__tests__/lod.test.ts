import { describe, expect, it } from 'vitest';
import {
  nearDepthRange,
  partitionBuildings,
  partitionRoads,
  sliceFor,
  viewDepth,
} from '../lod';
import { screenBasis } from '../camera';
import type { BaselineBuilding, BaselineRoad } from '../scene';

/** A unit square building centred on (x, y). Height and kind are never read here. */
function building(id: string, x: number, y: number): BaselineBuilding {
  return {
    id,
    footprint: [
      [x - 1, y - 1],
      [x + 1, y - 1],
      [x + 1, y + 1],
      [x - 1, y + 1],
    ],
    height: 6,
    kind: 'default',
  };
}

function road(id: string, ...path: [number, number][]): BaselineRoad {
  return { id, path, kind: 'residential', width: 6 };
}

const AT_ORIGIN = { centre: [0, 0] as [number, number], radiusM: 1250 };

describe('partitionBuildings', () => {
  it('keeps a building inside the radius as geometry', () => {
    const b = building('a', 500, 500); // 707 m out
    expect(partitionBuildings([b], AT_ORIGIN).near.map((x) => x.id)).toEqual(['a']);
  });

  it('sends a building outside the radius to the backdrop', () => {
    const b = building('a', 3000, 0);
    const { near, far } = partitionBuildings([b], AT_ORIGIN);
    expect(near).toEqual([]);
    expect(far.map((x) => x.id)).toEqual(['a']);
  });

  /**
   * The rule the radius is only a proxy for. Once item 5's hotspots land, a hotspot
   * three kilometres out must still be real geometry a visitor can tap — otherwise
   * the content and the renderer disagree about what the piece is about.
   */
  it('keeps a hero as geometry however far out it is', () => {
    const b = building('osm/way/1', 5000, 5000);
    const { near, far } = partitionBuildings([b], {
      ...AT_ORIGIN,
      heroIds: new Set(['osm/way/1']),
    });
    expect(near.map((x) => x.id)).toEqual(['osm/way/1']);
    expect(far).toEqual([]);
  });

  /**
   * mergeBuildings writes pick ranges in the order it is handed, and idForFace binary
   * searches them. Reordering here would silently return the wrong building on tap.
   */
  it('preserves document order within each group', () => {
    const items = [
      building('near-1', 0, 0),
      building('far-1', 4000, 0),
      building('near-2', 100, 100),
      building('far-2', 0, 4000),
      building('near-3', -200, 50),
    ];
    const { near, far } = partitionBuildings(items, AT_ORIGIN);
    expect(near.map((x) => x.id)).toEqual(['near-1', 'near-2', 'near-3']);
    expect(far.map((x) => x.id)).toEqual(['far-1', 'far-2']);
  });

  it('partitions — every building lands in exactly one group', () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      building(`b${i}`, (i - 25) * 200, ((i * 7) % 50) * 100 - 2500),
    );
    const { near, far } = partitionBuildings(items, AT_ORIGIN);
    expect(near.length + far.length).toBe(items.length);
    const ids = new Set([...near, ...far].map((x) => x.id));
    expect(ids.size).toBe(items.length);
  });

  it('is a pure function of its inputs', () => {
    const items = [building('a', 0, 0), building('b', 9000, 9000)];
    const once = partitionBuildings(items, AT_ORIGIN);
    const twice = partitionBuildings(items, AT_ORIGIN);
    expect(twice).toEqual(once);
  });

  it('does not mutate the input array', () => {
    const items = [building('b', 9000, 0), building('a', 0, 0)];
    const before = items.map((x) => x.id);
    partitionBuildings(items, AT_ORIGIN);
    expect(items.map((x) => x.id)).toEqual(before);
  });

  it('a radius of zero with no heroes leaves nothing near, and does not throw', () => {
    const items = [building('a', 0, 0), building('b', 10, 10)];
    const { near, far } = partitionBuildings(items, { ...AT_ORIGIN, radiusM: 0 });
    expect(near).toEqual([]);
    expect(far).toHaveLength(2);
  });

  it('an empty scene gives two empty groups', () => {
    expect(partitionBuildings([], AT_ORIGIN)).toEqual({ near: [], far: [] });
  });

  it('measures from the centre it is given, not from the origin', () => {
    const b = building('a', 3000, 0);
    const { near } = partitionBuildings([b], { centre: [3000, 0], radiusM: 100 });
    expect(near.map((x) => x.id)).toEqual(['a']);
  });
});

describe('partitionRoads', () => {
  /**
   * Any vertex inside is enough. A road clipped at the disc edge would end in mid-air
   * against a backdrop that draws the same road continuing, which is the seam
   * Verification step 1 exists to catch.
   */
  it('keeps a road whole if any vertex is inside the radius', () => {
    const r = road('r', [0, 0], [5000, 5000]);
    expect(partitionRoads([r], AT_ORIGIN).near.map((x) => x.id)).toEqual(['r']);
  });

  it('sends a road with no vertex inside to the backdrop', () => {
    const r = road('r', [4000, 4000], [5000, 5000]);
    const { near, far } = partitionRoads([r], AT_ORIGIN);
    expect(near).toEqual([]);
    expect(far.map((x) => x.id)).toEqual(['r']);
  });

  it('preserves document order within each group', () => {
    const roads = [
      road('far-1', [9000, 0]),
      road('near-1', [0, 0]),
      road('far-2', [0, 9000]),
      road('near-2', [50, 50]),
    ];
    const { near, far } = partitionRoads(roads, AT_ORIGIN);
    expect(near.map((x) => x.id)).toEqual(['near-1', 'near-2']);
    expect(far.map((x) => x.id)).toEqual(['far-1', 'far-2']);
  });

  it('an empty path is far, not a crash', () => {
    const { near, far } = partitionRoads([road('r')], AT_ORIGIN);
    expect(near).toEqual([]);
    expect(far).toHaveLength(1);
  });
});

describe('viewDepth', () => {
  /**
   * The camera sits south-east of its target and elevated — three.js -z is north. So
   * north-west is far and south-east is near. Written in terms of
   * `screenBasis().groundTrack` so the test follows the attitude if it ever changes,
   * and pins the diagonal case explicitly beneath.
   */
  const [gx, gy] = screenBasis().groundTrack;

  it('is larger for a point nearer the camera', () => {
    expect(viewDepth([gx * 1000, gy * 1000])).toBeGreaterThan(viewDepth([0, 0]));
    expect(viewDepth([-gx * 1000, -gy * 1000])).toBeLessThan(viewDepth([0, 0]));
  });

  it('on the diagonal: south-east is near, north-west is far, and depth is (x − y)/√2', () => {
    expect(viewDepth([1000, -1000])).toBeGreaterThan(viewDepth([0, 0]));
    expect(viewDepth([-1000, 1000])).toBeLessThan(viewDepth([0, 0]));
    expect(viewDepth([500, 500])).toBeCloseTo(0, 9);
  });

  it('is zero along the line of sight through the origin', () => {
    expect(viewDepth([0, 0])).toBe(0);
    expect(viewDepth([-gy * 500, gx * 500])).toBeCloseTo(0, 9);
  });

  it("is metres along the camera's ground track", () => {
    expect(viewDepth([gx * 100, gy * 100]) - viewDepth([0, 0])).toBeCloseTo(100, 9);
  });

  it('is monotone along the view axis', () => {
    let previous = -Infinity;
    for (let i = -10; i <= 10; i++) {
      const v = viewDepth([gx * i * 100, gy * i * 100]);
      expect(v).toBeGreaterThan(previous);
      previous = v;
    }
  });
});

describe('nearDepthRange and sliceFor', () => {
  const [gx, gy] = screenBasis().groundTrack;
  /** A ground point `d` metres toward the camera and `s` metres to its side. */
  const at = (d: number, s: number): [number, number] => [gx * d - gy * s, gy * d + gx * s];
  const near = [building('a', 0, 0), building('b', ...at(500, 0)), building('c', ...at(-500, 0))];

  it('spans the near set, footprint corners included', () => {
    const range = nearDepthRange(near);
    expect(range.min).toBeLessThan(viewDepth(at(-500, 0)));
    expect(range.max).toBeGreaterThan(viewDepth(at(500, 0)));
  });

  it('puts a building further than the whole near set behind it', () => {
    const range = nearDepthRange(near);
    expect(sliceFor(viewDepth(at(-4000, 0)), range)).toBe('behind');
  });

  it('puts a building nearer the camera than the whole near set in front of it', () => {
    const range = nearDepthRange(near);
    expect(sliceFor(viewDepth(at(4000, 0)), range)).toBe('front');
  });

  /**
   * Laterally beside the disc, overlapping it in depth.
   *
   * Goes in FRONT. Sending it behind leaves a horizontal band of missing city — the
   * behind plane hangs behind the near set and the opaque ground in that depth band is
   * nearer than it. Seen on screen 21 Sep 2026; see sliceFor.
   */
  it('puts one that merely overlaps the near set in depth in front of it', () => {
    const range = nearDepthRange(near);
    expect(sliceFor(viewDepth(at(0, 4000)), range)).toBe('front');
  });

  it('only sends something strictly behind the whole near set behind it', () => {
    const range = nearDepthRange(near);
    // Just inside the near set's own depth span.
    expect(sliceFor(range.min + 1, range)).toBe('front');
    expect(sliceFor(range.min - 1, range)).toBe('behind');
  });

  it('an empty near set gives a degenerate range, and everything falls behind', () => {
    const range = nearDepthRange([]);
    expect(sliceFor(viewDepth(at(4000, 0)), range)).toBe('behind');
    expect(sliceFor(viewDepth(at(-4000, 0)), range)).toBe('behind');
  });
});
