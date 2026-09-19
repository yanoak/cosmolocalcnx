/**
 * Satellite-derived buildings, merged into the baseline.
 *
 * `scripts/fetch-buildings.py` writes a cache of Overture footprints and observed
 * heights from the Open Buildings 2.5D Temporal raster; this is the pure half that
 * folds it into `baseline.buildings` next to what Overpass gave. The rules:
 *
 * - **OSM-sourced rows never come from here.** Overture embeds OpenStreetMap, but
 *   the Overpass cache is newer and carries the tags, so an OSM building's geometry
 *   and kind always come from `osm.ts`. The cache contributes only its observed
 *   height, keyed by the same `osm/way/…` id.
 * - **Everything else is `overture/<id>`, kind `default`.** ML footprints carry no
 *   tags, so they take the stock role and the stock synthesis profile when the
 *   raster has nothing for them.
 * - **An external footprint standing where OSM already has a building is dropped.**
 *   Centroid-in-polygon, not IoU: cheap, deterministic, and enough at this density.
 *
 * Measured 19 Sep 2026 inside the scene clip: 1,184 OSM + 2,188 Google + 738
 * Microsoft, ~62k triangles. See plans/2026-09-19_satellite-footprints.plan.md.
 */

import { centroid, pointInAny, pointInRing } from './clip';
import type { BuildStats, BuildOptions } from './osm';
import { projectRing } from './osm';
import type { BaselineBuilding } from './scene';
import { footprintArea, resolveHeight } from './synth';
import type { ObservedHeight } from './synth';

export type BuildingSource = 'osm' | 'google' | 'microsoft' | 'other';

export interface CachedBuilding {
  /** `osm/way/123` for OSM-sourced rows, `overture/<uuid>` otherwise. */
  id: string;
  source: BuildingSource;
  confidence: number | null;
  /** Closed ring, [lon, lat], as the raw data has it. */
  footprint: [number, number][];
  holes: [number, number][][];
  observed: ObservedHeight | null;
}

export interface BuildingsCache {
  /** [west, south, east, north], degrees. Checked by the import before use. */
  _bbox: number[];
  overture_release: string;
  height_year: number;
  buildings: CachedBuilding[];
}

/**
 * Below this an untagged polygon is a detector blob, not a building. Higher than
 * the 4 m2 OSM floor on purpose: a mapper who tagged a 6 m2 spirit house meant it,
 * a model that drew an 8 m2 rectangle over a water tank did not.
 */
export const MIN_EXTERNAL_AREA_M2 = 12;

/** Every observation in the cache, by scene id — OSM ids included. */
export function observedHeights(cache: BuildingsCache): Map<string, ObservedHeight> {
  const map = new Map<string, ObservedHeight>();
  for (const b of cache.buildings) {
    if (b.observed) map.set(b.id, b.observed);
  }
  return map;
}

function toLatLon(ring: [number, number][]) {
  return ring.map(([lon, lat]) => ({ lat, lon }));
}

/**
 * The non-OSM rows of the cache as baseline buildings, projected and clipped the
 * way `buildingsFromElements` does it, minus any that duplicate an OSM building.
 * Order is the cache's; `buildBaseline` sorts.
 */
export function externalBuildings(
  cache: BuildingsCache,
  { origin, clip }: Pick<BuildOptions, 'origin' | 'clip'>,
  osmBuildings: readonly BaselineBuilding[],
  stats?: BuildStats,
): BaselineBuilding[] {
  const out: BaselineBuilding[] = [];
  const skipped = stats?.skipped.buildings;

  for (const row of cache.buildings) {
    if (row.source === 'osm') continue;

    const footprint = projectRing(toLatLon(row.footprint), origin);
    if (footprint.length < 3) {
      if (skipped) skipped.degenerate += 1;
      continue;
    }

    const area = footprintArea(footprint);
    if (area < MIN_EXTERNAL_AREA_M2) {
      if (skipped) skipped.degenerate += 1;
      continue;
    }

    const here = centroid(footprint);
    if (!pointInAny(here, clip)) {
      if (skipped) skipped.outsideClip += 1;
      continue;
    }

    if (osmBuildings.some((b) => pointInRing(here, b.footprint))) {
      if (stats) stats.duplicates += 1;
      continue;
    }

    const holes = (row.holes ?? [])
      .map((hole) => projectRing(toLatLon(hole), origin))
      .filter((hole) => hole.length >= 3);

    const kind = 'default';
    const { height, from } = resolveHeight({}, { id: row.id, areaM2: area, kind, observed: row.observed });

    if (stats) {
      stats.heightSources[from] += 1;
      stats.sources[row.source] = (stats.sources[row.source] ?? 0) + 1;
      stats.kinds[kind] = (stats.kinds[kind] ?? 0) + 1;
      stats.holes += holes.length;
    }

    out.push(
      holes.length
        ? { id: row.id, footprint, holes, height, kind }
        : { id: row.id, footprint, height, kind },
    );
  }

  return out;
}
