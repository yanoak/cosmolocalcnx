/**
 * The far city, as a pre-rendered raster — projection, tone table and sidecar shape.
 *
 * Shared deliberately between `scripts/render-backdrop.ts` and `BackdropPlane.tsx`.
 * The generator and the runtime have to agree about exactly two things — where a
 * world point lands on the image, and what a byte in the image means — and the
 * cheapest way to guarantee that is for there to be one copy of each. An earlier
 * draft of this put the generator in Python beside `build-region.py`; it was moved
 * here precisely so the partition in `lod.ts` and the ramp in `theme.ts` could be
 * called rather than mirrored.
 *
 * See `plans/2026-09-21_backdrop-lod.plan.md`. The property that makes any of this
 * legitimate is in `lod.ts`: the camera is orthographic and never rotates, so the
 * raster is the same picture the geometry would have drawn.
 */

import type { Point2 } from './extrude';
import type { BaselineBuilding } from './scene';
import type { Tone } from './shading';
import { GROUND, ROAD_TONES, SURFACE_ROLES, roleForKind } from './theme';

/**
 * World metres to screen metres, in the attitude `camera.ts` fixes.
 *
 * The camera sits at `target + (reach, reach, reach)` looking back at the target, so
 * the screen basis is the right vector (1, 0, -1)/sqrt(2) and the up vector
 * (-1, 2, -1)/sqrt(6) in three.js space. A scene point (x east, y north, h up) is
 * three.js (x, h, -y), and the two dot products collapse to this.
 *
 * `sy` is POSITIVE UP, like a plan drawing. The rasteriser flips it once, at the
 * point where it turns metres into image rows.
 *
 * Cross-check, and the reason this is safe to trust: for h = 0 the horizontal span is
 * (spanX + spanZ)/sqrt(2) and the vertical span is the same over sqrt(3), which is
 * exactly `isometricFit`'s `screenWidth` and `screenWidth * sin(ISO_PITCH)`.
 */
const SQRT6 = Math.sqrt(6);

export function projectIso(x: number, y: number, h = 0): Point2 {
  return [(x + y) * Math.SQRT1_2, (y - x + 2 * h) / SQRT6];
}

/**
 * What one byte of the backdrop means.
 *
 * Indices, not colours. `wat-ket.relief.png` stores metres and lets `theme.ts` own the
 * hypsometric ramp; this stores a token and lets `theme.ts` own the palette, for the
 * same reason and with a specific precedent — the brand changed on 16 Sep 2026, and a
 * backdrop with colours baked in would have quietly kept the 1967 PROGRESS palette
 * while every other surface moved. It also compresses far better: eighteen distinct
 * values against a full-colour render.
 *
 * Index 0 is "nothing here" and must stay index 0 — it is the cleared value of the
 * buffer and the transparent entry of the palette.
 *
 * ORDER IS PART OF THE FORMAT. Append only; never reorder, or every committed raster
 * silently repaints itself.
 */
export const BACKDROP_TOKENS = [
  'empty',
  'ground.base',
  'ground.green',
  'water',
  'road.major',
  'road.secondary',
  'road.street',
  'road.service',
  'road.path',
  'building.stock:top',
  'building.stock:side',
  'building.stock:shade',
  'building.intervention:top',
  'building.intervention:side',
  'building.intervention:shade',
  'building.civic:top',
  'building.civic:side',
  'building.civic:shade',
] as const;

export type BackdropToken = (typeof BACKDROP_TOKENS)[number];

const INDEX_OF = new Map<string, number>(BACKDROP_TOKENS.map((t, i) => [t, i]));

export function indexOfToken(token: string): number {
  const i = INDEX_OF.get(token);
  if (i === undefined) throw new Error(`backdrop: unknown tone token "${token}"`);
  return i;
}

/** The ramp roles a building can take. Mirrors `theme.ts`'s building roles. */
export type BuildingRole = 'building.stock' | 'building.intervention' | 'building.civic';

/**
 * Kind to role, resolved through `theme.ts` rather than restated.
 *
 * `roleForKind` returns a Ramp, not a role name, so this compares the ramp it gets
 * back against the three building ramps by identity. That is deliberately indirect:
 * it means adding a kind to `KIND_TO_ROLE` needs no change here, and adding a ROLE
 * fails a test rather than silently painting the new role as stock.
 */
export function roleForBuildingKind(kind: string): BuildingRole {
  const ramp = roleForKind(kind);
  if (ramp === SURFACE_ROLES['building.civic']) return 'building.civic';
  if (ramp === SURFACE_ROLES['building.intervention']) return 'building.intervention';
  return 'building.stock';
}

export function buildingToneIndex(kind: string, tone: Tone): number {
  return indexOfToken(`${roleForBuildingKind(kind)}:${tone}`);
}

/**
 * Mirrors `roadTone`'s own lookup-then-fall-back-to-street, on the key rather than on
 * the resolved hex — two tones that happen to share a colour must still be two tokens.
 */
export function roadToneIndex(kind: string): number {
  const key = kind in ROAD_TONES ? kind : 'street';
  return indexOfToken(`road.${key}`);
}

/**
 * Index to hex, built from `theme.ts` at load.
 *
 * Empty is the one entry with no colour — the caller writes alpha 0 there. Everything
 * else must resolve, and `backdrop.test.ts` asserts that for every token, which is the
 * test that fires if a role is added to `SURFACE_ROLES` without a token here.
 */
