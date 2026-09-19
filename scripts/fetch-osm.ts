#!/usr/bin/env -S npx tsx
/**
 * Generate `baseline` in src/scenes/wat-ket.json from OpenStreetMap plus the
 * satellite-derived buildings cache.
 *
 *   npm run fetch:osm                        # uses the cached Overpass response
 *   npm run fetch:osm -- --refresh           # re-queries Overpass
 *   npm run fetch:osm -- --osm-only          # ignore the buildings cache
 *   npm run fetch:osm -- --extent -500,-900,700,750   # try a different clip
 *   npm run fetch:osm -- --clip tambon       # clip to the Wat Ket ADM3 polygon as well
 *
 * Two caches feed this, both gitignored: the Overpass response, fetched here, and
 * `data/buildings-cache/wat-ket.buildings.json`, written by
 * `npm run fetch:buildings` (Overture footprints and observed heights — see
 * scripts/fetch-buildings.py). The scene document is committed and the caches are
 * not: the exhibition must not depend on a third-party API being up. Re-running
 * this with the same caches must produce a BYTE-IDENTICAL document — that is the
 * property the whole pipeline rests on, and it is what the plan's verification
 * checks.
 *
 * Changing the extent is a three-step dance, because the buildings cache is cut
 * from the committed boundary: `--osm-only --extent …` writes the new boundary,
 * then `fetch:buildings`, then a plain `fetch:osm`.
 *
 * Everything numeric lives in src/engine/{clip,osm,satellite,synth}.ts and is
 * unit-tested. This file is the part that cannot be: argument parsing, the
 * network, and I/O.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bounds, clipRingToConvex, polygonArea, rectRing } from '../src/engine/clip';
import type { Poly, Ring } from '../src/engine/clip';
import { buildBaseline, checkBudget, clipAreaKm2 } from '../src/engine/osm';
import type { OverpassResponse } from '../src/engine/osm';
import { localMetresToLatLon, projectToLocalMetres } from '../src/engine/project';
import type { LatLon } from '../src/engine/project';
import type { BuildingsCache } from '../src/engine/satellite';
import { validateScene } from '../src/engine/scene';
import type { SceneDocument } from '../src/engine/scene';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCENE = join(REPO, 'src/scenes/wat-ket.json');
const BOUNDARY = join(REPO, 'src/scenes/wat-ket.boundary.geojson');
const CACHE = join(REPO, 'data/osm-cache/wat-ket.overpass.json');
const BUILDINGS_CACHE = join(REPO, 'data/buildings-cache/wat-ket.buildings.json');

/**
 * The scene's working extent, in local metres around `origin`.
 *
 * **This is an editorial decision, and it is the one to argue with.**
 *
 * Chosen 12 Sep 2026 at 1.50 x 2.70 km (-500,-1600 → 1000,1100), intersected with
 * the Wat Ket tambon: the widest clip that satisfied the 4 km2 phone budget, keeping
 * Wat Ket temple, the Charoenrat and Kaewnawarat frontages, Nawarat Bridge and the
 * heritage strip south to Ping Nakara in one scene.
 *
 * Tripled 19 Sep 2026 to 4.50 x 8.10 km — that rectangle grown by its own size in
 * every direction — and no longer cut to the tambon, so the scene crosses the Ping
 * onto the old-city bank. Measured before deciding: ~54,000 buildings and ~780k
 * triangles, eight times the phone ceiling. Yan chose it with those numbers in
 * hand, so BUDGET below is `installation` and the phone surface is knowingly out of
 * budget until level-of-detail work lands. See
 * plans/2026-09-19_extended-extent.plan.md.
 *
 * Pushed west the same day to -3300 so the whole moated old city is in: the west
 * moat runs at about x = -2,880 m and a scene that cut it in half read as neither
 * Wat Ket nor Chiang Mai. 5.80 x 8.10 km.
 *
 * Widen or move it and re-run; the script reports the area and the triangle count.
 * Nothing downstream hard-codes these numbers.
 */
const DEFAULT_EXTENT = { west: -3300, south: -4300, east: 2500, north: 3800 };

/**
 * What bounds the scene: the extent rectangle alone, or the rectangle intersected
 * with the Wat Ket ADM3 polygon. `tambon` was the rule until 19 Sep 2026 and is one
 * flag away; the polygon itself stays committed as the boundary credit.
 */
type Clip = 'rect' | 'tambon';
const DEFAULT_CLIP: Clip = 'rect';

/**
 * Whether the limits in src/engine/osm.ts REJECT the scene (`phone`: a visitor's own
 * device over the QR code) or only warn (`installation`: the laptop and projector,
 * which have a GPU and a local static export). The limits themselves never move —
 * renaming the budget to fit the scene is how a constraint stops being one — so
 * every run still prints how far over the phone budget this scene is.
 */
