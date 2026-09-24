#!/usr/bin/env tsx
/**
 * Populate the valley view — the rivers that shaped the basin, and the towns in it.
 *
 *     npm run fetch:valley
 *
 * The valley view is 120 x 120 km of Copernicus DEM and, on its own, a landscape with
 * nothing in it. This adds the two things that make it legible as a place: the Ping
 * running the length of the basin, and the towns strung along it.
 *
 * Writes `src/scenes/wat-ket.valley.features.json`, committed. The Overpass response
 * cache and the GeoNames dump are gitignored — same contract as every other generator
 * here, and for the same reason: the exhibition must not depend on Overpass being up.
 *
 * Byte-identical on a re-run against the same cache.
 *
 * TOWNS come from the GeoNames `cities15000` dump that `build-region.py` already
 * downloads for the region register, so this adds no new data dependency. The
 * threshold is why the list is six rather than twenty: Mae Rim and Chiang Dao are
 * under 15,000 and are not in it. Six reads better at 120 km anyway — a valley
 * labelled twenty times is a table of contents, not a landscape.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectToLocalMetres, type LatLon } from '../src/engine/project';
import type { SceneDocument } from '../src/engine/scene';

const REPO = join(import.meta.dirname, '..');
const SCENES = join(REPO, 'src', 'scenes');
const CACHE_DIR = join(REPO, 'data', 'osm-cache');
const CACHE = join(CACHE_DIR, 'wat-ket.valley.overpass.json');
const GEONAMES = join(REPO, 'data', 'geonames', 'cities15000.txt');

/** Matches the committed valley field's ±60 km box. */
const HALF_KM = 60;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/**
 * Rivers only, and named ones at that — plus, since 24 Sep 2026, the main roads and
 * the railway.
 *
 * `waterway=river` without a name pulls in every irrigation ditch in the Ping valley,
 * which at 120 km across is noise that reads as a scratched surface. The Ping, the Mae
 * Taeng, the Mae Rim and the Mae Kuang are what draw the basin.
 *
 * Roads stop at `primary`: secondary and below at 120 km is a hairnet, and the point
 * of drawing them is the handful of routes that leave the basin — the superhighway,
 * the 118 to Chiang Rai, the 107 to Chiang Dao, the 108 south. `railway=rail` is the
 * one line to Bangkok and its spur; sidings and disused track are left out.
 */
function query(south: number, west: number, north: number, east: number): string {
  const bbox = `${south},${west},${north},${east}`;
  return `[out:json][timeout:240];
(
  way["waterway"="river"]["name"](${bbox});
  way["natural"="water"]["water"="reservoir"](${bbox});
  way["highway"~"^(motorway|trunk|primary)$"](${bbox});
  way["railway"="rail"]["service"!~"."](${bbox});
);
out geom;`;
}

