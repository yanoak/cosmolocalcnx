#!/usr/bin/env tsx
/**
 * Render the far city to a committed raster, so the phone stops paying for it.
 *
 *     npm run render:backdrop
 *     npm run render:backdrop -- --radius 1500 --width 6144
 *
 * The scene took in the whole old city on 19 Sep 2026 and has been ten times over the
 * phone budget ever since — 68,704 buildings and ~997k triangles against a ceiling of
 * 100–150k. This draws everything outside the near radius once, offline, into two
 * 8-bit rasters that the viewer hangs on planes normal to the view direction. See
 * `plans/2026-09-21_backdrop-lod.plan.md`.
 *
 * WHY THIS IS EXACT AND NOT AN APPROXIMATION: `Diorama.tsx` sets `enableRotate={false}`
 * on an orthographic camera at a fixed isometric attitude, so zooming is a 2D scale of
 * the projected image and panning is a 2D translation. The raster is the same picture
 * the geometry would have drawn. Enable orbit and this whole file becomes a lie.
 *
 * TypeScript rather than Python, unlike every other raster generator here. Those read
 * GeoTIFFs and want numpy; this one needs the partition in `lod.ts`, the tone rule in
 * `shading.ts` and the palette in `theme.ts`, and mirroring three engine modules in
 * another language is exactly the drift this project keeps designing against.
 *
 * A re-run against the same document must produce BYTE-IDENTICAL output — the same
 * invariant `fetch:osm` and `build:region` carry. Hence the hand-written PNG: an image
 * library's output varies by version, which would quietly destroy that. Same reasoning
 * as the note at the top of `build-region.py`.
 *
 * Only BUILDINGS go in the backdrop. Roads are already a canvas texture and cost no
 * triangles; water and green are a few hundred flat polygons. The million triangles
 * are all buildings, so they are all this needs to take.
 */

import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BACKDROP_TOKENS,
  backdropFingerprint,
  buildingToneIndex,
  projectIso,
  type BackdropMeta,
  type BackdropSliceMeta,
} from '../src/engine/backdrop';
import {
  nearDepthRange,
  partitionBuildings,
  sliceFor,
  viewDepth,
  type BackdropSlice,
} from '../src/engine/lod';
import { centroid } from '../src/engine/ordering';
import { toneForNormal } from '../src/engine/shading';
import type { BaselineBuilding, SceneDocument } from '../src/engine/scene';
import type { Point2 } from '../src/engine/extrude';

const REPO = join(import.meta.dirname, '..');
const SCENES = join(REPO, 'src', 'scenes');

/** Defaults chosen in the plan: 1,250 m lands the near set at 112k triangles. */
const DEFAULT_RADIUS_M = 1250;
/**
 * Chosen by GPU memory, not by disk.
 *
 * The committed PNG is tiny either way — 126 KB at this width, 386 KB at 4096 — but the
 * browser expands an 8-bit greyscale texture to RGBA on upload, so the cost that counts
 * is 4 bytes per pixel of VRAM: 19 MB for both slices here against 77 MB at 4096. The
 * phone is the binding surface and 77 MB is not a thing to hand a cheap Android.
 *
 * Crispness this buys: the whole extent is 1,076 px wide at district fit on a phone and
 * 2,650 px on the laptop, so this is comfortable at district fit and softens as the
 * visitor zooms in — which is what the pan clamp is for. A projector build can raise it
 * with `--width` whenever the projector is in the room to judge it on.
 */
const DEFAULT_WIDTH_PX = 2048;

interface Args {
  scene: string;
  radiusM: number;
  centre: Point2;
  widthPx: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    scene: 'wat-ket',
    radiusM: DEFAULT_RADIUS_M,
    centre: [0, 0],
    widthPx: DEFAULT_WIDTH_PX,
  };
  for (let i = 0; i < argv.length; i++) {
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`${argv[i]} needs a value`);
      i++;
      return v;
    };
    switch (argv[i]) {
      case '--scene': args.scene = next(); break;
      case '--radius': args.radiusM = Number(next()); break;
      case '--width': args.widthPx = Number(next()); break;
      case '--centre': {
        const [x, y] = next().split(',').map(Number);
        args.centre = [x, y];
        break;
      }
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  if (!Number.isFinite(args.radiusM) || args.radiusM < 0) throw new Error('--radius must be >= 0');
  if (!Number.isInteger(args.widthPx) || args.widthPx < 16) throw new Error('--width must be >= 16');
  return args;
}

// ---------------------------------------------------------------------------
// Rasterising.

/**
 * Even-odd scanline fill, sampling at pixel centres. Returns false if the polygon
 * covered no pixel centre at all, which at 0.4 px/m is common and is handled by the
 * caller rather than ignored — 61,116 buildings quietly thinning out would read as
 * the far city being emptier than it is.
 */
