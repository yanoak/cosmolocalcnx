/**
 * The committed backdrop rasters, resolved from the sidecar a scene document names.
 *
 * Same reconciliation as `regions/index.ts` and `relief/index.ts`: the document
 * records paths because it has to be readable by a script that knows nothing about a
 * bundler, and the bundler needs literal imports. This is the only place a backdrop
 * artefact is named twice.
 */

import meta from '../wat-ket.backdrop.json';
import behindUrl from '../wat-ket.backdrop.behind.png';
import frontUrl from '../wat-ket.backdrop.front.png';
import type { BackdropMeta } from '@/engine/backdrop';

export interface BackdropAsset {
  meta: BackdropMeta;
  /** Slice field name to bundled URL. */
  urls: Record<string, string>;
}

export const BACKDROP_ASSETS: Record<string, BackdropAsset> = {
  'wat-ket.backdrop.json': {
    meta: meta as unknown as BackdropMeta,
    urls: {
      'wat-ket.backdrop.behind.png': behindUrl.src,
      'wat-ket.backdrop.front.png': frontUrl.src,
    },
  },
};
