/**
 * The REGION register: half of humanity, as a flat plane.
 *
 * The committed artefact is a PNG of population counts in an azimuthal equidistant
 * frame — see `scripts/build-region.py`. This module turns it into something the
 * renderer can put on screen, and everything here is pure so it can be tested in
 * node, exactly like `roads.ts`.
 *
 * THIS IS NOT TERRAIN. `terrain` stays null in the scene document, permanently, and
 * `validateScene` keeps asserting it. What the field holds is people per cell, in a
 * different coordinate frame, and September renders it FLAT — the extruded
 * population columns are a December feature. The resemblance to a heightmap is
 * precisely how elevation would creep back in, so it is spelled out here, in the
 * script, and in the sidecar.
 */

import { POPULATION_RAMP, sampleRamp } from './theme';

/** What `scripts/build-region.py` writes beside the PNG. */
export interface RegionMeta {
  projection: { kind: 'aeqd'; centre: [number, number]; radiusKm: number };
  grid: { size: number; cellKm: number };
  encoding: { gamma: number; max: number };
}

/** Kilometres east and north of the circle's centre. */
export type RegionKm = [number, number];

/**
 * Decode the two-channel PNG back to people per cell.
 *
 * The high byte is red and the low byte is green, because a 16-bit PNG does not
 * survive a browser: `createImageBitmap` and `getImageData` both hand back 8-bit
 * clamped RGBA, so the low byte would be silently unrecoverable. Blue is reserved
 * for a land mask and is ignored here.
 *
 * `bytes` is RGBA as a canvas hands it over — four bytes per pixel.
 */
export function decodeField(
  bytes: Uint8ClampedArray | Uint8Array,
  size: number,
  max: number,
  gamma: number,
): Float32Array {
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) {
    const v = (bytes[i * 4] << 8) | bytes[i * 4 + 1];
    // Exactly zero stays exactly zero: an empty cell must not decode to a
    // fraction of a person and light up as inhabited.
    out[i] = v === 0 ? 0 : max * (v / 65535) ** gamma;
  }
  return out;
}

/**
 * Coarsen by an integer factor, conserving total population exactly.
 *
 * Population is additive, so block-summing is lossless — which is the whole reason
 * the committed grid is finer than anything drawn. Cell size stays a runtime
 * decision and December's columns never need the source tiles again.
 */
export function aggregate(
  field: Float32Array,
  size: number,
  factor: number,
): { field: Float32Array; size: number } {
  if (!Number.isInteger(factor) || factor < 1) {
    throw new Error(`aggregate: factor must be a positive integer, got ${factor}`);
  }
  if (factor === 1) return { field, size };
  if (size % factor !== 0) {
    throw new Error(`aggregate: factor ${factor} does not divide grid size ${size}`);
  }

  const next = size / factor;
  const out = new Float32Array(next * next);
  for (let row = 0; row < size; row++) {
    const outRow = (row / factor) | 0;
    for (let col = 0; col < size; col++) {
      out[outRow * next + ((col / factor) | 0)] += field[row * size + col];
    }
  }
  return { field: out, size: next };
}

/**
 * Longest edge of the generated texture, in pixels.
 *
 * Matches `ROAD_TEXTURE_MAX_PX` deliberately: it is the same budget argument, and a
 * phone holding two 2048 textures is the realistic ceiling. At 2048 over a 6,874 km
 * circle one pixel is 3.4 km, so the committed 512-cell field is upscaled about 4x
 * — which is why the composite draws it smoothed rather than as hard cells. Blocky
 * 13 km squares would be an honest picture of the data and a worse picture of Asia.
 */
export const REGION_TEXTURE_MAX_PX = 2048;

export interface RegionLayout {
  /** Texture edge in pixels. Square, because the circle is. */
  size: number;
  /** Pixels per kilometre. */
  scale: number;
  radiusKm: number;
}

