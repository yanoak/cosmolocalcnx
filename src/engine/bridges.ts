/**
 * Bridges, generated from the roads that carry OSM's `bridge` flag.
 *
 * Roads are drawn into the ground texture and water is a flat polygon over it,
 * so a road that crosses the Ping vanishes at the bank. This module builds what
 * the texture cannot: a deck at road width raised above the water, a ramp down to
 * ground beyond each abutment, low parapets, and piers wherever the span is over
 * water. Everything comes from the baseline — no asset, no hand placement — which
 * is the roadmap's Tier 2: the local vernacular as a generator that travels to the
 * next city. See plans/2026-09-19_bridges.plan.md.
 *
 * Pure, in scene metres, and the output is a triangle soup in three.js orientation
 * (x east, y up, z = −north) so Bridges.tsx only has to wrap it in a buffer.
 */

import { pointInAny } from './clip';
import type { Poly } from './clip';
import type { Point2 } from './extrude';
import type { BaselineArea, BaselineRoad } from './scene';
import { toneForNormal } from './shading';
import { BRIDGE_TONES } from './theme';
import type { Ramp } from './theme';

/** How often the way is sampled to decide whether it is over water. */
export const WATER_SAMPLE_M = 5;

/** Where the ramp meets the ground: a hair above the road texture, so they join. */
export const GROUND_TOP_M = 0.15;
/** How far the ramp and pier footings sink, so nothing shows a bottom edge. */
export const BURIED_M = -0.6;

export interface BridgeProfile {
  /** Top of the deck above the plain, metres. */
  deckTop: number;
  thickness: number;
  parapet: number;
  parapetWidth: number;
  /** How far beyond each abutment the ramp reaches the ground. */
  rampLength: number;
  pierSpacing: number;
  /** Pier size along the deck; across it is the deck width less a margin. */
  pierAlong: number;
}

/**
 * By road class, not by bridge. The Ping's road bridges sit six to eight metres
 * over the low-season water; a footbridge sits lower and thinner. Guesses by
 * class, and the plan says so — if someone who knows the bridges corrects one,
 * this table is the place.
 */
const PROFILES: Record<string, BridgeProfile> = {
  major: { deckTop: 7.5, thickness: 1.2, parapet: 1.1, parapetWidth: 0.4, rampLength: 30, pierSpacing: 26, pierAlong: 2.0 },
  secondary: { deckTop: 6.5, thickness: 1.0, parapet: 1.1, parapetWidth: 0.35, rampLength: 26, pierSpacing: 24, pierAlong: 1.8 },
  street: { deckTop: 5.5, thickness: 0.9, parapet: 1.0, parapetWidth: 0.3, rampLength: 20, pierSpacing: 20, pierAlong: 1.5 },
  service: { deckTop: 5.0, thickness: 0.8, parapet: 1.0, parapetWidth: 0.3, rampLength: 16, pierSpacing: 18, pierAlong: 1.2 },
  path: { deckTop: 4.5, thickness: 0.5, parapet: 1.0, parapetWidth: 0.2, rampLength: 12, pierSpacing: 16, pierAlong: 0.9 },
};

export function profileFor(kind: string): BridgeProfile {
  return PROFILES[kind] ?? PROFILES.street;
}

/** Water areas as clip polygons: outer ring first, holes after. */
export function waterPolys(water: BaselineArea[]): Poly[] {
  return water.map((w) => [w.footprint, ...(w.holes ?? [])]);
}

