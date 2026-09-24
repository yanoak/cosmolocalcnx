#!/usr/bin/env tsx
/**
 * The Faiways map's vector half, without a browser.
 *
 *     npx tsx scripts/export-map.ts [--out data/export] [--dpi 300] [--icon-mm 14] [--label-pt 8] [--no-transport] [--embed-icons]
 *
 * The icons each map uses are COPIED into `<out>/icons/<id>.png` and referenced by that
 * relative path, so the folder is the deliverable: SVGs, basemaps and icons side by side,
 * every link resolving wherever the folder goes. PNG rather than the site's WebP, which
 * older layout programs cannot place. `--embed-icons` inlines them as data URIs instead,
 * for a single self-contained file at the cost of size. Yan, 24 Sep 2026: linked.
 *
 * Writes valley-overlay.svg and city-overlay.svg: the same SVG `/export` builds in the
 * page — the same fit, projection, hotspots, copy and sprites — so the two routes cannot
 * disagree. Only the raster basemaps need the GPU; those come from `/export`.
 * Terrain heights for the valley come from the committed field PNG, decoded with sharp.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { isometricFit } from '../src/engine/camera';
import { iconFor } from '../src/engine/icons';
import { overlaySvg, pageProjection, type ExportPathGroup, type ExportPin } from '../src/engine/mapexport';
import { placeInFrame } from '../src/engine/pins';
import { decodeRelief, type ReliefMeta } from '../src/engine/relief';
import { sceneBoundsMetres, type SceneDocument } from '../src/engine/scene';
import { PALETTE, PALETTE_EXTENDED, REGISTERS } from '../src/engine/theme';
import { sampleHeight, smoothField, valleyHeights, waterwayWeight, STROKE_PX, VALLEY_EXAGGERATION } from '../src/engine/valley';

const REPO = join(import.meta.dirname, '..');
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = join(REPO, arg('--out', 'data/export'));
const DPI = Number(arg('--dpi', '300'));
const ICON_MM = Number(arg('--icon-mm', '14'));
const LABEL_PT = Number(arg('--label-pt', '8'));
const TRANSPORT = !process.argv.includes('--no-transport');
const EMBED_ICONS = process.argv.includes('--embed-icons');

/** Per sprite id: the href the SVG writes — `icons/<id>.png` beside it, or a data URI. */
const iconHrefs = new Map<string, string>();
async function prepareIcons(ids: Iterable<string | undefined>) {
  if (!EMBED_ICONS) mkdirSync(join(OUT, 'icons'), { recursive: true });
  for (const id of ids) {
    if (!id || iconHrefs.has(id)) continue;
    const sprite = iconFor(id);
    if (!sprite) continue;
    const png = await sharp(join(REPO, 'public', sprite.file)).png().toBuffer();
    if (EMBED_ICONS) {
      iconHrefs.set(id, `data:image/png;base64,${png.toString('base64')}`);
    } else {
      writeFileSync(join(OUT, 'icons', `${id}.png`), png);
      iconHrefs.set(id, `icons/${id}.png`);
    }
  }
}

const page = { widthPx: Math.round((297 / 25.4) * DPI), heightPx: Math.round((210 / 25.4) * DPI), dpi: DPI };

const doc = JSON.parse(readFileSync(join(REPO, 'src/scenes/wat-ket.json'), 'utf8')) as SceneDocument;
const copy = JSON.parse(readFileSync(join(REPO, 'src/content/copy.json'), 'utf8')) as {
  en: { futures: { hotspots: Array<{ id: string; label?: string }> } };
};
const labels = new Map(copy.en.futures.hotspots.map((c) => [c.id, c.label ?? c.id]));
const futures = [...doc.hotspots, ...doc.scenarios.flatMap((s) => s.hotspots)].filter((h) => h.chapter === 'futures');

const valleyMeta = JSON.parse(readFileSync(join(REPO, 'src/scenes/wat-ket.valley.json'), 'utf8')) as ReliefMeta;
const features = JSON.parse(readFileSync(join(REPO, 'src/scenes/wat-ket.valley.features.json'), 'utf8')) as {
  rivers: { name: string; path: [number, number][] }[];
  roads?: { kind: string; path: [number, number][] }[];
  rails?: { path: [number, number][] }[];
};
const half = Math.abs(valleyMeta.grid.bboxM[2]);

