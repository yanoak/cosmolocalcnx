/**
 * The committed relief fields, resolved from the paths a scene document names.
 *
 * Same reconciliation as `regions/index.ts`: the document records paths because it
 * has to be readable by a script that knows nothing about a bundler, and the
 * bundler needs literal imports. This is the only place a relief artefact is named
 * twice.
 */

import fieldUrl from '../wat-ket.relief.png';
import meta from '../wat-ket.relief.json';
import type { ReliefMeta } from '@/engine/relief';

export interface ReliefAsset {
  url: string;
  meta: ReliefMeta;
}

export const RELIEF_ASSETS: Record<string, ReliefAsset> = {
  'wat-ket.relief.png': {
    url: fieldUrl.src,
    meta: meta as unknown as ReliefMeta,
  },
};