type Budget = 'phone' | 'installation';
const BUDGET: Budget = 'installation';

/** Overpass is queried on a bbox slightly larger than the clip, so edge roads join up. */
const QUERY_MARGIN_M = 150;

/**
 * Mirrors, in order. The main instance returns a dispatcher error often enough that
 * a single-endpoint script is a script that fails on the day you need it.
 */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// ------------------------------------------------------------------ arguments

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const refresh = process.argv.includes('--refresh');
const osmOnly = process.argv.includes('--osm-only');
const clipMode: Clip = (() => {
  const value = arg('clip') ?? DEFAULT_CLIP;
  if (value !== 'rect' && value !== 'tambon') throw new Error(`--clip wants rect or tambon`);
  return value;
})();
const extentArg = arg('extent');
const extent = extentArg
  ? (() => {
      const [west, south, east, north] = extentArg.split(',').map(Number);
      if (![west, south, east, north].every(Number.isFinite)) {
        throw new Error(`--extent wants four numbers: west,south,east,north`);
      }
      return { west, south, east, north };
    })()
  : DEFAULT_EXTENT;

// ------------------------------------------------------------------ overpass

function overpassQuery(south: number, west: number, north: number, east: number): string {
  const bbox = `${south},${west},${north},${east}`;
  return `[out:json][timeout:300];
(
  way["building"](${bbox});
  relation["building"](${bbox});
  way["building:part"](${bbox});
  way["highway"](${bbox});
  way["natural"="water"](${bbox});
  relation["natural"="water"](${bbox});
  way["waterway"="riverbank"](${bbox});
  way["landuse"](${bbox});
  relation["landuse"](${bbox});
  way["leisure"](${bbox});
  relation["leisure"](${bbox});
  way["natural"~"^(wood|scrub|grassland)$"](${bbox});
);
out geom;`;
}

async function fetchOverpass(query: string): Promise<OverpassResponse> {
  const failures: string[] = [];

  for (const endpoint of ENDPOINTS) {
    process.stdout.write(`  querying ${new URL(endpoint).host} … `);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Overpass asks for a real identifier so it can contact abusers rather
          // than just blocking them.
          'User-Agent': 'cosmolocalcnx/0.1 (+https://github.com/yannaingoak/cosmolocalcnx)',
        },
      });

      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // Overpass answers a runtime error with HTTP 200 and a page of HTML.
      if (!text.trimStart().startsWith('{')) {
        throw new Error(text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140));
      }

      const parsed = JSON.parse(text) as OverpassResponse;
      console.log(`${parsed.elements.length.toLocaleString('en')} elements`);
      return parsed;
    } catch (error) {
      console.log('failed');
      failures.push(`  ${new URL(endpoint).host}: ${(error as Error).message}`);
    }
  }

  throw new Error(`every Overpass endpoint failed:\n${failures.join('\n')}`);
}

// ---------------------------------------------------------------- formatting

/**
 * JSON with coordinate arrays kept on one line.
 *
 * Not cosmetic. `JSON.stringify(doc, null, 2)` puts every number of every footprint
 * on its own line, which turns ~1,600 buildings into a file of several hundred
 * thousand lines that no diff is readable in. The rule is: arrays containing only
 * numbers or only short number-arrays collapse; everything else indents.
 */
