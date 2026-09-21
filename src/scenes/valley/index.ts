/**
 * The committed valley field, resolved from the paths a scene document names.
 *
 * Same reconciliation as `regions/`, `relief/` and `backdrop/`: the document records
 * paths because it has to be readable by a script that knows nothing about a bundler,
 * and the bundler needs literal imports.
 */

import fieldUrl from '../wat-ket.valley.png';
import meta from '../wat-ket.valley.json';
import type { ReliefMeta } from '@/engine/relief';

export interface ValleyAsset {
  url: string;
  meta: ReliefMeta;
}

export const VALLEY_ASSETS: Record<string, ValleyAsset> = {
  'wat-ket.valley.png': {
    url: fieldUrl.src,
    meta: meta as unknown as ReliefMeta,
  },
};