function fillPolygon(
  buf: Uint8Array,
  width: number,
  height: number,
  pts: Point2[],
  value: number,
): boolean {
  const n = pts.length;
  if (n < 3) return false;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const y0 = Math.max(0, Math.ceil(minY - 0.5));
  const y1 = Math.min(height - 1, Math.floor(maxY - 0.5));
  let painted = false;
  const crossings: number[] = [];

  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    crossings.length = 0;

    for (let i = 0; i < n; i++) {
      const [x1, ya] = pts[i];
      const [x2, yb] = pts[(i + 1) % n];
      // Half-open in y, so a vertex shared by two edges is counted once and the fill
      // does not develop pinholes along horizontal seams.
      if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) {
        crossings.push(x1 + ((yc - ya) / (yb - ya)) * (x2 - x1));
      }
    }
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);

    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const xs = Math.max(0, Math.ceil(crossings[k] - 0.5));
      const xe = Math.min(width - 1, Math.floor(crossings[k + 1] - 0.5));
      for (let x = xs; x <= xe; x++) {
        buf[y * width + x] = value;
        painted = true;
      }
    }
  }

  return painted;
}

/** Ring orientation, so wall normals point out of the building and not into it. */
function isCounterClockwise(ring: Point2[]): boolean {
  let twice = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    twice += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return twice < 0;
}

interface Raster {
  buf: Uint8Array;
  width: number;
  height: number;
  /** Screen metres to pixels. */
  scalePx: number;
  /** Screen-metre origin of the image's top-left corner. */
  minX: number;
  maxY: number;
}

function toPixel(r: Raster, x: number, y: number, h: number): Point2 {
  const [sx, sy] = projectIso(x, y, h);
  // The one place screen-up becomes image-down.
  return [(sx - r.minX) * r.scalePx, (r.maxY - sy) * r.scalePx];
}

/**
 * One extruded building, painter's algorithm within itself: the walls a visitor can
 * see, then the roof over them.
 *
 * Holes are ignored. There are 39 of them in 68,704 buildings, all OSM multipolygon
 * courtyards, and every one is in the far set where it is at most a pixel.
 */
function drawBuilding(r: Raster, b: BaselineBuilding): void {
  const ring = isCounterClockwise(b.footprint) ? b.footprint : [...b.footprint].reverse();
  const n = ring.length;
  let painted = false;

  for (let i = 0; i < n; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % n];
    // Outward normal of a counter-clockwise edge.
    const nx = by - ay;
    const ny = -(bx - ax);

    // The camera looks down the (1, 1, 1) diagonal, so a wall faces it when the
    // three.js normal (nx, 0, -ny) has a positive component along it.
    if (nx - ny <= 0) continue;

    const tone = toneForNormal(nx, 0, -ny);
    const quad: Point2[] = [
      toPixel(r, ax, ay, 0),
      toPixel(r, bx, by, 0),
      toPixel(r, bx, by, b.height),
      toPixel(r, ax, ay, b.height),
    ];
    painted = fillPolygon(r.buf, r.width, r.height, quad, buildingToneIndex(b.kind, tone)) || painted;
  }

  const roof = ring.map(([x, y]) => toPixel(r, x, y, b.height));
  painted = fillPolygon(r.buf, r.width, r.height, roof, buildingToneIndex(b.kind, 'top')) || painted;

  if (painted) return;

  // Sub-pixel. Put one pixel down at the roof centroid rather than let the building
  // vanish: density is what the far city is for.
  const [cx, cy] = centroid(b.footprint);
  const [px, py] = toPixel(r, cx, cy, b.height);
  const ix = Math.round(px - 0.5);
  const iy = Math.round(py - 0.5);
  if (ix >= 0 && ix < r.width && iy >= 0 && iy < r.height) {
    r.buf[iy * r.width + ix] = buildingToneIndex(b.kind, 'top');
  }
}

// ---------------------------------------------------------------------------
// PNG, by hand.
//
// Greyscale 8-bit, so the byte a visitor's browser reads back out of `getImageData`
// IS the tone index — the same trick `wat-ket.relief.png` uses to keep the ramp in
// `theme.ts`. An indexed-colour PNG would bake the palette in, which is the one thing
// this format exists to avoid.

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function writePng(path: string, buf: Uint8Array, width: number, height: number): void {
  // Filter 1 (Sub) on every row. An isometric city is long horizontal runs of one
  // tone, which Sub turns into runs of zero — worth about 4x over no filtering, and
  // fixed per row so the output stays reproducible.
  const raw = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (width + 1);
    raw[row] = 1;
    const src = y * width;
    raw[row + 1] = buf[src];
    for (let x = 1; x < width; x++) raw[row + 1 + x] = (buf[src + x] - buf[src + x - 1]) & 0xff;
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: greyscale
  // 10..12: deflate, adaptive filtering, no interlace — all zero.

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { png.set(p, at); at += p.length; }
  writeFileSync(path, png);
}

