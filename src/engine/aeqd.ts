/**
 * Azimuthal equidistant projection, for the REGION register.
 *
 * Every distance measured from the centre is to scale, which is the one property
 * that matters here: the Valeriepieris circle has to be a *true circle* on screen,
 * and Wat Ket has to sit at its true 280 km from the centre. Any other projection
 * turns the claim "half of humanity lives inside this circle" into a claim about an
 * ellipse, which is not the claim.
 *
 * It is also what the printed A0 in the same room uses. The screen and the wall
 * have to agree or a visitor standing between them will notice.
 *
 * ---
 *
 * TWO EARTH RADII LIVE IN THIS CODEBASE. That is deliberate, and it is a trap:
 *
 *   project.ts  EARTH_RADIUS_M     = 6378137     (equatorial, WGS84 semi-major)
 *   aeqd.ts     AEQD_EARTH_RADIUS_KM = 6371.0088 (mean)
 *
 * Both are right for their job. A tangent plane over 1 km of riverside wants the
 * local radius, and at Wat Ket's latitude the equatorial figure with a cos(lat)
 * correction is the standard approximation. A sphere spanning 3,437 km — a third of
 * the way to the pole — wants the mean radius, because the error is no longer local
 * and no cos(lat) factor can absorb it.
 *
 * Using the wrong one here costs about 0.1% — 3 km on the circle's radius, which is
 * invisible — so nothing will ever tell you it is wrong. The defence is the anchor
 * test in __tests__/aeqd.test.ts, which pins the one number that would move.
 */

import type { LatLon } from './project';
export type { LatLon };

/** Mean earth radius (IUGG). NOT project.ts's equatorial radius — see the header. */
export const AEQD_EARTH_RADIUS_KM = 6371.0088;

const DEG = Math.PI / 180;

/** Kilometres east and north of the projection centre. Not metres — see docs/architecture.md. */
export type RegionKm = [number, number];

export interface GreatCircle {
  distanceKm: number;
  /** Initial bearing from `from` to `to`, degrees clockwise from north, in [0, 360). */
  bearingDeg: number;
}

/**
 * Great-circle distance and initial bearing.
 *
 * Distance uses the haversine rather than the spherical law of cosines: at the
 * scale of a neighbourhood — which is where the "is the origin inside its own
 * circle?" validation runs — `acos` of a number within 1e-10 of 1 loses most of its
 * significant figures, and can hand back NaN outright.
 */
export function greatCircle(from: LatLon, to: LatLon): GreatCircle {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;

  const p1 = lat1 * DEG;
  const p2 = lat2 * DEG;
  const dp = (lat2 - lat1) * DEG;
  const dl = (lon2 - lon1) * DEG;

  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const distanceKm = 2 * AEQD_EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));

  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  // atan2(0, 0) is 0, which is the right answer for "no bearing" at zero distance.
  const bearingDeg = (Math.atan2(y, x) / DEG + 360) % 360;

  return { distanceKm, bearingDeg };
}

/**
 * lat/lon to kilometres east/north of the projection centre.
 *
 * The whole projection is two lines once `greatCircle` exists, because that is what
 * azimuthal equidistant *is*: plot the true distance along the true bearing.
 */
export function aeqdForward(point: LatLon, centre: LatLon): RegionKm {
  const { distanceKm, bearingDeg } = greatCircle(centre, point);
  const theta = bearingDeg * DEG;
  return [distanceKm * Math.sin(theta), distanceKm * Math.cos(theta)];
}

/**
 * The inverse — used to walk the output grid in `scripts/build-region.py`'s mirror
 * of this file, and to label distance rings.
 *
 * At the antipode (distance = half the circumference) longitude is undefined and
 * every direction is the same place. Returning the pole-ish answer that falls out
 * of the maths beats returning NaN, which would poison a whole raster row.
 */
export function aeqdInverse([east, north]: RegionKm, centre: LatLon): LatLon {
  const [centreLat, centreLon] = centre;

  const distanceKm = Math.hypot(east, north);
  if (distanceKm === 0) return [centreLat, centreLon];

  const c = distanceKm / AEQD_EARTH_RADIUS_KM;
  const theta = Math.atan2(east, north);

  const p0 = centreLat * DEG;
  const sinLat =
    Math.sin(p0) * Math.cos(c) + Math.cos(p0) * Math.sin(c) * Math.cos(theta);
  const lat = Math.asin(Math.max(-1, Math.min(1, sinLat)));

  const lon =
    centreLon * DEG +
    Math.atan2(
      Math.sin(theta) * Math.sin(c) * Math.cos(p0),
      Math.cos(c) - Math.sin(p0) * Math.sin(lat),
    );

  // Normalise into [-180, 180) so the output is comparable with any GeoJSON.
  return [lat / DEG, (((lon / DEG + 180) % 360) + 360) % 360 - 180];
}

/**
 * The points `km` from `centre`, as lat/lon — a circle on the sphere.
 *
 * Nothing new: a point at distance r and bearing θ IS the inverse projection of
 * (r sin θ, r cos θ), which is what azimuthal equidistant means. This is the ring the
 * Present chapter draws on the globe, and it is a true circle there for the same reason
 * it was on the AEQD plane. Closed — the last point repeats the first — so it can be a
 * GeoJSON polygon or line as it stands.
 */
export function circleAround(centre: LatLon, km: number, steps = 256): LatLon[] {
  const n = Math.max(3, Math.floor(steps));
  const out: LatLon[] = [];
  for (let i = 0; i <= n; i++) {
    const theta = (i / n) * Math.PI * 2;
    out.push(aeqdInverse([km * Math.sin(theta), km * Math.cos(theta)], centre));
  }
  return out;
}
