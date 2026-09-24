import { describe, expect, it } from 'vitest';
import cityFile from '@/scenes/regions/aeqd_18.791_99.004_r3437.cities.json';
import {
  cellAt,
  cellCentreKm,
  citiesInCell,
  distanceFromCentreKm,
  nearestCity,
  pickLabels,
  type City,
  type CityFile,
} from '../cities';

const FILE = cityFile as unknown as CityFile;
const CITIES = FILE.cities;
const RADIUS = 3437;
const GRID = 512;

describe('the committed city file', () => {
  it('holds every city over 100,000 inside the circle', () => {
    expect(FILE.minPopulation).toBe(100_000);
    expect(FILE.count).toBe(CITIES.length);
    expect(CITIES.length).toBeGreaterThan(2000);
  });

  it('contains nothing outside the circle', () => {
    for (const city of CITIES) {
      expect(distanceFromCentreKm(city)).toBeLessThanOrEqual(RADIUS);
    }
  });

  it('is sorted by population descending, so the viewer never sorts on load', () => {
    for (let i = 1; i < CITIES.length; i++) {
      expect(CITIES[i - 1].population).toBeGreaterThanOrEqual(CITIES[i].population);
    }
  });

  /**
   * The rim, checked against the field's own radius.
   *
   * Until 24 Sep 2026 this compared rim distances with the printed A0 hanging in the
   * same room. The circle is centred on Wat Ket now and the poster's is not, so the
   * two legitimately disagree about which cities sit on the rim; what must still hold
   * is that every city is inside the circle and that the file reaches the rim at all.
   */
  it('keeps every city inside the circle, and reaches its rim', () => {
    let furthest = 0;
    for (const city of CITIES) {
      const d = distanceFromCentreKm(city);
      expect(d).toBeLessThanOrEqual(RADIUS + 1);
      if (d > furthest) furthest = d;
    }
    // Something within 1% of the rim, or the file was clipped short.
    expect(furthest).toBeGreaterThan(RADIUS * 0.99);
  });
});

describe('pickLabels', () => {
  const picked = pickLabels(CITIES, RADIUS);

  /**
   * The bug this function exists to prevent: the eight most populous cities in this
   * circle are seven Chinese ones and Ho Chi Minh City.
   */
  it('does not stack every label into east China', () => {
    const countries = new Set(picked.map((c) => c.country));
    expect(countries.size).toBeGreaterThanOrEqual(6);
    const chinese = picked.filter((c) => c.country === 'CN').length;
    expect(chinese).toBeLessThan(picked.length / 2);
  });

  /**
   * The separation rule once excluded Delhi because Lahore is 410 km away and
   * GeoNames gives it a slightly larger population. A label set naming Lahore and
   * not Delhi is wrong in a way that only a human reading the list would notice,
   * so the list is pinned here.
   */
  it('names the cities a visitor would expect to find', () => {
    const names = new Set(picked.map((c) => c.name));
    for (const expected of ['Shanghai', 'Delhi', 'Mumbai', 'Seoul', 'Jakarta', 'Dhaka']) {
      expect(names, `${expected} is labelled`).toContain(expected);
    }
  });

  it('keeps every label well clear of the others', () => {
    const separation = RADIUS * 0.11;
    const interior = picked.filter((c) => distanceFromCentreKm(c) < RADIUS * 0.93);
    for (let i = 0; i < interior.length; i++) {
      for (let j = i + 1; j < interior.length; j++) {
        const d = Math.hypot(
          interior[i].km[0] - interior[j].km[0],
          interior[i].km[1] - interior[j].km[1],
        );
        expect(d, `${interior[i].name} vs ${interior[j].name}`).toBeGreaterThanOrEqual(
          separation,
        );
      }
    }
  });

  /** The rim is what makes 3,437 km legible without stating it. */
  it('always names some cities on the rim, however big the interior gets', () => {
    const rim = picked.filter((c) => distanceFromCentreKm(c) >= RADIUS * 0.93);
    expect(rim.length).toBeGreaterThanOrEqual(2);
  });

  it('still leads with the largest city of all', () => {
    expect(picked[0].name).toBe('Shanghai');
  });

  it('respects a smaller count', () => {
    expect(pickLabels(CITIES, RADIUS, { count: 5, rimCount: 0 })).toHaveLength(5);
  });

  it('survives an empty list rather than throwing', () => {
    expect(pickLabels([], RADIUS)).toEqual([]);
  });
});

describe('cellAt / cellCentreKm', () => {
  it('puts the circle centre in the middle of the grid', () => {
    expect(cellAt([0, 0], RADIUS, GRID)).toEqual([GRID / 2, GRID / 2]);
  });

  it('rejects a point outside the grid rather than clamping it onto an edge', () => {
    expect(cellAt([RADIUS * 1.5, 0], RADIUS, GRID)).toBeNull();
    expect(cellAt([0, -RADIUS * 1.5], RADIUS, GRID)).toBeNull();
  });

  it('round-trips a cell through its own centre', () => {
    for (const cell of [[0, 0], [100, 300], [511, 511]] as [number, number][]) {
      expect(cellAt(cellCentreKm(cell, RADIUS, GRID), RADIUS, GRID)).toEqual(cell);
    }
  });

  it('runs north up and east right, matching the field', () => {
    const north = cellAt([0, 1000], RADIUS, GRID)!;
    const south = cellAt([0, -1000], RADIUS, GRID)!;
    expect(north[1]).toBeLessThan(south[1]);
    expect(cellAt([1000, 0], RADIUS, GRID)![0]).toBeGreaterThan(GRID / 2);
  });
});

describe('citiesInCell', () => {
  it('finds every city sharing one 13 km cell, not just the biggest', () => {
    // Somewhere in this circle at least one cell holds two cities — the deltas are
    // full of them, and reporting only the largest would misname the bright patch.
    const seen = new Map<string, City[]>();
    for (const city of CITIES) {
      const cell = cellAt(city.km, RADIUS, GRID);
      if (!cell) continue;
      const key = cell.join(',');
      seen.set(key, [...(seen.get(key) ?? []), city]);
    }
    const shared = [...seen.values()].filter((list) => list.length > 1);
    expect(shared.length).toBeGreaterThan(0);

    const [example] = shared;
    const cell = cellAt(example[0].km, RADIUS, GRID)!;
    expect(citiesInCell(CITIES, cell, RADIUS, GRID).length).toBe(example.length);
  });

  it('returns nothing for an empty cell rather than the nearest thing', () => {
    // Deep ocean, south-west of the centre.
    const empty = cellAt([-3000, -1500], RADIUS, GRID)!;
    expect(citiesInCell(CITIES, empty, RADIUS, GRID)).toEqual([]);
  });
});

describe('nearestCity', () => {
  it('answers a near miss, so a tap never silently does nothing', () => {
    const bangkok = CITIES.find((c) => c.name === 'Bangkok')!;
    const near = nearestCity(CITIES, [bangkok.km[0] + 8, bangkok.km[1] + 8], 60);
    expect(near).not.toBeNull();
    expect(near!.distanceKm).toBeLessThan(60);
  });

  it('gives up rather than pointing across an ocean', () => {
    expect(nearestCity(CITIES, [-3200, -1800], 50)).toBeNull();
  });
});
