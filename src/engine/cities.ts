/**
 * Cities on the circle: which to label, and what is under a given cell.
 *
 * The printed A0 labels the handful of cities sitting on the circle's rim, which is
 * its argument in miniature — Karachi, Changchun, Surabaya and Fukuoka are all
 * about 3,430 km out, so the rim is not an abstraction, it runs through places
 * people have heard of. The app ships every city over 100,000 inside the circle and
 * does something more expansive with them.
 *
 * Pure, and tested, because label selection is a numeric judgement with no stack
 * trace: "the labels are all in east China" is a bug that a screenshot shows and a
 * type checker never will.
 */

import type { RegionKm } from './region';

export interface City {
  name: string;
  country: string;
  population: number;
  /** Kilometres east and north of the circle's centre. */
  km: RegionKm;
}

export interface CityFile {
  minPopulation: number;
  count: number;
  cities: City[];
}

export function distanceFromCentreKm(city: City): number {
  return Math.hypot(city.km[0], city.km[1]);
}

/**
 * Which cities get a permanent label.
 *
 * NOT simply the biggest. The eight most populous cities inside this circle are
 * seven Chinese cities and Ho Chi Minh City, which would stack eight labels into
 * one corner and leave India, Indonesia and Japan unnamed — a worse map than no
 * labels at all. So selection is greedy by population subject to a minimum
 * separation, which buys spatial coverage at the cost of a few household names.
 *
 * `rimCount` then adds cities sitting near the rim, because they are what makes the
 * circle's size legible: a visitor who reads "Karachi" and "Fukuoka" on opposite
 * edges understands 3,437 km without being told it.
 *
 * Input is assumed sorted by population descending, which is how the build script
 * writes it — so this is one pass and no sort on a phone at load.
 */
export function pickLabels(
  cities: readonly City[],
  radiusKm: number,
  options: { count?: number; minSeparationKm?: number; rimCount?: number } = {},
): City[] {
  const {
    count = 16,
    /**
     * Tuned, not guessed. At 18% of the radius the rule excluded DELHI — one of the
     * largest cities on earth — because Lahore is 410 km away and GeoNames gives
     * Lahore a slightly bigger number. A label set that names Lahore and not Delhi
     * is wrong in a way no test would have caught. At 11% the India/Pakistan
     * corridor keeps both, and east China still contributes eight names rather than
     * eleven. Recognisability is the thing being bought here, not coverage.
     */
    minSeparationKm = radiusKm * 0.11,
    rimCount = 4,
  } = options;

  const chosen: City[] = [];

  const farEnough = (city: City) =>
    chosen.every(
      (other) =>
        Math.hypot(city.km[0] - other.km[0], city.km[1] - other.km[1]) >= minSeparationKm,
    );

  for (const city of cities) {
    if (chosen.length >= count) break;
    if (farEnough(city)) chosen.push(city);
  }

  // The rim, last, so it can never be crowded out by the interior.
  if (rimCount > 0 && radiusKm > 0) {
    const nearRim = [...cities]
      .filter((c) => distanceFromCentreKm(c) >= radiusKm * 0.93)
      .sort((a, b) => b.population - a.population);

    for (const city of nearRim) {
      if (chosen.filter((c) => distanceFromCentreKm(c) >= radiusKm * 0.93).length >= rimCount) {
        break;
      }
      if (farEnough(city)) chosen.push(city);
    }
  }

  return chosen;
}

/** Which grid cell a position falls in. Derived, never stored — see the build script. */
export function cellAt(km: RegionKm, radiusKm: number, size: number): [number, number] | null {
  const cell = (2 * radiusKm) / size;
  const col = Math.floor((km[0] + radiusKm) / cell);
  const row = Math.floor((radiusKm - km[1]) / cell);
  if (col < 0 || col >= size || row < 0 || row >= size) return null;
  return [col, row];
}

/** The centre of a cell, in kilometres — for drawing a highlight over it. */
export function cellCentreKm(
  [col, row]: [number, number],
  radiusKm: number,
  size: number,
): RegionKm {
  const cell = (2 * radiusKm) / size;
  return [(col + 0.5) * cell - radiusKm, radiusKm - (row + 0.5) * cell];
}

/**
 * Every city inside one grid cell, biggest first.
 *
 * A 13 km cell routinely holds more than one — Dhaka and Narayanganj, Shenzhen and
 * Dongguan — and naming only the largest would quietly misreport what the bright
 * patch actually is.
 */
export function citiesInCell(
  cities: readonly City[],
  cell: [number, number],
  radiusKm: number,
  size: number,
): City[] {
  return cities.filter((city) => {
    const at = cellAt(city.km, radiusKm, size);
    return at !== null && at[0] === cell[0] && at[1] === cell[1];
  });
}

/**
 * The nearest city to a point, within a radius. The fallback when a cell is empty.
 *
 * A visitor who taps a bright patch and gets nothing assumes the feature is broken,
 * not that they missed by one cell — so a tap always answers with something, and
 * the viewer says how far away it is rather than pretending it was a hit.
 */
export function nearestCity(
  cities: readonly City[],
  km: RegionKm,
  withinKm: number,
): { city: City; distanceKm: number } | null {
  let best: { city: City; distanceKm: number } | null = null;
  for (const city of cities) {
    const d = Math.hypot(city.km[0] - km[0], city.km[1] - km[1]);
    if (d <= withinKm && (best === null || d < best.distanceKm)) {
      best = { city, distanceKm: d };
    }
  }
  return best;
}
