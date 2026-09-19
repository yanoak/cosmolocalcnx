import { describe, expect, it } from 'vitest';
import {
  MIN_EXTERNAL_AREA_M2,
  externalBuildings,
  observedHeights,
} from '../satellite';
import type { BuildingsCache, CachedBuilding } from '../satellite';
import { buildBaseline, emptyStats } from '../osm';
import type { OverpassElement } from '../osm';
import type { Poly } from '../clip';
import type { LatLon } from '../project';
import type { BaselineBuilding } from '../scene';
import { MAX_OBSERVED_HEIGHT_M, synthesiseHeight } from '../synth';

const ORIGIN: LatLon = [18.7912, 99.0043];

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

/** Metres east/north of the origin, to [lon, lat] as the cache stores it. */
function at(east: number, north: number): [number, number] {
  const R = 6_378_137;
  const D = Math.PI / 180;
  return [
    ORIGIN[1] + east / (D * R * Math.cos(ORIGIN[0] * D)),
    ORIGIN[0] + north / (D * R),
  ];
}

function squareRing(east: number, north: number, size: number): [number, number][] {
  const h = size / 2;
  const corners = [
    at(east - h, north - h),
    at(east + h, north - h),
    at(east + h, north + h),
    at(east - h, north + h),
  ];
  return [...corners, corners[0]];
}

function cached(
  id: string,
  east: number,
  north: number,
  size: number,
  extra: Partial<CachedBuilding> = {},
): CachedBuilding {
  return {
    id,
    source: 'google',
    confidence: 0.8,
    footprint: squareRing(east, north, size),
    holes: [],
    observed: null,
    ...extra,
  };
}

function cache(buildings: CachedBuilding[]): BuildingsCache {
  return { _bbox: [0, 0, 0, 0], overture_release: 'test', height_year: 2023, buildings };
}

/** An OSM square, as the baseline already holds it (local metres). */
function osmSquare(id: string, east: number, north: number, size: number): BaselineBuilding {
  const h = size / 2;
  return {
    id,
    footprint: [
      [east - h, north - h],
      [east + h, north - h],
      [east + h, north + h],
      [east - h, north + h],
    ],
    height: 6,
    kind: 'default',
  };
}

const options = { origin: ORIGIN, clip: CLIP };

describe('observedHeights', () => {
  it('indexes every observation by scene id, OSM ids included', () => {
    const map = observedHeights(
      cache([
        cached('osm/way/1', 0, 0, 10, { source: 'osm', observed: { height: 7.5, presence: 0.9, px: 80 } }),
        cached('overture/a', 50, 0, 10, { observed: { height: 4, presence: 0.8, px: 60 } }),
        cached('overture/b', 100, 0, 10),
      ]),
    );
    expect(map.get('osm/way/1')).toEqual({ height: 7.5, presence: 0.9, px: 80 });
    expect(map.get('overture/a')?.height).toBe(4);
    expect(map.has('overture/b')).toBe(false);
  });
});