interface OverpassWay {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

/**
 * Same shape as `fetch-osm.ts`'s: form-encoded, identified, and tolerant of Overpass
 * answering a runtime error with HTTP 200 and a page of HTML.
 *
 * With a backoff, because the mirrors rate-limit and a 429 on the first pass is the
 * normal case rather than a failure — this asks for one query, once, and can afford
 * to wait for it.
 */
async function overpass(query: string): Promise<{ elements: OverpassWay[] }> {
  let lastError: unknown;
  for (let round = 0; round < 3; round++) {
    for (const endpoint of ENDPOINTS) {
      process.stdout.write(`  querying ${new URL(endpoint).host} … `);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'cosmolocalcnx/0.1 (+https://github.com/yannaingoak/cosmolocalcnx)',
          },
        });
        const text = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!text.trimStart().startsWith('{')) {
          throw new Error(text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140));
        }
        console.log('ok');
        return JSON.parse(text) as { elements: OverpassWay[] };
      } catch (error) {
        lastError = error;
        console.log(`failed: ${error instanceof Error ? error.message : error}`);
      }
    }
    const wait = 20 * (round + 1);
    console.log(`  all mirrors busy; waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  throw lastError ?? new Error('every Overpass endpoint failed');
}

/**
 * Douglas–Peucker, so a 120 km river is a few hundred points rather than a few
 * thousand. At this scale the tolerance is well under a pixel.
 */
function simplify(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length < 3) return points;

  let worst = 0;
  let at = 0;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const d =
      length === 0
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
    if (d > worst) {
      worst = d;
      at = i;
    }
  }

  if (worst <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, at + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(at), tolerance),
  ];
}

interface ValleyFeatures {
  _comment: string;
  halfKm: number;
  rivers: { id: string; name: string; path: [number, number][] }[];
  /** motorway, trunk or primary — the OSM class, so a renderer can weight them — and the
   *  route number, so the Past can pick Highway 11 out of the rest. */
  roads: { id: string; kind: string; ref?: string; path: [number, number][] }[];
  rails: { id: string; path: [number, number][] }[];
  towns: { name: string; population: number; at: [number, number] }[];
}

async function main(): Promise<number> {
  const doc = JSON.parse(
    readFileSync(join(SCENES, 'wat-ket.json'), 'utf8'),
  ) as SceneDocument;
  const origin = doc.origin as LatLon;

  // A generous degree box around the metre box, then clipped properly below.
  const dLat = (HALF_KM * 1000) / 111_320;
  const dLon = dLat / Math.cos((origin[0] * Math.PI) / 180);
  const box = {
    south: origin[0] - dLat,
    west: origin[1] - dLon,
    north: origin[0] + dLat,
    east: origin[1] + dLon,
  };

  // `--refresh` asks Overpass again. Needed whenever the query changes — the cache is
  // keyed on nothing but the file name, on purpose: one query, one cache, no surprises.
  const refresh = process.argv.includes('--refresh');
  let response: { elements: OverpassWay[] };
  if (existsSync(CACHE) && !refresh) {
    console.log(`  cache    ${CACHE.replace(REPO + '/', '')}`);
    response = JSON.parse(readFileSync(CACHE, 'utf8')) as { elements: OverpassWay[] };
  } else {
    response = await overpass(query(box.south, box.west, box.north, box.east));
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE, JSON.stringify(response));
  }

  const halfM = HALF_KM * 1000;
  const inside = ([x, y]: [number, number]) => Math.abs(x) <= halfM && Math.abs(y) <= halfM;

  const rivers: ValleyFeatures['rivers'] = [];
  const roads: ValleyFeatures['roads'] = [];
  const rails: ValleyFeatures['rails'] = [];
  for (const way of response.elements) {
    if (!way.geometry?.length) continue;
    const projected = way.geometry
      .map((p) => projectToLocalMetres([p.lat, p.lon], origin))
      .map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as [number, number]);
    // Keep a way that crosses the box even if most of it is outside: the Ping runs
    // off both ends and cutting it at the edge is what makes a river look like a canal.
    if (!projected.some(inside)) continue;
    const path = simplify(projected, 60);
    if (path.length < 2) continue;
    const id = `osm/way/${way.id}`;
    const tags = way.tags ?? {};
    if (tags.waterway || tags.natural) {
      rivers.push({ id, name: tags.name ?? '', path });
    } else if (tags.highway) {
      const ref = tags.ref?.split(';')[0].trim();
      roads.push(ref ? { id, kind: tags.highway, ref, path } : { id, kind: tags.highway, path });
    } else if (tags.railway) {
      rails.push({ id, path });
    }
  }
  // Sorted, so the output does not depend on Overpass's element order.
  rivers.sort((a, b) => a.id.localeCompare(b.id));
  roads.sort((a, b) => a.id.localeCompare(b.id));
  rails.sort((a, b) => a.id.localeCompare(b.id));

  const towns: ValleyFeatures['towns'] = [];
  if (existsSync(GEONAMES)) {
    for (const line of readFileSync(GEONAMES, 'utf8').split('\n')) {
      const f = line.split('\t');
      if (f.length < 15 || f[8] !== 'TH') continue;
      const at = projectToLocalMetres([Number(f[4]), Number(f[5])], origin);
      if (!inside(at)) continue;
      towns.push({
        name: f[1],
        population: Number(f[14]),
        at: [Math.round(at[0]), Math.round(at[1])],
      });
    }
  } else {
    console.log(`  warning  ${GEONAMES.replace(REPO + '/', '')} missing — no towns written`);
  }
  // Biggest first, so a renderer that can only fit a few labels drops the right ones.
  towns.sort((a, b) => b.population - a.population || a.name.localeCompare(b.name));

  const out: ValleyFeatures = {
    _comment:
      'Rivers, main roads, railway and towns for the VALLEY view. Rivers, roads and rail ' +
      'from OpenStreetMap under ODbL; towns from GeoNames under CC BY 4.0. Both credited ' +
      'in the viewer footer. Generated by scripts/fetch-valley.ts — do not hand-edit.',
    halfKm: HALF_KM,
    rivers,
    roads,
    rails,
    towns,
  };

  const path = join(SCENES, 'wat-ket.valley.features.json');
  const text = JSON.stringify(out, null, 2) + '\n';
  const unchanged = existsSync(path) && readFileSync(path, 'utf8') === text;
  writeFileSync(path, text);

  const points = rivers.reduce((n, r) => n + r.path.length, 0);
  console.log(`  rivers   ${rivers.length} (${points} points after simplification)`);
  console.log(`  roads    ${roads.length} (${roads.reduce((n, r) => n + r.path.length, 0)} points)`);
  console.log(`  rails    ${rails.length} (${rails.reduce((n, r) => n + r.path.length, 0)} points)`);
  for (const t of towns) {
    console.log(`  town     ${t.name.padEnd(16)} ${t.population.toLocaleString().padStart(9)}`);
  }
  console.log(
    `  wrote    src/scenes/wat-ket.valley.features.json (${(text.length / 1024).toFixed(0)} KB)` +
      (unchanged ? ' — byte-identical to the previous run' : ''),
  );
  return 0;
}

main().then((code) => process.exit(code));