function format(value: unknown, depth = 0): string {
  const pad = '  '.repeat(depth);
  const inner = '  '.repeat(depth + 1);

  if (value === null || typeof value !== 'object') return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const flat = value.every((v) => typeof v === 'number');
    if (flat) return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;

    const points = value.every(
      (v) => Array.isArray(v) && v.every((n: unknown) => typeof n === 'number'),
    );
    if (points) {
      const oneLine = `[${value.map((v) => format(v)).join(', ')}]`;
      if (oneLine.length + pad.length <= 160) return oneLine;
      return `[\n${value.map((v) => inner + format(v)).join(',\n')}\n${pad}]`;
    }

    return `[\n${value.map((v) => inner + format(v, depth + 1)).join(',\n')}\n${pad}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  const oneLine = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${format(v)}`).join(', ')} }`;
  if (oneLine.length + pad.length <= 120 && !oneLine.includes('\n')) return oneLine;

  return `{\n${entries
    .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${format(v, depth + 1)}`)
    .join(',\n')}\n${pad}}`;
}

function table(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v.toLocaleString('en')}`)
    .join(', ');
}

// --------------------------------------------------------------------- main

async function main(): Promise<number> {
  const doc = JSON.parse(readFileSync(SCENE, 'utf8')) as SceneDocument;
  const origin = doc.origin as LatLon;

  const boundaryFeature = JSON.parse(readFileSync(BOUNDARY, 'utf8'));
  const tambonRings: number[][][] = boundaryFeature.geometry.coordinates;

  console.log(`Wat Ket baseline`);
  console.log(`  origin   ${origin[0]}, ${origin[1]}`);
  console.log(
    `  boundary ${boundaryFeature.properties.name} (${boundaryFeature.properties.pcode}), ` +
      `${boundaryFeature.properties.area_km2} km2 — ${boundaryFeature.properties.license}`,
  );

  // The tambon, in local metres.
  const tambon: Ring = tambonRings[0].map(
    ([lon, lat]) => projectToLocalMetres([lat, lon], origin),
  );

  // The working extent, either as is or cut to the tambon. This is the scene's
  // actual boundary.
  const rect = rectRing(extent.west, extent.south, extent.east, extent.north);
  const inTambon = clipRingToConvex(tambon, rect);
  if (inTambon.length < 3) {
    console.error('error: the extent does not overlap the tambon at all');
    return 1;
  }
  const sceneRing = clipMode === 'tambon' ? inTambon : rect;

  const clip: Poly[] = [[sceneRing]];
  const areaKm2 = clipAreaKm2(clip);
  const tambonShareKm2 = clipAreaKm2([[inTambon]]);
  console.log(
    `  extent   ${extent.west},${extent.south} → ${extent.east},${extent.north} m ` +
      `(${((extent.east - extent.west) / 1000).toFixed(2)} × ` +
      `${((extent.north - extent.south) / 1000).toFixed(2)} km), clip ${clipMode}`,
  );
  console.log(
    `  scene    ${areaKm2.toFixed(3)} km2 — holds ` +
      `${((tambonShareKm2 / polygonArea([tambon])) * 1e6 * 100).toFixed(0)}% of the tambon` +
      (clipMode === 'rect' ? `, ${((tambonShareKm2 / areaKm2) * 100).toFixed(0)}% of the scene is Wat Ket` : ''),
  );

  // ------------------------------------------------------------- fetch

  const [west, south, east, north] = bounds(sceneRing);
  const [sLat, wLon] = localMetresToLatLon([west - QUERY_MARGIN_M, south - QUERY_MARGIN_M], origin);
  const [nLat, eLon] = localMetresToLatLon([east + QUERY_MARGIN_M, north + QUERY_MARGIN_M], origin);
  const query = overpassQuery(sLat, wLon, nLat, eLon);

  // The bbox is cached with the response. Without it, widening the extent and
  // re-running would quietly clip against a cache that never covered the new area
  // and report a confidently wrong building count.
  const bbox: [number, number, number, number] = [sLat, wLon, nLat, eLon];
  const covers = (had: number[]) =>
    had.length === 4 && had[0] <= sLat && had[1] <= wLon && had[2] >= nLat && had[3] >= eLon;

  interface Cached extends OverpassResponse {
    _bbox?: number[];
  }

  let response: OverpassResponse;
  const cached: Cached | null =
    !refresh && existsSync(CACHE) ? (JSON.parse(readFileSync(CACHE, 'utf8')) as Cached) : null;

  if (cached && covers(cached._bbox ?? [])) {
    response = cached;
    console.log(
      `\n  cache    ${relative(REPO, CACHE)} — ` +
        `${response.elements.length.toLocaleString('en')} elements (--refresh to re-query)`,
    );
  } else {
    if (cached) {
      console.log(`\n  cache    does not cover this extent — re-querying`);
    } else {
      console.log('');
    }
    response = await fetchOverpass(query);
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, JSON.stringify({ _bbox: bbox, elements: response.elements }));
  }

  // ------------------------------------------------------- buildings cache

  let buildings: BuildingsCache | null = null;
  if (osmOnly) {
    console.log(`  satellite --osm-only: baseline buildings come from OSM alone`);
  } else {
    if (!existsSync(BUILDINGS_CACHE)) {
      console.error(
        `\nerror: ${relative(REPO, BUILDINGS_CACHE)} is missing.\n` +
          `  Run \`npm run fetch:buildings\` first, or pass --osm-only for an OSM-only baseline.`,
      );
      return 1;
    }
    buildings = JSON.parse(readFileSync(BUILDINGS_CACHE, 'utf8')) as BuildingsCache;
    // A micro-degree of slack (~0.1 m): the cache stores its bbox to seven decimals
    // and an exact comparison rejects a cache that was cut from this very boundary.
    const EPS = 1e-6;
    const had = buildings._bbox ?? [];
    const coversLonLat =
      had.length === 4 &&
      had[0] <= wLon + EPS &&
      had[1] <= sLat + EPS &&
      had[2] >= eLon - EPS &&
      had[3] >= nLat - EPS;
    if (!coversLonLat) {
      console.error(
        `\nerror: the buildings cache does not cover this extent.\n` +
          `  Write the new boundary with --osm-only first, then \`npm run fetch:buildings\`, ` +
          `then re-run.`,
      );
      return 1;
    }
    console.log(
      `  satellite ${relative(REPO, BUILDINGS_CACHE)} — ` +
        `${buildings.buildings.length.toLocaleString('en')} footprints, ` +
        `Overture ${buildings.overture_release}, heights ${buildings.height_year}`,
    );
  }

  // ------------------------------------------------------------- transform

  const { baseline, stats, triangles } = buildBaseline(response.elements, {
    origin,
    clip,
    buildings,
  });

  const n = Math.max(1, baseline.buildings.length);
  const pct = (count: number) => `${((count / n) * 100).toFixed(0)}%`;
  console.log(`\n  buildings ${baseline.buildings.length.toLocaleString('en')}`);
  console.log(`    sources   ${table(stats.sources)}, ${stats.duplicates} duplicates dropped`);
  console.log(`    kinds     ${table(stats.kinds)}`);
  console.log(
    `    height    tagged ${stats.heightSources.height}, ` +
      `levels ${stats.heightSources.levels}, ` +
      `observed ${stats.heightSources.observed} (${pct(stats.heightSources.observed)}), ` +
      `synthesised ${stats.heightSources.synth} (${pct(stats.heightSources.synth)})`,
  );
  console.log(
    `    skipped   ${stats.skipped.buildings.outsideClip} outside clip, ` +
      `${stats.skipped.buildings.noGeometry} without geometry, ` +
      `${stats.skipped.buildings.degenerate} degenerate or too small`,
  );
  console.log(
    `    detail    ${stats.multipolygons} multipolygon relations, ${stats.holes} courtyards`,
  );
  console.log(
    `  roads     ${baseline.roads.length.toLocaleString('en')} ` +
      `(${stats.skipped.roads.outsideClip} outside clip)`,
  );
  console.log(`  water     ${baseline.water.length}`);
  console.log(`  green     ${baseline.green.length}`);
  console.log(`    kinds     ${table(stats.areaKinds)}`);

  const heights = baseline.buildings.map((b) => b.height).sort((a, b) => a - b);
  if (heights.length) {
    const at = (q: number) => heights[Math.floor(q * (heights.length - 1))];
    console.log(
      `  skyline   min ${at(0).toFixed(1)} m, median ${at(0.5).toFixed(1)} m, ` +
        `p95 ${at(0.95).toFixed(1)} m, max ${at(1).toFixed(1)} m, ` +
        `${new Set(heights).size} distinct heights`,
    );
  }

  // ------------------------------------------------------------- budget

  console.log(`\n  triangles ~${triangles.toLocaleString('en')} (baseline buildings only)`);
  const { errors, warnings } = checkBudget({ areaKm2, triangles });
  for (const warning of warnings) console.log(`  warning: ${warning}`);
  if (BUDGET === 'installation') {
    for (const error of errors) console.log(`  OVER PHONE BUDGET: ${error}`);
    if (errors.length) {
      console.log(
        `  budget    installation — written anyway; the phone surface needs level-of-detail work`,
      );
    }
  } else {
    for (const error of errors) console.error(`  REJECTED: ${error}`);
    if (errors.length) {
      console.error('\nNothing written. Adjust --extent and try again.');
      return 1;
    }
  }

  // ------------------------------------------------------------- write

  // `scenarios` and `hotspots` are authored content and are never touched here.
  // The boundary is written as GeoJSON — lon/lat, as GeoJSON requires.
  const next: SceneDocument = {
    ...doc,
    boundary: {
      type: 'Polygon',
      coordinates: [
        [...sceneRing, sceneRing[0]].map((p) => {
          const [lat, lon] = localMetresToLatLon(p, origin);
          return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
        }),
      ],
    },
    baseline,
  };

  const problems = validateScene(next);
  if (problems.length) {
    console.error(`\nerror: the result does not validate:`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }

  const text = `${format(next)}\n`;
  const unchanged = existsSync(SCENE) && readFileSync(SCENE, 'utf8') === text;
  writeFileSync(SCENE, text);

  console.log(
    `\n  wrote ${relative(REPO, SCENE)} — ${(text.length / 1024).toFixed(0)} KB` +
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
