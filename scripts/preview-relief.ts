#!/usr/bin/env tsx
/**
 * Render the valley's relief styles to PNGs, offline.
 *
 *     npm run preview:relief
 *
 * Built 21 Sep 2026 because choosing a topography style needs to be done by looking, and
 * looking through the browser kept failing: the Chrome DevTools debugger that drives the
 * page makes a 130k-triangle rebuild take tens of seconds, and macOS screen capture needs
 * a permission this environment does not have.
 *
 * This reads the committed field, runs the SAME pure functions the viewer runs —
 * `smoothField`, `valleyHeights`, `terracedHeights`, `hillshade`, `projectView`,
 * `reliefColour` — and rasterises them with a z-buffer. So what it shows is what the
 * viewer draws, not an impression of it.
 *
 * Output goes to $SP (a scratch directory), never into the repo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { projectView } from '../src/engine/camera';
import { reliefColour, reliefShade, type ReliefMeta } from '../src/engine/relief';
import { hillshade, smoothField, terracedHeights, valleyHeights, valleyVertexAt, VALLEY_EXAGGERATION, type ValleyStyle } from '../src/engine/valley';
import { toneForNormal } from '../src/engine/shading';
import { GROUND, ramp } from '../src/engine/theme';

const DIR = '/Users/yan/Coding_work/cosmolocalcnx/src/scenes/';
const meta = JSON.parse(readFileSync(DIR + 'wat-ket.valley.json', 'utf8')) as ReliefMeta;

/** Full PNG reader: all five filter types, RGB or greyscale. */
function readPng(path: string) {
  const b = readFileSync(path);
  let at = 8, w = 0, h = 0, depth = 8, ctype = 0;
  const idat: Buffer[] = [];
  while (at < b.length) {
    const len = b.readUInt32BE(at);
    const type = b.toString('ascii', at + 4, at + 8);
    const data = b.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; }
    if (type === 'IDAT') idat.push(Buffer.from(data));
    at += 12 + len;
  }
  const bpp = (ctype === 2 ? 3 : ctype === 6 ? 4 : 1) * (depth / 8);
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const bb = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += bb; else if (f === 3) v += (a + bb) >> 1;
      else if (f === 4) { const p = a + bb - c, pa = Math.abs(p - a), pb = Math.abs(p - bb), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c); }
      out[y * stride + x] = v & 0xff;
    }
  }
  return { out, w, h, bpp };
}

const png = readPng(DIR + 'wat-ket.valley.png');
const size = meta.grid.size;
const field = new Float32Array(size * size);
for (let i = 0; i < size * size; i++) {
  const v = (png.out[i * png.bpp] << 8) | png.out[i * png.bpp + 1];
  field[i] = meta.encoding.min + (meta.encoding.max - meta.encoding.min) * (v / 65535);
}
let lo = Infinity, hi = -Infinity;
for (const v of field) { if (v < lo) lo = v; if (v > hi) hi = v; }
console.log('decoded', size, 'x', size, 'range', lo.toFixed(0), '-', hi.toFixed(0), 'm');

const smoothed = smoothField(field, size);
const W = 1400, H = 820;

