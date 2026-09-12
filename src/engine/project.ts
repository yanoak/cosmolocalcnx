/**
 * lat/lon to local metres, against the scene's origin.
 *
 * A local tangent-plane approximation is correct at neighbourhood scale — do not
 * reach for full UTM. See docs/architecture.md, "Coordinates and units".
 *
 * Returns [east, north] in metres. The renderer maps that to scene [x, -y] so that
 * north is -Z, which is three.js native.
 */

const EARTH_RADIUS_M = 6_378_137;
const DEG = Math.PI / 180;

export type LatLon = [number, number];
export type LocalMetres = [number, number];

export function projectToLocalMetres(point: LatLon, origin: LatLon): LocalMetres {
  const [lat, lon] = point;
  const [originLat, originLon] = origin;

  const north = (lat - originLat) * DEG * EARTH_RADIUS_M;
  // Scaled by cos(latitude). Forgetting this is the classic way to get a city
  // that is stretched east-west — at Wat Ket it would be about 5% wrong.
  const east = (lon - originLon) * DEG * EARTH_RADIUS_M * Math.cos(originLat * DEG);

  return [east, north];
}

/**
 * The inverse. Used to write the scene's clipped boundary back out as GeoJSON,
 * which is lon/lat by definition — so the document stays readable by any mapping
 * tool, and the elevation sampler has something geographic to walk.
 */
export function localMetresToLatLon([east, north]: LocalMetres, origin: LatLon): LatLon {
  const [originLat, originLon] = origin;
  return [
    originLat + north / (DEG * EARTH_RADIUS_M),
    originLon + east / (DEG * EARTH_RADIUS_M * Math.cos(originLat * DEG)),
  ];
}
