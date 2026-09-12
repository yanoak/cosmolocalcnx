#!/usr/bin/env -S npx tsx
/**
 * Sample ground elevation across the scene boundary, to a file the RENDERER NEVER READS.
 *
 *   npm run fetch:elevation
 *   npm run fetch:elevation -- --spacing 40
 *
 * This is flood-reference data, not terrain. `docs/architecture.md` forbids
 * rendering elevation — Wat Ket is flat river plain, SRTM is 30 m resolution, and
 * draping buildings onto a sampled surface would cost two days and produce
 * stair-stepping artefacts indistinguishable from a flat plane. `terrain` stays
 * `null` in the scene document, permanently.
 *
 * What it IS for: reasoning about the Ping. Which streets sit below a given river
 * level is a question the 2045 scenarios have to answer, and it is a question about
 * numbers rather than about pixels. The output lives beside the scene document but
 * outside it, so nothing can quietly start rendering it.
 *
 * Source: OpenTopoData's public API. SRTM 30 m, as decided in the plan — not because
 * it is better than Copernicus, but because it is sampleable over HTTP without an
 * account, and at this resolution the two are equivalent for a flood question.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bounds, pointInAny } from '../src/engine/clip';
import type { Poly } from '../src/engine/clip';
import { localMetresToLatLon, projectToLocalMetres } from '../src/engine/project';
import type { LatLon } from '../src/engine/project';
import type { SceneDocument } from '../src/engine/scene';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCENE = join(REPO, 'src/scenes/wat-ket.json');
const OUT = join(REPO, 'src/scenes/wat-ket.elevation.json');

/** Metres between samples. 30 m is SRTM's own resolution; finer is invented detail. */
const DEFAULT_SPACING_M = 40;

const DATASET = 'srtm30m';
const ENDPOINT = 'https://api.opentopodata.org/v1';

/** The public API's documented limits: 100 locations per call, 1 call per second. */
const BATCH = 100;
const THROTTLE_MS = 1100;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Sample {
  /** Local metres, so this lines up with the scene document without reprojecting. */
  at: [number, number];
  /** Metres above sea level, or null where the dataset has no value. */
  elevation: number | null;
}

async function fetchBatch(points: LatLon[]): Promise<(number | null)[]> {
  const locations = points.map(([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`).join('|');
  const response = await fetch(`${ENDPOINT}/${DATASET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `locations=${encodeURIComponent(locations)}`,
  });

  if (!response.ok) {
    throw new Error(`opentopodata HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const body = (await response.json()) as {
    status: string;
    error?: string;
    results?: { elevation: number | null }[];
  };
  if (body.status !== 'OK') throw new Error(`opentopodata: ${body.error ?? body.status}`);

  return (body.results ?? []).map((r) => (typeof r.elevation === 'number' ? r.elevation : null));
}

async function main(): Promise<number> {
  const doc = JSON.parse(readFileSync(SCENE, 'utf8')) as SceneDocument;
  const origin = doc.origin as LatLon;

  const ring = (doc.boundary as { coordinates?: number[][][] })?.coordinates?.[0];
  if (!ring?.length) {
    console.error('error: the scene document has no boundary — run npm run fetch:osm first');
    return 1;
  }

  const spacing = Number(arg('spacing') ?? DEFAULT_SPACING_M);
  if (!Number.isFinite(spacing) || spacing <= 0) {
    console.error('error: --spacing wants a positive number of metres');
    return 1;
  }

  const boundary: Poly[] = [
    [ring.map(([lon, lat]) => projectToLocalMetres([lat, lon], origin))],
  ];
  const [west, south, east, north] = bounds(boundary[0][0]);

  // Only points inside the boundary: a bounding-box grid over this extent would be
  // more than twice the samples, and every one of them is a second of rate limit.
  const grid: [number, number][] = [];
  for (let y = Math.ceil(south / spacing) * spacing; y <= north; y += spacing) {
    for (let x = Math.ceil(west / spacing) * spacing; x <= east; x += spacing) {
      if (pointInAny([x, y], boundary)) grid.push([x, y]);
    }
  }

  const batches = Math.ceil(grid.length / BATCH);
  console.log(`Wat Ket elevation — flood reference, never rendered`);
  console.log(`  dataset  ${DATASET} via ${new URL(ENDPOINT).host}`);
  console.log(`  spacing  ${spacing} m`);
  console.log(
    `  samples  ${grid.length.toLocaleString('en')} inside the boundary ` +
      `(${batches} requests, about ${Math.ceil((batches * THROTTLE_MS) / 1000)} s)`,
  );

  const samples: Sample[] = [];
  for (let i = 0; i < grid.length; i += BATCH) {
    const chunk = grid.slice(i, i + BATCH);
    const elevations = await fetchBatch(chunk.map((p) => localMetresToLatLon(p, origin)));
    chunk.forEach((at, j) => samples.push({ at, elevation: elevations[j] ?? null }));

    process.stdout.write(`\r  fetched  ${samples.length}/${grid.length}`);
    if (i + BATCH < grid.length) await sleep(THROTTLE_MS);
  }
  process.stdout.write('\n');

  const known = samples.filter((s) => s.elevation !== null).map((s) => s.elevation as number);
  if (known.length === 0) {
    console.error('error: every sample came back empty — nothing written');
    return 1;
  }

  const sorted = [...known].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.floor(q * (sorted.length - 1))];

  const output = {
    _comment:
      'Flood reference only. The renderer never reads this and terrain stays null — ' +
      'see "Skip elevation entirely" in docs/architecture.md.',
    dataset: DATASET,
    source: 'https://www.opentopodata.org/datasets/srtm/',
    license: 'SRTM is public domain (NASA/USGS)',
    origin,
    spacing_m: spacing,
    units: 'metres above sea level; positions are local metres against origin',
    stats: {
      count: samples.length,
      known: known.length,
      min: at(0),
      median: at(0.5),
      max: at(1),
    },
    samples,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  const text = `${JSON.stringify(output, null, 1)}\n`;
  const unchanged = existsSync(OUT) && readFileSync(OUT, 'utf8') === text;
  writeFileSync(OUT, text);

  console.log(
    `  range    ${at(0).toFixed(1)} – ${at(1).toFixed(1)} m, median ${at(0.5).toFixed(1)} m ` +
      `(${(at(1) - at(0)).toFixed(1)} m of relief across the district)`,
  );
  console.log(
    `  wrote    ${relative(REPO, OUT)} — ${(text.length / 1024).toFixed(0)} KB` +
      `${unchanged ? ' (byte-identical to the previous run)' : ''}`,
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`\nerror: ${(error as Error).message}`);
    process.exit(1);
  },
);
