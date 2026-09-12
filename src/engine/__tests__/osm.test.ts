import { describe, expect, it } from 'vitest';
import {
  AREA_REJECT_KM2,
  TRIANGLE_REJECT,
  areaLayerForTags,
  buildBaseline,
  buildingsFromElements,
  checkBudget,
  clipAreaKm2,
  estimateTriangles,
  kindForTags,
  osmId,
  projectRing,
  ringsFromElement,
  roadClass,
  roadsFromElements,
  stitchRings,
} from '../osm';
import type { OverpassElement, OverpassLatLon } from '../osm';
import type { Poly } from '../clip';
import type { BaselineBuilding } from '../scene';
import type { LatLon } from '../project';

const ORIGIN: LatLon = [18.7912, 99.0043];

/** A clip square 1 km on a side about the origin — 1 km2, so it warns but passes. */
const CLIP: Poly[] = [
  [
    [
      [-500, -500],
      [500, -500],
      [500, 500],
      [-500, 500],
    ],
  ],
];

/** Metres east/north of the origin, back to lat/lon — the inverse of project.ts. */
function at(east: number, north: number): OverpassLatLon {
  const R = 6_378_137;
  const D = Math.PI / 180;
  return {
    lat: ORIGIN[0] + north / (D * R),
    lon: ORIGIN[1] + east / (D * R * Math.cos(ORIGIN[0] * D)),
  };
}

/** A closed square way of side `size`, centred `east`/`north` of the origin. */
function squareWay(
  id: number,
  east: number,
  north: number,
  size: number,
  tags: Record<string, string> = { building: 'yes' },
): OverpassElement {
  const h = size / 2;
  const corners = [
    at(east - h, north - h),
    at(east + h, north - h),
    at(east + h, north + h),
    at(east - h, north + h),
  ];
  return { type: 'way', id, tags, geometry: [...corners, corners[0]] };
}

describe('osmId', () => {
  it('namespaces by element type', () => {
    expect(osmId({ type: 'way', id: 12345 })).toBe('osm/way/12345');
    expect(osmId({ type: 'relation', id: 7 })).toBe('osm/relation/7');
  });
});

describe('projectRing', () => {
  it('drops the repeated closing node so the footprint has no duplicated point', () => {
    const square = squareWay(1, 0, 0, 20);
    const ring = projectRing(square.geometry!, ORIGIN);
    expect(ring).toHaveLength(4);
    expect(ring[0]).not.toEqual(ring[ring.length - 1]);
  });

  it('skips nodes with no usable coordinates rather than emitting NaN', () => {
    const ring = projectRing(
      [at(0, 0), { lat: Number.NaN, lon: 99 } as OverpassLatLon, at(10, 0), at(10, 10)],
      ORIGIN,
    );
    expect(ring).toHaveLength(3);
    expect(ring.flat().every(Number.isFinite)).toBe(true);
  });

  it('collapses points that round onto their neighbour', () => {
    // Two nodes a millimetre apart become one at centimetre precision.
    const ring = projectRing([at(0, 0), at(0.001, 0), at(10, 0), at(10, 10)], ORIGIN);
    expect(ring).toHaveLength(3);
  });

  it('is empty for empty geometry rather than throwing', () => {
    expect(projectRing([], ORIGIN)).toEqual([]);
  });
});