/** True if any point sampled along the path, vertices included, lies in water. */
export function crossesWater(path: Point2[], water: Poly[], step = WATER_SAMPLE_M): boolean {
  if (path.length === 0 || water.length === 0) return false;
  for (let i = 0; i < path.length; i++) {
    if (pointInAny(path[i], water)) return true;
    if (i + 1 >= path.length) continue;
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const length = Math.hypot(bx - ax, by - ay);
    for (let s = step; s < length; s += step) {
      const t = s / length;
      if (pointInAny([ax + (bx - ax) * t, ay + (by - ay) * t], water)) return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------ geometry

function sub(a: Point2, b: Point2): Point2 {
  return [a[0] - b[0], a[1] - b[1]];
}

function unit([x, y]: Point2): Point2 {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

/** Left-hand normal of a direction, in the ground plane. */
function leftOf([x, y]: Point2): Point2 {
  return [-y, x];
}

/**
 * Offset a polyline both ways by `halfWidth`, with mitred joins bounded at twice
 * the half width so a sharp kink cannot throw a spike across the river.
 */
export function ribbon(path: Point2[], halfWidth: number): { left: Point2[]; right: Point2[] } {
  const left: Point2[] = [];
  const right: Point2[] = [];
  const n = path.length;
  if (n === 0) return { left, right };
  if (n === 1) {
    left.push([path[0][0], path[0][1] + halfWidth]);
    right.push([path[0][0], path[0][1] - halfWidth]);
    return { left, right };
  }

  const dirs: Point2[] = [];
  for (let i = 0; i < n - 1; i++) dirs.push(unit(sub(path[i + 1], path[i])));

  for (let i = 0; i < n; i++) {
    const before = dirs[Math.max(0, i - 1)];
    const after = dirs[Math.min(n - 2, i)];
    const nb = leftOf(before);
    const na = leftOf(after);
    // Mitre direction is the mean of the two edge normals; its length grows with
    // the turn angle, hence the cap.
    let mx = nb[0] + na[0];
    let my = nb[1] + na[1];
    const ml = Math.hypot(mx, my);
    let scale: number;
    if (ml < 1e-6) {
      mx = nb[0];
      my = nb[1];
      scale = halfWidth;
    } else {
      mx /= ml;
      my /= ml;
      const cosHalf = mx * nb[0] + my * nb[1];
      scale = Math.min(halfWidth / Math.max(cosHalf, 1e-6), 2 * halfWidth);
    }
    left.push([path[i][0] + mx * scale, path[i][1] + my * scale]);
    right.push([path[i][0] - mx * scale, path[i][1] - my * scale]);
  }
  return { left, right };
}

/** The way with a ramp station added beyond each end, along the end segments. */
export function extendedPath(path: Point2[], rampLength: number): Point2[] {
  if (path.length < 2) return [...path];
  const first = unit(sub(path[1], path[0]));
  const last = unit(sub(path[path.length - 1], path[path.length - 2]));
  const a = path[0];
  const z = path[path.length - 1];
  return [
    [a[0] - first[0] * rampLength, a[1] - first[1] * rampLength],
    ...path,
    [z[0] + last[0] * rampLength, z[1] + last[1] * rampLength],
  ];
}

export interface DeckStation {
  left: Point2;
  right: Point2;
  top: number;
  bottom: number;
}

/**
 * One station per vertex of the extended way. The span holds its class height;
 * the two ramp stations at the ends sit on the ground with a buried underside.
 */
export function deckStations(road: BaselineRoad, profile = profileFor(road.kind)): DeckStation[] {
  const path = extendedPath(road.path, profile.rampLength);
  const halfWidth = Math.max(road.width, 3) / 2;
  const { left, right } = ribbon(path, halfWidth);
  return path.map((_, i) => {
    const ramp = i === 0 || i === path.length - 1;
    return {
      left: left[i],
      right: right[i],
      top: ramp ? GROUND_TOP_M : profile.deckTop,
      bottom: ramp ? BURIED_M : profile.deckTop - profile.thickness,
    };
  });
}

export interface PierSpot {
  at: Point2;
  /** Unit direction of the deck at the pier. */
  dir: Point2;
}

/**
 * Piers at a fixed spacing along the tagged way, kept only where they stand in
 * water. Centred on the span, so a short bridge gets one pier in the middle
 * rather than one at each bank.
 */
export function pierSpots(path: Point2[], spacing: number, water: Poly[]): PierSpot[] {
  if (path.length < 2 || spacing <= 0) return [];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const l = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    lengths.push(l);
    total += l;
  }
  const count = Math.max(1, Math.floor(total / spacing));
  const offset = (total - (count - 1) * spacing) / 2;

  const spots: PierSpot[] = [];
  for (let k = 0; k < count; k++) {
    let s = offset + k * spacing;
    let i = 0;
    while (i < lengths.length - 1 && s > lengths[i]) {
      s -= lengths[i];
      i++;
    }
    const t = lengths[i] > 0 ? Math.min(1, s / lengths[i]) : 0;
    const at: Point2 = [
      path[i][0] + (path[i + 1][0] - path[i][0]) * t,
      path[i][1] + (path[i + 1][1] - path[i][1]) * t,
    ];
    if (pointInAny(at, water)) spots.push({ at, dir: unit(sub(path[i + 1], path[i])) });
  }
  return spots;
}

// ---------------------------------------------------------------- triangles

export interface TriSoup {
  positions: number[];
  normals: number[];
  colors: number[];
}

type V3 = [number, number, number];

/** Scene metres [x, north] and a height to three.js [x, y, −z]. */
function v(p: Point2, height: number): V3 {
  return [p[0], height, -p[1]];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function pushTriangle(soup: TriSoup, a: V3, b: V3, c: V3, ramp: Ramp): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
  let nx = uy * wz - uz * wy;
  let ny = uz * wx - ux * wz;
  let nz = ux * wy - uy * wx;
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-9) return; // degenerate
  nx /= l;
  ny /= l;
  nz /= l;
  const [r, g, bl] = hexToRgb(ramp[toneForNormal(nx, ny, nz)]);
  for (const p of [a, b, c]) {
    soup.positions.push(p[0], p[1], p[2]);
    soup.normals.push(nx, ny, nz);
    soup.colors.push(r, g, bl);
  }
}

/**
 * A quad a-b-c-d, wound so its normal agrees with `outward`. Ordering the four
 * corners consistently is fiddly across six kinds of face; checking the result
 * against a hint is not.
 */
function pushQuad(soup: TriSoup, a: V3, b: V3, c: V3, d: V3, outward: V3, ramp: Ramp): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
  const nx = uy * wz - uz * wy;
  const ny = uz * wx - ux * wz;
  const nz = ux * wy - uy * wx;
  const agrees = nx * outward[0] + ny * outward[1] + nz * outward[2] >= 0;
  if (agrees) {
    pushTriangle(soup, a, b, c, ramp);
    pushTriangle(soup, a, c, d, ramp);
  } else {
    pushTriangle(soup, a, c, b, ramp);
    pushTriangle(soup, a, d, c, ramp);
  }
}

/** A slab between consecutive stations: top, bottom, both walls. Ends capped by the caller. */
function pushSlab(
  soup: TriSoup,
  s0: DeckStation,
  s1: DeckStation,
  heights: (s: DeckStation) => [number, number],
  ramp: Ramp,
): void {
  const [t0, b0] = heights(s0);
  const [t1, b1] = heights(s1);
  const l0t = v(s0.left, t0), r0t = v(s0.right, t0), l1t = v(s1.left, t1), r1t = v(s1.right, t1);
  const l0b = v(s0.left, b0), r0b = v(s0.right, b0), l1b = v(s1.left, b1), r1b = v(s1.right, b1);
  const leftOut = leftOf(unit(sub(s1.left, s0.left)));
  pushQuad(soup, l0t, r0t, r1t, l1t, [0, 1, 0], ramp);
  pushQuad(soup, l0b, r0b, r1b, l1b, [0, -1, 0], ramp);
  pushQuad(soup, l0t, l1t, l1b, l0b, [leftOut[0], 0, -leftOut[1]], ramp);
  pushQuad(soup, r0t, r1t, r1b, r0b, [-leftOut[0], 0, leftOut[1]], ramp);
}

function pushBox(soup: TriSoup, corners: [Point2, Point2, Point2, Point2], bottom: number, top: number, ramp: Ramp): void {
  const [a, b, c, d] = corners;
  const at = v(a, top), bt = v(b, top), ct = v(c, top), dt = v(d, top);
  const ab = v(a, bottom), bb = v(b, bottom), cb = v(c, bottom), db = v(d, bottom);
  pushQuad(soup, at, bt, ct, dt, [0, 1, 0], ramp);
  pushQuad(soup, ab, bb, cb, db, [0, -1, 0], ramp);
  const sides: [V3, V3, V3, V3, Point2, Point2][] = [
    [at, bt, bb, ab, a, b],
    [bt, ct, cb, bb, b, c],
    [ct, dt, db, cb, c, d],
    [dt, at, ab, db, d, a],
  ];
  const cx = (a[0] + b[0] + c[0] + d[0]) / 4;
  const cy = (a[1] + b[1] + c[1] + d[1]) / 4;
  for (const [p, q, r, s, e0, e1] of sides) {
    const mx = (e0[0] + e1[0]) / 2 - cx;
    const my = (e0[1] + e1[1]) / 2 - cy;
    pushQuad(soup, p, q, r, s, [mx, 0, -my], ramp);
  }
}

/** Everything for one bridge: deck, ramps, parapets, piers. */
export function bridgeTriangles(
  road: BaselineRoad,
  water: Poly[],
  profile = profileFor(road.kind),
  tones = BRIDGE_TONES,
): TriSoup {
  const soup: TriSoup = { positions: [], normals: [], colors: [] };
  const stations = deckStations(road, profile);
  if (stations.length < 2) return soup;

  // Deck, with the ramps.
  for (let i = 0; i < stations.length - 1; i++) {
    pushSlab(soup, stations[i], stations[i + 1], (s) => [s.top, s.bottom], tones.deck);
  }

  // Parapets along both edges of the span (not the ramps), as thin boxes per segment.
  const pw = profile.parapetWidth;
  for (let i = 1; i < stations.length - 2; i++) {
    const s0 = stations[i];
    const s1 = stations[i + 1];
    for (const side of ['left', 'right'] as const) {
      const e0 = s0[side];
      const e1 = s1[side];
      const inward = unit(sub(side === 'left' ? s0.right : s0.left, e0));
      const i0: Point2 = [e0[0] + inward[0] * pw, e0[1] + inward[1] * pw];
      const i1: Point2 = [e1[0] + inward[0] * pw, e1[1] + inward[1] * pw];
      pushBox(soup, [e0, e1, i1, i0], s0.top, s0.top + profile.parapet, tones.parapet);
    }
  }

  // Piers, from below the water up to the deck's underside.
  const across = Math.max(1, Math.max(road.width, 3) - 1.2) / 2;
  const along = profile.pierAlong / 2;
  for (const { at, dir } of pierSpots(road.path, profile.pierSpacing, water)) {
    const n = leftOf(dir);
    const corner = (sa: number, sn: number): Point2 => [
      at[0] + dir[0] * sa * along + n[0] * sn * across,
      at[1] + dir[1] * sa * along + n[1] * sn * across,
    ];
    pushBox(
      soup,
      [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
      BURIED_M,
      profile.deckTop - profile.thickness + 0.05,
      tones.pier,
    );
  }

  return soup;
}

/** All bridges in a baseline: the flagged roads that actually cross water. */
export function bridgesSoup(roads: BaselineRoad[], water: BaselineArea[]): TriSoup {
  const polys = waterPolys(water);
  const soup: TriSoup = { positions: [], normals: [], colors: [] };
  for (const road of roads) {
    if (!road.bridge || !crossesWater(road.path, polys)) continue;
    const one = bridgeTriangles(road, polys);
    soup.positions.push(...one.positions);
    soup.normals.push(...one.normals);
    soup.colors.push(...one.colors);
  }
  return soup;
}