describe('externalBuildings', () => {
  it('projects a footprint to centimetre-rounded local metres and drops the closing point', () => {
    const [b] = externalBuildings(cache([cached('overture/a', 100, 50, 10)]), options, []);
    expect(b.footprint).toHaveLength(4);
    expect(b.footprint[0]).not.toEqual(b.footprint[3]);
    for (const [x, y] of b.footprint) {
      expect(Math.round(x * 100) / 100).toBe(x);
      expect(Math.round(y * 100) / 100).toBe(y);
    }
    expect(b.footprint.map(([x]) => x).sort((p, q) => p - q)).toEqual([95, 95, 105, 105]);
  });

  it('namespaces ids as the cache gives them, with kind default', () => {
    const [b] = externalBuildings(cache([cached('overture/abc-123', 0, 0, 10)]), options, []);
    expect(b.id).toBe('overture/abc-123');
    expect(b.kind).toBe('default');
  });

  it('never emits an OSM-sourced row — those come from Overpass', () => {
    const out = externalBuildings(
      cache([cached('osm/way/1', 0, 0, 10, { source: 'osm' })]),
      options,
      [],
    );
    expect(out).toEqual([]);
  });

  it('drops a footprint whose centroid lies inside an OSM footprint', () => {
    const stats = emptyStats();
    const out = externalBuildings(
      cache([cached('overture/dup', 0, 0, 8), cached('overture/keep', 100, 0, 8)]),
      options,
      [osmSquare('osm/way/1', 0, 0, 20)],
      stats,
    );
    expect(out.map((b) => b.id)).toEqual(['overture/keep']);
    expect(stats.duplicates).toBe(1);
  });

  it('drops a footprint below the area floor and keeps one at it', () => {
    const side = Math.sqrt(MIN_EXTERNAL_AREA_M2);
    const out = externalBuildings(
      cache([cached('overture/tiny', 0, 0, side - 0.5), cached('overture/ok', 100, 0, side + 0.05)]),
      options,
      [],
    );
    expect(out.map((b) => b.id)).toEqual(['overture/ok']);
  });

  it('skips a footprint whose centroid is outside the clip', () => {
    const stats = emptyStats();
    const out = externalBuildings(cache([cached('overture/far', 2000, 0, 10)]), options, [], stats);
    expect(out).toEqual([]);
    expect(stats.skipped.buildings.outsideClip).toBe(1);
  });

  it('uses the observed height when the observation is trustworthy', () => {
    const [b] = externalBuildings(
      cache([cached('overture/a', 0, 0, 10, { observed: { height: 11.37, presence: 0.8, px: 70 } })]),
      options,
      [],
    );
    expect(b.height).toBe(11.37);
  });

  it('synthesises when the observation is too thin, and clamps a wild one', () => {
    const stats = emptyStats();
    const [thin, wild] = externalBuildings(
      cache([
        cached('overture/a', 0, 0, 10, { observed: { height: 11, presence: 0.1, px: 3 } }),
        cached('overture/b', 100, 0, 10, { observed: { height: 500, presence: 0.9, px: 90 } }),
      ]),
      options,
      [],
      stats,
    );
    expect(thin.height).toBe(synthesiseHeight('overture/a', 100, 'default'));
    expect(wild.height).toBe(MAX_OBSERVED_HEIGHT_M);
    expect(stats.heightSources.synth).toBe(1);
    expect(stats.heightSources.observed).toBe(1);
  });

  it('keeps courtyards', () => {
    const [b] = externalBuildings(
      cache([cached('overture/court', 0, 0, 40, { holes: [squareRing(0, 0, 10)] })]),
      options,
      [],
    );
    expect(b.holes).toHaveLength(1);
    expect(b.holes?.[0]).toHaveLength(4);
  });

  it('counts sources', () => {
    const stats = emptyStats();
    externalBuildings(
      cache([
        cached('overture/a', 0, 0, 10),
        cached('overture/b', 50, 0, 10, { source: 'microsoft' }),
        cached('overture/c', 100, 0, 10),
      ]),
      options,
      [],
      stats,
    );
    expect(stats.sources).toEqual({ google: 2, microsoft: 1 });
  });
});

describe('buildBaseline with a buildings cache', () => {
  function osmWay(id: number, east: number, north: number, size: number): OverpassElement {
    const ring = squareRing(east, north, size).map(([lon, lat]) => ({ lat, lon }));
    return { type: 'way', id, tags: { building: 'yes' }, geometry: ring };
  }

  it('is unchanged without a cache', () => {
    const elements = [osmWay(1, 0, 0, 10)];
    const plain = buildBaseline(elements, options);
    expect(plain.baseline.buildings).toHaveLength(1);
    expect(plain.stats.sources).toEqual({ osm: 1 });
    expect(plain.stats.heightSources.observed).toBe(0);
  });

  it('adds external footprints, applies observed heights to OSM buildings, and sorts by id', () => {
    const elements = [osmWay(1, 0, 0, 10)];
    const { baseline, stats } = buildBaseline(elements, {
      ...options,
      buildings: cache([
        cached('osm/way/1', 0, 0, 10, { source: 'osm', observed: { height: 9.2, presence: 0.9, px: 80 } }),
        cached('overture/z', 100, 0, 10, { observed: { height: 4.1, presence: 0.7, px: 60 } }),
        cached('overture/a', 200, 0, 10),
      ]),
    });
    expect(baseline.buildings.map((b) => b.id)).toEqual(['osm/way/1', 'overture/a', 'overture/z']);
    expect(baseline.buildings.find((b) => b.id === 'osm/way/1')?.height).toBe(9.2);
    expect(stats.sources).toEqual({ google: 2, osm: 1 });
    expect(stats.heightSources).toEqual({ height: 0, levels: 0, observed: 2, synth: 1 });
  });

  it('lets a tag beat an observation on an OSM building', () => {
    const tagged: OverpassElement = { ...osmWay(1, 0, 0, 10), tags: { building: 'yes', 'building:levels': '3' } };
    const { baseline, stats } = buildBaseline([tagged], {
      ...options,
      buildings: cache([
        cached('osm/way/1', 0, 0, 10, { source: 'osm', observed: { height: 40, presence: 0.9, px: 80 } }),
      ]),
    });
    expect(baseline.buildings[0].height).toBe(9.6);
    expect(stats.heightSources.levels).toBe(1);
  });
});
