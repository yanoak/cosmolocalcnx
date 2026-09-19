/**
 * Building height: from tags where OSM has them, synthesised where it does not.
 *
 * Reconnaissance on 12 Sep 2026, over a 3.4 km2 box around the origin: 1,659
 * buildings, **one** carrying a `height` tag and 64 carrying `building:levels`.
 * So this is not a fallback. It is the primary source, and it authors almost the
 * entire skyline of Wat Ket.
 *
 * Two things follow, and they are the whole design of this module:
 *
 * 1. **It must be deterministic.** The same OSM id must yield the same height in
 *    November that it did in September, or a re-import silently reshuffles the
 *    skyline and every screenshot, every hotspot position and every placement
 *    judgement made before it stops matching. Variation therefore comes from a hash
 *    of the id, never from `Math.random()`.
 * 2. **It must not read as a spreadsheet.** A flat per-kind default across 1,600
 *    buildings produces a city of identical blocks, which is worse than wrong — it
 *    is obviously fake to an audience that knows these streets.
 */

import { ringArea } from './clip';
import type { Point2 } from './extrude';

/**
 * Storeys to metres. Chiang Mai shophouses run lower than the ~3.2 m that Western
 * OSM tooling assumes, but only one building in the area carries both `height` and
 * `building:levels`, so there is nothing local to calibrate against. Left at the
 * conventional value and flagged as an open question in the plan.
 */
export const LEVEL_HEIGHT_M = 3.2;

/** Clamped so a freak hash can never produce a tower or a pancake. */
export const MIN_HEIGHT_M = 2.5;

/**
 * The ceiling on a height this module INVENTED. A synthesised 30 m building in a
 * shophouse district would be a fabrication, so synthesis is not allowed to make one.
 */
export const MAX_HEIGHT_M = 30;

/**
 * The ceiling on a height OSM asserted. Much higher, because a tag is evidence and
 * synthesis is a guess: `Supalai Monte` on the east bank is genuinely tagged
 * `height=111`, and clamping a real 32-storey tower to 30 m would quietly delete the
 * tallest thing in the neighbourhood. Above this is a tagging error, not a building.
 */
export const MAX_TAGGED_HEIGHT_M = 150;

/**
 * The ceiling on a height OBSERVED from satellite imagery — the Open Buildings 2.5D
 * Temporal raster that `scripts/fetch-buildings.py` samples. Between the other two
 * on purpose: an observation is evidence, so it may exceed anything synthesis is
 * allowed to invent, but a 4 m-resolution model that measured Supalai Monte at 75 m
 * against its tagged 111 cannot vouch for a tower, so it sits below the tagged
 * ceiling and a tag always wins.
 */
export const MAX_OBSERVED_HEIGHT_M = 100;

/**
 * An observation is only trusted when enough of the footprint actually reads as
 * building. Below this, the polygon is a detector blob over a tree or a yard and
 * the "height" is the height of whatever pixels happened to clear the threshold.
 */
export const OBSERVED_MIN_PRESENCE = 0.3;
export const OBSERVED_MIN_PIXELS = 4;

/** What the raster said about one footprint. Sampled at 1 m; see fetch-buildings.py. */
export interface ObservedHeight {
  /** Mean height, metres, over pixels where building presence exceeded 0.5. */
  height: number;
  /** Fraction of the footprint's pixels that did. */
  presence: number;
  /** How many that was. */
  px: number;
}

export function acceptObservation(observed: ObservedHeight | null | undefined): observed is ObservedHeight {
  return (
    !!observed &&
    Number.isFinite(observed.height) &&
    observed.height > 0 &&
    observed.presence >= OBSERVED_MIN_PRESENCE &&
    observed.px >= OBSERVED_MIN_PIXELS
  );
}

interface StoreyProfile {
  /** Storeys for the smallest footprint of this kind. */
  base: number;
  /** Added across the footprint-area range. */
  spread: number;
  /** Storey bounds, before conversion to metres. */
  min: number;
  max: number;
}

/**
 * A riverside district of shophouses, wooden houses and a few civic buildings —
 * not a downtown. `temple` gets the widest range because Wat Ket's own viharn and
 * chedi are genuinely much taller than anything around them, and flattening that is
 * what would make the skyline read as generated.
 */
const PROFILES: Record<string, StoreyProfile> = {
  residential: { base: 1.5, spread: 1.1, min: 1, max: 4 },
  commercial: { base: 2.2, spread: 1.6, min: 1, max: 5 },
  retail: { base: 2.2, spread: 1.6, min: 1, max: 5 },
  industrial: { base: 1.2, spread: 0.8, min: 1, max: 3 },
  civic: { base: 2.0, spread: 2.0, min: 1, max: 6 },
  school: { base: 2.0, spread: 1.5, min: 1, max: 4 },
  temple: { base: 1.8, spread: 2.2, min: 1, max: 8 },
  default: { base: 1.5, spread: 1.0, min: 1, max: 4 },
};