describe('stitchRings', () => {
  const A = { lat: 0, lon: 0 };
  const B = { lat: 0, lon: 1 };
  const C = { lat: 1, lon: 1 };
  const D = { lat: 1, lon: 0 };

  it('joins fragments of one ring, in any order and either direction', () => {
    const rings = stitchRings([
      [C, D, A], // runs backwards relative to the first segment
      [A, B, C],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0][0]).toEqual(rings[0][rings[0].length - 1]);
  });

  it('passes an already-closed ring through untouched', () => {
    const rings = stitchRings([[A, B, C, D, A]]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(5);
  });

  it('discards fragments that never close rather than inventing an edge', () => {
    expect(stitchRings([[A, B], [B, C]])).toEqual([]);
  });

  it('separates two independent rings', () => {
    const E = { lat: 10, lon: 10 };
    const F = { lat: 10, lon: 11 };
    const G = { lat: 11, lon: 11 };
    expect(stitchRings([[A, B, C, D, A], [E, F, G, E]])).toHaveLength(2);
  });
});

describe('ringsFromElement', () => {
  it('yields nothing for an element with no geometry', () => {
    expect(ringsFromElement({ type: 'way', id: 1, tags: { building: 'yes' } })).toEqual({
      outer: [],
      inner: [],
    });
    expect(ringsFromElement({ type: 'node', id: 1 })).toEqual({ outer: [], inner: [] });
  });

  it('ignores an unclosed way — a wall is not a building', () => {
    expect(
      ringsFromElement({ type: 'way', id: 1, geometry: [at(0, 0), at(10, 0), at(10, 10)] }).outer,
    ).toEqual([]);
  });

  it('treats a member with an empty role as outer', () => {
    const ring = [at(0, 0), at(20, 0), at(20, 20), at(0, 20), at(0, 0)];
    const rel: OverpassElement = {
      type: 'relation',
      id: 5,
      tags: { building: 'yes', type: 'multipolygon' },
      members: [{ type: 'way', ref: 1, role: '', geometry: ring }],
    };
    expect(ringsFromElement(rel).outer).toHaveLength(1);
  });
});

describe('multipolygon buildings', () => {
  const outerRing = [at(-20, -20), at(20, -20), at(20, 20), at(-20, 20), at(-20, -20)];
  const innerRing = [at(-8, -8), at(8, -8), at(8, 8), at(-8, 8), at(-8, -8)];

  const courtyard: OverpassElement = {
    type: 'relation',
    id: 99,
    tags: { building: 'yes', type: 'multipolygon' },
    members: [
      { type: 'way', ref: 1, role: 'outer', geometry: outerRing },
      { type: 'way', ref: 2, role: 'inner', geometry: innerRing },
    ],
  };

  it('does not silently become a solid block', () => {
    const [building] = buildingsFromElements([courtyard], { origin: ORIGIN, clip: CLIP });
    expect(building.holes).toHaveLength(1);
    expect(building.holes![0]).toHaveLength(4);
    expect(building.id).toBe('osm/relation/99');
  });

  it('stitches an outer ring split across several member ways', () => {
    const split: OverpassElement = {
      type: 'relation',
      id: 100,
      tags: { building: 'yes', type: 'multipolygon' },
      members: [
        { type: 'way', ref: 1, role: 'outer', geometry: [at(-20, -20), at(20, -20), at(20, 20)] },
        { type: 'way', ref: 2, role: 'outer', geometry: [at(20, 20), at(-20, 20), at(-20, -20)] },
      ],
    };
    const [building] = buildingsFromElements([split], { origin: ORIGIN, clip: CLIP });
    expect(building.footprint).toHaveLength(4);
  });

  it('indexes ids only when a relation contributes more than one outer ring', () => {
    const twoParts: OverpassElement = {
      type: 'relation',
      id: 101,
      tags: { building: 'yes', type: 'multipolygon' },
      members: [
        { type: 'way', ref: 1, role: 'outer', geometry: outerRing },
        {
          type: 'way',
          ref: 2,
          role: 'outer',
          geometry: [at(100, 100), at(140, 100), at(140, 140), at(100, 140), at(100, 100)],
        },
      ],
    };
    const ids = buildingsFromElements([twoParts], { origin: ORIGIN, clip: CLIP }).map((b) => b.id);
    expect(ids).toEqual(['osm/relation/101/0', 'osm/relation/101/1']);
  });
});

describe('buildingsFromElements', () => {
  it('skips an element with no geometry rather than emitting NaN coordinates', () => {
    const broken: OverpassElement = { type: 'way', id: 1, tags: { building: 'yes' } };
    const buildings = buildingsFromElements([broken, squareWay(2, 0, 0, 20)], {
      origin: ORIGIN,
      clip: CLIP,
    });
    expect(buildings).toHaveLength(1);
    expect(buildings[0].footprint.flat().every(Number.isFinite)).toBe(true);
  });

  it('drops a building whose centroid falls outside the clip', () => {
    const inside = squareWay(1, 0, 0, 20);
    const outside = squareWay(2, 900, 0, 20);
    const buildings = buildingsFromElements([inside, outside], { origin: ORIGIN, clip: CLIP });
    expect(buildings.map((b) => b.id)).toEqual(['osm/way/1']);
  });

  it('ignores elements that are not buildings', () => {
    const park = squareWay(3, 0, 0, 40, { leisure: 'park' });
    expect(buildingsFromElements([park], { origin: ORIGIN, clip: CLIP })).toEqual([]);
  });

  it('drops a footprint too small to be a building', () => {
    expect(buildingsFromElements([squareWay(4, 0, 0, 1)], { origin: ORIGIN, clip: CLIP })).toEqual([]);
  });

  it('gives every building a positive finite height', () => {
    const buildings = buildingsFromElements(
      [squareWay(1, 0, 0, 20), squareWay(2, 40, 0, 60), squareWay(3, -40, 30, 12)],
      { origin: ORIGIN, clip: CLIP },
    );
    expect(buildings).toHaveLength(3);
    for (const b of buildings) {
      expect(Number.isFinite(b.height)).toBe(true);
      expect(b.height).toBeGreaterThan(0);
    }
  });
});

describe('kindForTags', () => {
  it('recognises the kinds the theme colours by', () => {
    expect(kindForTags({ amenity: 'place_of_worship', building: 'yes' })).toBe('temple');
    expect(kindForTags({ building: 'school' })).toBe('school');
    expect(kindForTags({ building: 'hospital' })).toBe('civic');
    expect(kindForTags({ building: 'warehouse' })).toBe('industrial');
    expect(kindForTags({ building: 'yes', shop: 'convenience' })).toBe('retail');
    expect(kindForTags({ building: 'yes', tourism: 'hotel' })).toBe('commercial');
    expect(kindForTags({ building: 'house' })).toBe('residential');
  });

  it('falls back to default for an untagged building rather than guessing', () => {
    expect(kindForTags({ building: 'yes' })).toBe('default');
    expect(kindForTags({})).toBe('default');
  });
});

describe('roadClass', () => {
  it('sizes roads by class', () => {
    expect(roadClass({ highway: 'primary' })!.kind).toBe('major');
    expect(roadClass({ highway: 'residential' })!.width).toBeGreaterThan(
      roadClass({ highway: 'footway' })!.width,
    );
  });

  it('narrows a link relative to its parent class', () => {
    expect(roadClass({ highway: 'primary_link' })!.width).toBeLessThan(
      roadClass({ highway: 'primary' })!.width,
    );
    expect(roadClass({ highway: 'primary_link' })!.kind).toBe('major');
  });

  it('rejects things that are not carriageways', () => {
    expect(roadClass({ highway: 'proposed' })).toBeNull();
    expect(roadClass({ highway: 'pedestrian', area: 'yes' })).toBeNull();
    expect(roadClass({})).toBeNull();
  });
});

describe('roadsFromElements', () => {
  it('keeps a road that only partly crosses the clip, so streets do not stop dead', () => {
    const crossing: OverpassElement = {
      type: 'way',
      id: 1,
      tags: { highway: 'residential' },
      geometry: [at(-800, 0), at(0, 0), at(800, 0)],
    };
    const away: OverpassElement = {
      type: 'way',
      id: 2,
      tags: { highway: 'residential' },
      geometry: [at(900, 900), at(1000, 900)],
    };
    const roads = roadsFromElements([crossing, away], { origin: ORIGIN, clip: CLIP });
    expect(roads.map((r) => r.id)).toEqual(['osm/way/1']);
    expect(roads[0].path).toHaveLength(3);
  });
});

describe('areaLayerForTags', () => {
  it('separates water from green', () => {
    expect(areaLayerForTags({ natural: 'water' })).toBe('water');
    expect(areaLayerForTags({ waterway: 'riverbank' })).toBe('water');
    expect(areaLayerForTags({ leisure: 'park' })).toBe('green');
    expect(areaLayerForTags({ landuse: 'cemetery' })).toBe('green');
    expect(areaLayerForTags({ building: 'yes' })).toBeNull();
  });
});

describe('estimateTriangles', () => {
  const building = (footprint: [number, number][], holes?: [number, number][][]): BaselineBuilding => ({
    id: 'x',
    footprint,
    ...(holes ? { holes } : {}),
    height: 6,
    kind: 'default',
  });

  it('costs a rectangle two triangles per wall plus two caps', () => {
    // 4 vertices: 8 wall triangles + 2 caps of 2 = 12.
    expect(estimateTriangles([building([[0, 0], [1, 0], [1, 1], [0, 1]])])).toBe(12);
  });

  it('counts hole vertices too', () => {
    const withHole = building(
      [[0, 0], [10, 0], [10, 10], [0, 10]],
      [[[3, 3], [7, 3], [7, 7], [3, 7]]],
    );
    expect(estimateTriangles([withHole])).toBeGreaterThan(
      estimateTriangles([building([[0, 0], [10, 0], [10, 10], [0, 10]])]),
    );
  });

  it('is zero for an empty baseline', () => {
    expect(estimateTriangles([])).toBe(0);
  });
});

describe('checkBudget', () => {
  it('rejects an area above the hard limit', () => {
    const { errors } = checkBudget({ areaKm2: AREA_REJECT_KM2 + 0.1, triangles: 100 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/hard limit/);
  });

  it('warns above the comfortable limit without rejecting', () => {
    const { errors, warnings } = checkBudget({ areaKm2: 2, triangles: 100 });
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it('passes a small area silently', () => {
    expect(checkBudget({ areaKm2: 0.8, triangles: 100 })).toEqual({ errors: [], warnings: [] });
  });

  it('rejects a triangle estimate above the ceiling', () => {
    const { errors } = checkBudget({ areaKm2: 0.5, triangles: TRIANGLE_REJECT + 1 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/triangles/);
  });

  it('reports both failures at once rather than stopping at the first', () => {
    const { errors } = checkBudget({
      areaKm2: AREA_REJECT_KM2 + 1,
      triangles: TRIANGLE_REJECT + 1,
    });
    expect(errors).toHaveLength(2);
  });
});

describe('clipAreaKm2', () => {
  it('measures a clip polygon in square kilometres', () => {
    expect(clipAreaKm2(CLIP)).toBeCloseTo(1);
  });

  it('subtracts holes and is winding-independent', () => {
    const reversed: Poly[] = [[[...CLIP[0][0]].reverse()]];
    expect(clipAreaKm2(reversed)).toBeCloseTo(1);
  });
});

describe('buildBaseline', () => {
  const elements: OverpassElement[] = [
    squareWay(3, 0, 0, 20),
    squareWay(1, 40, 0, 30, { building: 'house' }),
    squareWay(2, -40, 0, 40, { leisure: 'park' }),
    { type: 'way', id: 4, tags: { highway: 'residential' }, geometry: [at(-100, 0), at(100, 0)] },
    squareWay(5, 0, 60, 50, { natural: 'water' }),
  ];

  it('fills every layer of the baseline', () => {
    const { baseline } = buildBaseline(elements, { origin: ORIGIN, clip: CLIP });
    expect(baseline.buildings).toHaveLength(2);
    expect(baseline.roads).toHaveLength(1);
    expect(baseline.water).toHaveLength(1);
    expect(baseline.green).toHaveLength(1);
  });

  it('is independent of the order Overpass returned elements in', () => {
    const forwards = buildBaseline(elements, { origin: ORIGIN, clip: CLIP });
    const backwards = buildBaseline([...elements].reverse(), { origin: ORIGIN, clip: CLIP });
    expect(JSON.stringify(backwards.baseline)).toBe(JSON.stringify(forwards.baseline));
  });

  it('reports where heights came from', () => {
    const tagged = squareWay(9, 0, -60, 20, { building: 'yes', height: '11' });
    const { stats } = buildBaseline([...elements, tagged], { origin: ORIGIN, clip: CLIP });
    expect(stats.heightSources.height).toBe(1);
    expect(stats.heightSources.synth).toBe(2);
  });
});