export function backdropPalette(): (string | null)[] {
  return BACKDROP_TOKENS.map((token) => {
    if (token === 'empty') return null;
    if (token === 'ground.base') return GROUND.ground;
    if (token === 'ground.green') return GROUND.green;
    if (token === 'water') return SURFACE_ROLES.water.side;

    if (token.startsWith('road.')) {
      const key = token.slice('road.'.length) as keyof typeof ROAD_TONES;
      return ROAD_TONES[key];
    }

    const [role, tone] = token.split(':') as [BuildingRole, Tone];
    return SURFACE_ROLES[role][tone];
  });
}

/**
 * One rendered slice, and where on the stage it belongs.
 *
 * `rectM` is the screen-metre rectangle the image covers, in the same frame
 * `projectIso` emits — so placing the plane is a scale and a translate, with no
 * knowledge of how the image was made.
 */
export interface BackdropSliceMeta {
  /** `behind` draws further from the camera than the near set, `front` nearer. */
  slice: 'behind' | 'front';
  /** Committed PNG, relative to `src/scenes/`. */
  field: string;
  /** [minX, minY, maxX, maxY] in screen metres, y positive up. */
  rectM: [number, number, number, number];
  /** Metres along the camera's ground track at which to hang the plane. */
  depthM: number;
  buildings: number;
}

export interface BackdropMeta {
  /** Index to token. Written out so a reader needs no build of this module. */
  palette: readonly string[];
  /**
   * What this raster was rendered FROM.
   *
   * The whole argument for a pre-rendered backdrop is that it is derived rather than
   * authored, and `docs/roadmap.md` rejected pre-rendered raster precisely because a
   * hand-maintained image drifts from the document. Derived only stays true if
   * something re-derives it — and a committed artefact can go stale the moment
   * `npm run fetch:osm` rewrites the scene document.
   *
   * So the generator records a fingerprint of its inputs and `backdrop.test.ts`
   * recomputes it from the committed document. A stale backdrop fails `npm test`,
   * which is the same guarantee rendering at build time would give, at the cost of a
   * few milliseconds instead of six seconds on the deploy path — and it fails where
   * someone can fix it rather than in front of a deploy.
   */
  source: { fingerprint: string; buildings: number };
  /** Pixels per screen metre. The same for every slice. */
  scalePx: number;
  size: { width: number; height: number };
  /** Where the geometry/raster boundary sits, for the record. */
  near: { centreM: Point2; radiusM: number; buildings: number };
  slices: BackdropSliceMeta[];
}

/**
 * Where a slice's quad sits, in screen metres.
 *
 * Returned rather than applied so it can be tested without a canvas — the round-trip
 * test that a world point lands on the same screen point through the geometry and
 * through the plane is the one that catches an off-by-half-a-pixel.
 */
export function planeRect(slice: BackdropSliceMeta): {
  centre: Point2;
  width: number;
  height: number;
} {
  const [minX, minY, maxX, maxY] = slice.rectM;
  return {
    centre: [(minX + maxX) / 2, (minY + maxY) / 2],
    width: maxX - minX,
    height: maxY - minY,
  };
}


// ---------------------------------------------------------------------------
// Freshness.

/**
 * Everything that changes what the generator draws.
 *
 * Not the generator's own logic, which no hash of its inputs can cover — this catches
 * a scene document that moved on without the raster, which is the failure that
 * actually happens. Re-running the generator is the fix, and it says so in the
 * assertion message.
 */
export interface FingerprintInput {
  buildings: readonly BaselineBuilding[];
  heroIds: ReadonlySet<string>;
  centre: Point2;
  radiusM: number;
  widthPx: number;
}

/**
 * FNV-1a, two lanes, over a canonical stream of the inputs.
 *
 * A checksum, not a cryptographic hash: it exists to notice that 68,704 buildings
 * changed, not to resist anyone. Two 32-bit lanes rather than one because a single
 * lane over twelve megabytes is a coin-flip more collision-prone than is comfortable
 * for something that gates a release.
 *
 * Numbers are hashed by their IEEE bytes rather than their decimal text — exact, and
 * it keeps 400,000 `toString` calls out of the test suite.
 */
export function backdropFingerprint(input: FingerprintInput): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  const scratch = new DataView(new ArrayBuffer(8));

  const byte = (v: number) => {
    a = Math.imul(a ^ v, 0x01000193);
    b = Math.imul(b ^ v, 0x01000105);
  };
  const num = (v: number) => {
    scratch.setFloat64(0, v);
    for (let i = 0; i < 8; i++) byte(scratch.getUint8(i));
  };
  const str = (v: string) => {
    for (let i = 0; i < v.length; i++) {
      byte(v.charCodeAt(i) & 0xff);
      byte(v.charCodeAt(i) >>> 8);
    }
    byte(0);
  };

  // The tone table is part of the format: reordering it repaints every raster.
  for (const token of BACKDROP_TOKENS) str(token);
  num(input.centre[0]);
  num(input.centre[1]);
  num(input.radiusM);
  num(input.widthPx);

  // Sorted, because a Set's iteration order is insertion order and the hero set is
  // built by flattening scenarios — reordering a scenario must not look like a change.
  for (const id of [...input.heroIds].sort()) str(id);

  for (const building of input.buildings) {
    str(building.id);
    str(building.kind);
    num(building.height);
    for (const [x, y] of building.footprint) {
      num(x);
      num(y);
    }
  }

  const hex = (v: number) => (v >>> 0).toString(16).padStart(8, '0');
  return hex(a) + hex(b);
}