/** Footprint areas over which `spread` is applied, in square metres. */
const SMALL_FOOTPRINT_M2 = 50;
const LARGE_FOOTPRINT_M2 = 600;

/** Storeys of jitter, total width. Enough to break up a terrace, not enough to look random. */
const JITTER_STOREYS = 1.2;

/**
 * FNV-1a, 32-bit. Chosen because it is ten lines, has no dependencies and — the
 * only property that actually matters — will compute the same number in any future
 * version of this project. A hash from a library is a hash that can change.
 */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A stable number in [0, 1) for an id. */
export function unitFromId(id: string): number {
  return hash32(id) / 0x100000000;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Heights go straight into a committed JSON document, so they are rounded here
 * rather than at the point of writing. `3 * 3.2` is 9.600000000000001 in binary
 * floating point, and a document full of those is both ugly in a diff and a
 * standing invitation for one rounding change to rewrite every line of the file.
 */
function tidy(metres: number): number {
  return Math.round(metres * 100) / 100;
}

/** Footprint area in square metres. Sign-free — winding is not this module's problem. */
export function footprintArea(footprint: Point2[]): number {
  return Math.abs(ringArea(footprint));
}

/**
 * Height for a building OSM tells us nothing about.
 *
 * Area enters logarithmically: the difference between a 40 m2 shack and a 120 m2
 * shophouse says far more about how tall it is than the difference between 600 m2
 * and 1,200 m2 does. Linear area would make a handful of large sheds the tallest
 * things in the neighbourhood.
 */
export function synthesiseHeight(id: string, areaM2: number, kind: string): number {
  const profile = PROFILES[kind] ?? PROFILES.default;

  const area = Number.isFinite(areaM2) && areaM2 > 0 ? areaM2 : SMALL_FOOTPRINT_M2;
  const areaFactor = clamp(
    (Math.log(area) - Math.log(SMALL_FOOTPRINT_M2)) /
      (Math.log(LARGE_FOOTPRINT_M2) - Math.log(SMALL_FOOTPRINT_M2)),
    0,
    1,
  );

  const jitter = (unitFromId(id) - 0.5) * JITTER_STOREYS;
  const storeys = clamp(
    profile.base + profile.spread * areaFactor + jitter,
    profile.min,
    profile.max,
  );

  // Quantised to half-storeys. Real buildings come in storeys, and a continuous
  // spread of heights reads as noise where a stepped one reads as architecture.
  const quantised = Math.round(storeys * 2) / 2;
  return tidy(clamp(quantised * LEVEL_HEIGHT_M, MIN_HEIGHT_M, MAX_HEIGHT_M));
}

export interface HeightSource {
  height: number;
  /** Which rung of the chain produced it — reported by the import so the ratio is visible. */
  from: 'height' | 'levels' | 'observed' | 'synth';
}

/**
 * The resolution chain: an explicit `height` tag, else `building:levels`, else an
 * observed height from the satellite raster, else synthesis. Tagged values are
 * clamped too, but at a far more generous ceiling — see MAX_TAGGED_HEIGHT_M — and
 * observed ones at a ceiling between the two.
 */
export function resolveHeight(
  tags: Record<string, string | undefined>,
  {
    id,
    areaM2,
    kind,
    observed,
  }: { id: string; areaM2: number; kind: string; observed?: ObservedHeight | null },
): HeightSource {
  // parseFloat rather than Number, because OSM heights carry units: "12 m".
  const tagged = Number.parseFloat(tags.height ?? '');
  if (Number.isFinite(tagged) && tagged > 0) {
    return { height: tidy(clamp(tagged, MIN_HEIGHT_M, MAX_TAGGED_HEIGHT_M)), from: 'height' };
  }

  const levels = Number.parseFloat(tags['building:levels'] ?? '');
  if (Number.isFinite(levels) && levels > 0) {
    return {
      height: tidy(clamp(levels * LEVEL_HEIGHT_M, MIN_HEIGHT_M, MAX_TAGGED_HEIGHT_M)),
      from: 'levels',
    };
  }

  if (acceptObservation(observed)) {
    return {
      height: tidy(clamp(observed.height, MIN_HEIGHT_M, MAX_OBSERVED_HEIGHT_M)),
      from: 'observed',
    };
  }

  return { height: synthesiseHeight(id, areaM2, kind), from: 'synth' };
}