// ---------------------------------------------------------------------------

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const docPath = join(SCENES, `${args.scene}.json`);
  const doc = JSON.parse(readFileSync(docPath, 'utf8')) as SceneDocument;

  // Derived exactly as `page.tsx` derives it, so the generator and the viewer cannot
  // disagree about which buildings carry content.
  const heroIds = new Set(
    [...doc.hotspots, ...doc.scenarios.flatMap((s) => s.hotspots)]
      .map((h) => h.target)
      .filter((t): t is string => typeof t === 'string' && t !== ''),
  );

  const opts = { centre: args.centre, radiusM: args.radiusM, heroIds };
  const { near, far } = partitionBuildings(doc.baseline.buildings, opts);
  const range = nearDepthRange(near);

  // One screen rectangle for both slices, over every building including roofs, so the
  // two rasters align pixel for pixel and the runtime needs one scale.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of doc.baseline.buildings) {
    for (const [x, y] of b.footprint) {
      for (const h of [0, b.height]) {
        const [sx, sy] = projectIso(x, y, h);
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      }
    }
  }

  const scalePx = args.widthPx / (maxX - minX);
  const heightPx = Math.ceil((maxY - minY) * scalePx);

  const groups: Record<BackdropSlice, BaselineBuilding[]> = { behind: [], front: [] };
  for (const b of far) groups[sliceFor(viewDepth(centroid(b.footprint)), range)].push(b);

  const slices: BackdropSliceMeta[] = [];

  for (const slice of ['behind', 'front'] as const) {
    const members = groups[slice];
    const raster: Raster = {
      buf: new Uint8Array(args.widthPx * heightPx),
      width: args.widthPx,
      height: heightPx,
      scalePx,
      minX,
      maxY,
    };

    // Painter's algorithm: furthest first, so nearer buildings overwrite.
    const ordered = [...members].sort(
      (a, b) => viewDepth(centroid(a.footprint)) - viewDepth(centroid(b.footprint)),
    );
    for (const b of ordered) drawBuilding(raster, b);

    const field = `${args.scene}.backdrop.${slice}.png`;
    const path = join(SCENES, field);
    const before = tryRead(path);
    writePng(path, raster.buf, raster.width, raster.height);
    const after = readFileSync(path);
    const identical = before !== null && before.equals(after);

    slices.push({
      slice,
      field,
      rectM: [minX, minY, maxX, maxY],
      // Hang each plane just clear of the near set, so neither ever intersects the
      // geometry it is standing in for.
      depthM: slice === 'behind' ? range.min - 1 : range.max + 1,
      buildings: members.length,
    });

    console.log(
      `${field.padEnd(34)} ${members.length.toLocaleString().padStart(7)} buildings  ` +
        `${(after.length / 1024).toFixed(0).padStart(5)} KB` +
        (before === null ? '' : identical ? '  (byte-identical)' : '  (CHANGED)'),
    );
  }

  const meta: BackdropMeta = {
    palette: [...BACKDROP_TOKENS],
    source: {
      fingerprint: backdropFingerprint({
        buildings: doc.baseline.buildings,
        heroIds,
        centre: args.centre,
        radiusM: args.radiusM,
        widthPx: args.widthPx,
      }),
      buildings: doc.baseline.buildings.length,
    },
    scalePx,
    size: { width: args.widthPx, height: heightPx },
    near: { centreM: args.centre, radiusM: args.radiusM, buildings: near.length },
    slices,
  };
  const metaPath = join(SCENES, `${args.scene}.backdrop.json`);
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');

  const triangles = (list: BaselineBuilding[]) =>
    list.reduce((n, b) => n + (b.footprint.length - 2) * 2 + b.footprint.length * 2, 0);

  console.log();
  console.log(`Near   ${near.length.toLocaleString().padStart(7)} buildings  ` +
    `${(triangles(near) / 1000).toFixed(0)}k triangles  (budget 100-150k)`);
  console.log(`Far    ${far.length.toLocaleString().padStart(7)} buildings  ` +
    `${(triangles(far) / 1000).toFixed(0)}k triangles  → raster`);
  console.log(`Image  ${args.widthPx} x ${heightPx} px at ${scalePx.toFixed(4)} px/m`);

  return 0;
}

function tryRead(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

process.exit(main());
