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

import fieldUrl from './aeqd_21.000_100.290_r3437_n512.png';
import meta from './aeqd_21.000_100.290_r3437_n512.json';
import cityFile from './aeqd_21.000_100.290_r3437.cities.json';
import type { CityFile } from '@/engine/cities';
import type { RegionMeta } from '@/engine/region';

export interface RegionAsset {
  url: string;
  meta: RegionMeta;
  cities: CityFile;
}

export const REGION_ASSETS: Record<string, RegionAsset> = {
  'regions/aeqd_21.000_100.290_r3437_n512.png': {
    url: fieldUrl.src,
    meta: meta as unknown as RegionMeta,
    // Named without the cell count: cities belong to the CIRCLE, so changing the
    // grid resolution must not orphan them.
    cities: cityFile as unknown as CityFile,
  },
};