function render(style: ValleyStyle, path: string) {
  const heights = style === 'terraced'
    ? terracedHeights(smoothed, meta, undefined, VALLEY_EXAGGERATION, 0)
    : valleyHeights(smoothed, meta, VALLEY_EXAGGERATION, 0);

  // Screen bounds over the whole field.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < size; i += 8) for (let j = 0; j < size; j += 8) {
    const [x, n] = valleyVertexAt(meta, i, j);
    const [sx, sy] = projectView(x, n, heights[i * size + j]);
    if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
  }
  const scale = Math.min(W / (maxX - minX), H / (maxY - minY)) * 0.96;
  const ox = (W - (maxX - minX) * scale) / 2, oy = (H - (maxY - minY) * scale) / 2;
  const px = (i: number, j: number): [number, number] => {
    const [x, n] = valleyVertexAt(meta, i, j);
    const [sx, sy] = projectView(x, n, heights[i * size + j]);
    return [(sx - minX) * scale + ox, (maxY - sy) * scale + oy];
  };

  const buf = new Uint8Array(W * H * 3).fill(252);
  const zbuf = new Float32Array(W * H).fill(-Infinity);

  const tri = (a: [number, number], b: [number, number], c: [number, number], rgb: number[], depth: number) => {
    const minx = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxx = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const miny = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxy = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-9) return;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const w0 = ((b[1] - c[1]) * (x + 0.5 - c[0]) + (c[0] - b[0]) * (y + 0.5 - c[1])) / d;
      const w1 = ((c[1] - a[1]) * (x + 0.5 - c[0]) + (a[0] - c[0]) * (y + 0.5 - c[1])) / d;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const k = y * W + x;
      if (depth <= zbuf[k]) continue;
      zbuf[k] = depth;
      buf[k * 3] = rgb[0]; buf[k * 3 + 1] = rgb[1]; buf[k * 3 + 2] = rgb[2];
    }
  };

  const hex = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const baseRgb = hex(GROUND.ground);
  const bands = new Map<number, Record<string, number[]>>();

  const step = 1;
  for (let i = 0; i < size - step; i += step) {
    for (let j = 0; j < size - step; j += step) {
      const corners: [number, number][] = [[i, j], [i + step, j], [i, j + step], [i + step, j + step]];
      const hs = corners.map(([a, b]) => heights[a * size + b]);
      const ps = corners.map(([a, b]) => px(a, b));
      // Normal from the quad's two spans, in three-space (x, height, -north).
      const [x0, n0] = valleyVertexAt(meta, i, j);
      const [x1, n1] = valleyVertexAt(meta, i + step, j + step);
      const dx = x1 - x0, dn = n1 - n0;
      const ux = [0, hs[1] - hs[0], -(dn)], vx = [dx, hs[2] - hs[0], 0];
      let nx = ux[1] * vx[2] - ux[2] * vx[1];
      let ny = ux[2] * vx[0] - ux[0] * vx[2];
      let nz = ux[0] * vx[1] - ux[1] * vx[0];
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }

      const trueH = (smoothed[i * size + j] - meta.base);
      let rgb: number[];
      if (style === 'hillshade') {
        const s = hillshade(nx, ny, nz);
        rgb = baseRgb.map((c) => Math.round(c * s));
      } else if (style === 'terraced') {
        const level = Math.round(Math.max(...hs) / VALLEY_EXAGGERATION);
        let cached = bands.get(level);
        if (!cached) {
          const [r, g, b] = reliefColour(level);
          const h2 = `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
          const t = ramp(h2);
          cached = { top: hex(t.top), side: hex(t.side), shade: hex(t.shade) };
          bands.set(level, cached);
        }
        rgb = cached[toneForNormal(nx, ny, nz)];
      } else {
        const [r, g, b] = reliefColour(trueH);
        const s = reliefShade(ny / (Math.hypot(nx, ny, nz) || 1));
        rgb = [r * s, g * s, b * s].map((v) => Math.round(v));
      }
      const depth = (x0 - n0);
      tri(ps[0], ps[1], ps[2], rgb, depth);
      tri(ps[1], ps[3], ps[2], rgb, depth);
    }
  }

  // RGB PNG, filter 0.
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
  const crc = (d: Buffer) => { let c = ~0; for (const byte of d) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(t, 4); d.copy(o, 8); o.writeUInt32BE(crc(o.subarray(4, 8 + d.length)), 8 + d.length); return o; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
  console.log('wrote', path);
}

for (const style of ['hillshade', 'terraced', 'gradient'] as ValleyStyle[]) {
  render(style, `${process.env.SP}/relief-${style}.png`);
}
