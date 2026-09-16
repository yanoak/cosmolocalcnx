import { describe, expect, it } from 'vitest';
import {
  AEQD_EARTH_RADIUS_KM,
  aeqdForward,
  aeqdInverse,
  greatCircle,
} from '../aeqd';
import type { LatLon } from '../project';

/** The Valeriepieris circle, recomputed on GHS-POP E2025. */
const VALERIEPIERIS: LatLon = [21.0, 100.29];
const VALERIEPIERIS_RADIUS_KM = 3437;

/** The scene origin — src/scenes/wat-ket.json. */
const WAT_KET: LatLon = [18.7912, 99.0043];

describe('greatCircle', () => {
  it('is zero at zero distance, without dividing by it', () => {
    const { distanceKm, bearingDeg } = greatCircle(WAT_KET, WAT_KET);
    expect(distanceKm).toBe(0);
    expect(Number.isFinite(bearingDeg)).toBe(true);
  });

  it('wraps bearing into [0, 360) rather than emitting a negative', () => {
    // Due west: the naive atan2 result is -90.
    const west = greatCircle([0, 0], [0, -10]);
    expect(west.bearingDeg).toBeCloseTo(270, 6);

    const north = greatCircle([0, 0], [10, 0]);
    expect(north.bearingDeg).toBeCloseTo(0, 6);

    const east = greatCircle([0, 0], [0, 10]);
    expect(east.bearingDeg).toBeCloseTo(90, 6);
  });

  it('survives the antipode instead of returning NaN', () => {
    const { distanceKm, bearingDeg } = greatCircle([0, 0], [0, 180]);
    expect(distanceKm).toBeCloseTo(Math.PI * AEQD_EARTH_RADIUS_KM, 6);
    expect(Number.isNaN(bearingDeg)).toBe(false);
  });
});

describe('aeqdForward', () => {
  it('puts the centre at the origin', () => {
    expect(aeqdForward(VALERIEPIERIS, VALERIEPIERIS)).toEqual([0, 0]);
  });

  /**
   * THE ANCHOR.
   *
   * This is the single number that tells you the projection is right, and the
   * reason this file was written before anything that renders. If it drifts, the
   * marker is in the wrong place on the circle and the piece's central claim —
   * "this neighbourhood is at the centre of half of humanity" — is quietly false.
   *
   * Cross-checked against the printed A0, which hangs in the same room.
   */
  it('places Wat Ket 280 km from the Valeriepieris centre, at bearing 208.9', () => {
    const { distanceKm, bearingDeg } = greatCircle(VALERIEPIERIS, WAT_KET);

    expect(distanceKm).toBeCloseTo(279.98, 1);
    expect(bearingDeg).toBeCloseTo(208.9, 1);

    const [east, north] = aeqdForward(WAT_KET, VALERIEPIERIS);
    expect(east).toBeCloseTo(-135.38, 1);
    expect(north).toBeCloseTo(-245.08, 1);

    // 8.15% of the radius — comfortably inside, and the reason the marker reads as
    // "near the middle" rather than "somewhere in there".
    expect(distanceKm / VALERIEPIERIS_RADIUS_KM).toBeCloseTo(0.0815, 3);
  });

  /**
   * The defining property of the projection, and the reason it was chosen: the
   * circle on screen is a true circle, so a distance ring means what it says.
   */
  it('preserves distance from the centre along every bearing', () => {
    for (let bearing = 0; bearing < 360; bearing += 17) {
      for (const km of [1, 100, 1000, VALERIEPIERIS_RADIUS_KM, 8000]) {
        const theta = (bearing * Math.PI) / 180;
        const point = aeqdInverse(
          [km * Math.sin(theta), km * Math.cos(theta)],
          VALERIEPIERIS,
        );
        expect(greatCircle(VALERIEPIERIS, point).distanceKm).toBeCloseTo(km, 6);
      }
    }
  });

  it('lands a point at exactly the radius on the circle, not inside or outside it', () => {
    for (let bearing = 0; bearing < 360; bearing += 23) {
      const theta = (bearing * Math.PI) / 180;
      const rim: [number, number] = [
        VALERIEPIERIS_RADIUS_KM * Math.sin(theta),
        VALERIEPIERIS_RADIUS_KM * Math.cos(theta),
      ];
      const [east, north] = aeqdForward(aeqdInverse(rim, VALERIEPIERIS), VALERIEPIERIS);
      expect(Math.hypot(east, north)).toBeCloseTo(VALERIEPIERIS_RADIUS_KM, 6);
    }
  });
});

describe('aeqdInverse', () => {
  it('round-trips forward and back across the circle', () => {
    // A lat/lon grid covering the circle's reach: Karachi to Changchun, Bishkek to
    // Surabaya, which is roughly the rim cities on the poster.
    for (let lat = -10; lat <= 45; lat += 5) {
      for (let lon = 65; lon <= 135; lon += 7) {
        const point: LatLon = [lat, lon];
        const back = aeqdInverse(aeqdForward(point, VALERIEPIERIS), VALERIEPIERIS);
        expect(back[0]).toBeCloseTo(lat, 9);
        expect(back[1]).toBeCloseTo(lon, 9);
      }
    }
  });

  it('returns the centre itself rather than dividing by a zero distance', () => {
    expect(aeqdInverse([0, 0], VALERIEPIERIS)).toEqual(VALERIEPIERIS);
  });

  it('normalises longitude into [-180, 180) when a ring crosses the antimeridian', () => {
    // Far enough east of 100.29 to wrap past 180.
    const [, lon] = aeqdInverse([9000, 0], VALERIEPIERIS);
    expect(lon).toBeGreaterThanOrEqual(-180);
    expect(lon).toBeLessThan(180);
  });
});