export function regionTextureLayout(
  radiusKm: number,
  maxPx: number = REGION_TEXTURE_MAX_PX,
): RegionLayout {
  const size = Math.max(1, Math.floor(maxPx));
  return { size, scale: radiusKm > 0 ? size / (2 * radiusKm) : 1, radiusKm };
}

/**
 * Kilometres east/north to texture pixels.
 *
 * The north flip is the reason this is a named function rather than two lines
 * inline — the same reason `metresToPixels` in roads.ts is. North runs positive and
 * canvas pixels run down, and getting it wrong mirrors Asia, which is the kind of
 * wrong that an audience spots instantly and a developer never does.
 */
export function kmToPixels([east, north]: RegionKm, layout: RegionLayout): [number, number] {
  return [
    (east + layout.radiusKm) * layout.scale,
    (layout.radiusKm - north) * layout.scale,
  ];
}

/**
 * Colour the field into RGBA bytes.
 *
 * Log-scaled, because population per cell spans six orders of magnitude and a
 * linear ramp renders everything except the Ganges plain and the Pearl River delta
 * as empty. Empty cells take the first stop, which is the district's own ground
 * tone — so ocean, empty steppe and the ground under Wat Ket are all the same
 * colour, and the two registers read as one piece.
 */
export function fieldToRgba(
  field: Float32Array,
  size: number,
  max: number,
  stops: readonly string[] = POPULATION_RAMP,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const denominator = Math.log10(max + 1);

  for (let i = 0; i < field.length; i++) {
    const people = field[i];
    const t = people > 0 && denominator > 0 ? Math.log10(people + 1) / denominator : 0;
    const [r, g, b] = sampleRamp(stops, t);
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Just enough of a 2D context to draw the circle furniture with — and to fake in a test. */
export interface RegionContext {
  beginPath(): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  globalAlpha: number;
}

/** Distance rings, in kilometres. Chosen to be read, not to be counted. */
export const DISTANCE_RINGS_KM = [1000, 2000, 3000] as const;

/**
 * The circle itself, its distance rings, and the crosshair at its centre.
 *
 * The rim is the claim — everything inside it is half of everyone alive — so it is
 * drawn at full strength and the rings are drawn faintly under it. They exist to
 * make the projection's one property visible: every ring is truly concentric and
 * truly to scale, which is the reason for choosing azimuthal equidistant at all.
 */
export function drawCircle(
  ctx: RegionContext,
  layout: RegionLayout,
  tone: string,
  rings: readonly number[] = DISTANCE_RINGS_KM,
): void {
  const [cx, cy] = kmToPixels([0, 0], layout);

  ctx.strokeStyle = tone;

  for (const km of rings) {
    if (km <= 0 || km >= layout.radiusKm) continue;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = Math.max(1, layout.size / 1024);
    ctx.beginPath();
    ctx.arc(cx, cy, km * layout.scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The centre crosshair, small enough not to compete with the anchor.
  const tick = layout.size / 96;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - tick, cy);
  ctx.lineTo(cx + tick, cy);
  ctx.moveTo(cx, cy - tick);
  ctx.lineTo(cx, cy + tick);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(2, layout.size / 512);
  ctx.beginPath();
  ctx.arc(cx, cy, layout.radiusKm * layout.scale, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * The "you are here" marker, at the scene origin's true position on the circle.
 *
 * A ring rather than a dot, because a filled dot at this scale is indistinguishable
 * from a dense city and the one thing this marker must not be is data.
 */
export function drawAnchor(
  ctx: RegionContext,
  layout: RegionLayout,
  at: RegionKm,
  tone: string,
): void {
  const [x, y] = kmToPixels(at, layout);
  const radius = Math.max(4, layout.size / 128);

  ctx.globalAlpha = 1;
  ctx.strokeStyle = tone;
  ctx.lineWidth = Math.max(2, layout.size / 640);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = tone;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1, radius / 4), 0, Math.PI * 2);
  ctx.fill();
}