async function valleySurface(): Promise<Float32Array> {
  const { data, info } = await sharp(join(REPO, 'src/scenes/wat-ket.valley.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== valleyMeta.grid.size) throw new Error(`field is ${info.width}px, meta says ${valleyMeta.grid.size}`);
  const field = decodeRelief(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, valleyMeta.encoding.min, valleyMeta.encoding.max);
  return valleyHeights(smoothField(field, valleyMeta.grid.size), valleyMeta, VALLEY_EXAGGERATION, 0);
}

function build(map: 'valley' | 'city', heights: Float32Array | null): string {
  const bounds = map === 'valley' ? ([-half, -half, half, half] as [number, number, number, number]) : sceneBoundsMetres(doc);
  const projection = pageProjection(isometricFit(bounds, { width: page.widthPx, height: page.heightPx }), page);
  const hAt = (x: number, y: number) => (map === 'valley' && heights ? sampleHeight(heights, valleyMeta, [x, y]) : 0);

  const pins: ExportPin[] = futures
    .filter((h) => h.view === map && h.at)
    .map((h) => {
      const placed = map === 'valley' ? placeInFrame(h.at!, half) : { at: h.at!, clamped: false, distanceKm: 0, compass: '' };
      const name = labels.get(h.id) ?? h.id;
      return {
        id: h.id,
        label: placed.clamped ? `${name} · ${placed.distanceKm} km ${placed.compass}` : name,
        at: placed.at,
        h: hAt(placed.at[0], placed.at[1]),
        sprite: iconFor(h.icon),
        labelSide: h.labelSide,
      };
    });

  const groups: ExportPathGroup[] = [];
  if (map === 'valley') {
    const lift = (path: [number, number][]) => path.map(([x, y]) => [x, y, hAt(x, y)] as [number, number, number]);
    const k = DPI / 96;
    groups.push(
      { id: 'water-ping', colour: PALETTE_EXTENDED['cosmo.skyBlue'], widthPx: STROKE_PX.main * k, paths: features.rivers.filter((r) => waterwayWeight(r.name) === 'main').map((r) => lift(r.path)) },
      { id: 'water-rivers', colour: PALETTE_EXTENDED['cosmo.skyBlue'], widthPx: STROKE_PX.named * k, paths: features.rivers.filter((r) => waterwayWeight(r.name) === 'named').map((r) => lift(r.path)) },
    );
    if (TRANSPORT) {
      groups.push(
        { id: 'roads-primary', colour: PALETTE['cosmo.violet'], widthPx: STROKE_PX.primary * k, opacity: 0.32, paths: (features.roads ?? []).filter((r) => r.kind === 'primary').map((r) => lift(r.path)) },
        { id: 'roads-trunk', colour: PALETTE['cosmo.violet'], widthPx: STROKE_PX.motorway * k, opacity: 0.45, paths: (features.roads ?? []).filter((r) => r.kind !== 'primary').map((r) => lift(r.path)) },
        { id: 'rail', colour: PALETTE_EXTENDED['cosmo.deepViolet'], widthPx: STROKE_PX.rail * k, opacity: 0.6, dashed: true, paths: (features.rails ?? []).map((r) => lift(r.path)) },
      );
    }
  }

  return overlaySvg({
    projection,
    groups,
    pins,
    iconMm: ICON_MM,
    labelPt: LABEL_PT,
    labelColour: REGISTERS.page.ink,
    labelFont: 'IBM Plex Sans Thai, IBM Plex Sans, sans-serif',
    basemapHref: `${map}-basemap.png`,
    title: `Faiways — ${map === 'valley' ? 'Ping Valley' : 'Wat Ket'}, 2045`,
    iconHref: (sprite) => iconHrefs.get(sprite.id) ?? sprite.file,
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const heights = await valleySurface();
  await prepareIcons(futures.map((h) => h.icon));
  for (const map of ['valley', 'city'] as const) {
    const svg = build(map, heights);
    const path = join(OUT, `${map}-overlay.svg`);
    writeFileSync(path, svg);
    console.log(`  wrote ${path.replace(REPO + '/', '')} (${(svg.length / 1024).toFixed(0)} KB, ${page.widthPx}×${page.heightPx} @ ${DPI} dpi)`);
  }
  if (!EMBED_ICONS) console.log(`  icons: ${iconHrefs.size} copied to ${join(OUT, 'icons').replace(REPO + '/', '')}/ as PNG`);
  console.log(`  the basemaps — valley-basemap.png and city-basemap.png — come from /export in a browser.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
