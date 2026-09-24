/**
 * The Present chapter's two PMTiles files, as the page addresses them.
 *
 * Both live under `public/` rather than `src/scenes/`, because MapLibre reads them by
 * HTTP range request at runtime rather than through the bundler: the exhibition
 * laptop serves them from the static export offline, and a phone fetches only the
 * tiles it looks at from the same path on the Vercel URL.
 *
 * The basemap's name pins the Protomaps build it was extracted from — bump it in
 * `scripts/fetch-basemap.sh` and here together. The cells file is named by its
 * sidecar, which `scripts/build-cells.py` writes beside the scene documents.
 */

import cells from './wat-ket.cells.json';

/** Must match `scripts/fetch-basemap.sh`'s defaults. */
export const BASEMAP_FILE = 'basemap/protomaps-20260923-z6.pmtiles';

export const CELLS_META = cells as unknown as {
  file: string;
  sha256: string;
  origin: [number, number];
  radiusKm: number;
  cellDeg: number;
  stats: { cells: number; totalPeople: number; max: number };
};

/** `pmtiles://` plus a root-relative path: the protocol fetches it from this origin. */
export const MAP_URLS = {
  basemap: `pmtiles:///${BASEMAP_FILE}`,
  cells: `pmtiles:///${CELLS_META.file}`,
};
