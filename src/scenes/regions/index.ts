/**
 * The committed population fields, resolved from the paths a scene document names.
 *
 * The document records `field` and `meta` as PATHS, because a scene document has to
 * be self-describing and readable by a script that knows nothing about a bundler.
 * The bundler needs literal imports. This module is the three lines that reconcile
 * those two facts, and it is the only place a region artefact is named twice.
 *
 * Adding a second neighbourhood inside the same circle costs nothing here — it
 * reuses this entry, because `build-region.py` names its output by projection
 * rather than by scene precisely so that it can be shared.
 */

import meta from './aeqd_18.791_99.004_r3437_n512.json';
import cityFile from './aeqd_18.791_99.004_r3437.cities.json';
import worldMeta from './aeqd_18.791_99.004_r12000_n1024.json';
import type { CityFile } from '@/engine/cities';
import type { RegionMeta } from '@/engine/region';

/**
 * Since 24 Sep 2026 the PNG fields are not drawn — the Present chapter is a MapLibre
 * map over its own cells layer — so only the sidecars and the city file are bundled.
 * The PNGs stay committed as the generator's output and the source of the curves.
 */
export interface RegionAsset {
  meta: RegionMeta;
  cities: CityFile;
  /** The world outside the circle, same projection, coarser grid. */
  world: { meta: RegionMeta };
}

export const REGION_ASSETS: Record<string, RegionAsset> = {
  'regions/aeqd_18.791_99.004_r3437_n512.png': {
    meta: meta as unknown as RegionMeta,
    // Named without the cell count: cities belong to the CIRCLE, so changing the
    // grid resolution must not orphan them.
    cities: cityFile as unknown as CityFile,
    world: { meta: worldMeta as unknown as RegionMeta },
  },
};
