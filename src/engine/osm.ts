/**
 * Overpass response to `baseline`.
 *
 * Pure, and separated from the fetching in `scripts/fetch-osm.ts` on purpose: the
 * network half cannot be tested and the transform half is where every bug that
 * silently corrupts the scene lives. See docs/architecture.md, "OSM pipeline".
 */

import { centroid, pointInAny, pointInRing, ringArea } from './clip';
import type { Poly } from './clip';
import { projectToLocalMetres } from './project';
import type { LatLon } from './project';
import { externalBuildings, observedHeights } from './satellite';
import type { BuildingsCache } from './satellite';
import { footprintArea, resolveHeight } from './synth';
import type { HeightSource, ObservedHeight } from './synth';
import type { Point2 } from './extrude';
import type { Baseline, BaselineArea, BaselineBuilding, BaselineRoad, OsmId } from './scene';

// ------------------------------------------------------------ Overpass shapes

export interface OverpassLatLon {
  lat: number;
  lon: number;
}

export interface OverpassMember {
  type: 'node' | 'way' | 'relation';
  ref: number;
  role: string;
  geometry?: OverpassLatLon[];
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  /** Present on ways when the query used `out geom`. */
  geometry?: OverpassLatLon[];
  members?: OverpassMember[];
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

export function osmId(el: Pick<OverpassElement, 'type' | 'id'>): OsmId {
  return `osm/${el.type}/${el.id}`;
}

// ------------------------------------------------------------------- rings

/**
 * Coordinates are rounded to the centimetre before anything else touches them.
 *
 * Two reasons, and the second is the important one. It keeps the committed document
 * to a sane size across ~1,600 buildings; and it is what makes a re-run
 * byte-identical, because an unrounded projection carries seventeen digits of
 * floating-point noise that will differ the moment any constant upstream shifts.
 */
const PRECISION = 100;

function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

function samePoint(a: Point2, b: Point2): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Project a lat/lon ring to local metres, dropping points that collapse onto their
 * neighbour once rounded and the repeated closing node OSM ways carry.
 */
export function projectRing(geometry: OverpassLatLon[], origin: LatLon): Point2[] {
  const out: Point2[] = [];

  for (const node of geometry) {
    if (!Number.isFinite(node?.lat) || !Number.isFinite(node?.lon)) continue;
    const [east, north] = projectToLocalMetres([node.lat, node.lon], origin);
    const point: Point2 = [round(east), round(north)];
    if (out.length && samePoint(out[out.length - 1], point)) continue;
    out.push(point);
  }

  while (out.length > 1 && samePoint(out[0], out[out.length - 1])) out.pop();

  return out;
}

function isClosed(ring: OverpassLatLon[]): boolean {
  const a = ring[0];
  const b = ring[ring.length - 1];
  return ring.length > 2 && a.lat === b.lat && a.lon === b.lon;
}

/**
 * Join member ways end-to-end into closed rings.
 *
 * A multipolygon's outer ring is very often several ways — this is normal OSM, not
 * a broken relation — and Overpass hands them back as separate member geometries in
 * no particular order and in either direction. Without stitching, each fragment
 * becomes its own unclosed "ring" and the building comes out as a handful of
 * slivers. Fragments that never close are discarded rather than closed by force;
 * inventing an edge across a genuinely broken relation produces a wrong building
 * that looks right.
 */
export function stitchRings(segments: OverpassLatLon[][]): OverpassLatLon[][] {
  const pool = segments.filter((s) => Array.isArray(s) && s.length >= 2).map((s) => [...s]);
  const rings: OverpassLatLon[][] = [];

  const joins = (a: OverpassLatLon, b: OverpassLatLon) => a.lat === b.lat && a.lon === b.lon;

  while (pool.length) {
    let current = pool.shift() as OverpassLatLon[];

    while (!isClosed(current)) {
      const end = current[current.length - 1];
      const next = pool.findIndex((s) => joins(s[0], end) || joins(s[s.length - 1], end));
      if (next < 0) break;

      const [segment] = pool.splice(next, 1);
      const piece = joins(segment[0], end)
        ? segment.slice(1)
        : segment.slice(0, -1).reverse();
      current = current.concat(piece);
    }

    if (isClosed(current)) rings.push(current);
  }

  return rings;
}

export interface ElementRings {
  outer: OverpassLatLon[][];
  inner: OverpassLatLon[][];
}

/**
 * The closed rings of a way or a multipolygon relation.
 *
 * An element with no usable geometry yields no rings, so callers skip it — the
 * alternative is a footprint of NaN coordinates that renders as nothing and breaks
 * every bounding-box calculation downstream.
 */
export function ringsFromElement(el: OverpassElement): ElementRings {
  if (el.type === 'way') {
    const geometry = el.geometry ?? [];
    return { outer: isClosed(geometry) ? [geometry] : [], inner: [] };
  }

  if (el.type === 'relation') {
    const members = (el.members ?? []).filter(
      (m) => m.type === 'way' && Array.isArray(m.geometry) && m.geometry.length >= 2,
    );
    // An empty role means "outer" for a multipolygon, and plenty of relations use it.
    const outerParts = members.filter((m) => m.role !== 'inner').map((m) => m.geometry!);
    const innerParts = members.filter((m) => m.role === 'inner').map((m) => m.geometry!);
    return { outer: stitchRings(outerParts), inner: stitchRings(innerParts) };
  }

  return { outer: [], inner: [] };
}

// -------------------------------------------------------------------- kinds

/**
 * OSM tags to the `kind` the theme colours by. Deliberately small: this maps to
 * four surface roles, not to OSM's full building taxonomy, and a kind nobody
 * anticipated falls back to stock rather than throwing. See theme.ts.
 */
export function kindForTags(tags: Record<string, string> = {}): string {
  const building = tags.building ?? '';

  if (
    tags.amenity === 'place_of_worship' ||
    ['temple', 'monastery', 'shrine', 'cathedral', 'church', 'mosque'].includes(building)
  ) {
    return 'temple';
  }
  if (tags.amenity === 'school' || ['school', 'kindergarten', 'university', 'college'].includes(building)) {
    return 'school';
  }
  if (
    ['civic', 'government', 'public', 'hospital', 'train_station', 'transportation', 'museum'].includes(building) ||
    ['hospital', 'townhall', 'police', 'fire_station', 'library', 'courthouse'].includes(tags.amenity ?? '')
  ) {
    return 'civic';
  }
  if (['industrial', 'warehouse', 'factory', 'manufacture'].includes(building)) {
    return 'industrial';
  }
  if (['retail', 'supermarket', 'kiosk', 'shop'].includes(building) || 'shop' in tags) {
    return 'retail';
  }
  if (['commercial', 'office', 'hotel', 'guest_house'].includes(building) || 'office' in tags || 'tourism' in tags) {
    return 'commercial';
  }
  if (
    ['house', 'residential', 'apartments', 'detached', 'semidetached_house', 'terrace',
     'bungalow', 'hut', 'dormitory', 'farm'].includes(building)
  ) {
    return 'residential';
  }

  // `building=yes` and friends. Named honestly rather than guessed at: in a
  // shophouse district it could be either, and the theme treats it as stock.
  return 'default';
}

/** `highway` to a road class and a stroke width in metres, for the ground texture. */
const ROAD_CLASSES: Record<string, { kind: string; width: number }> = {
  motorway: { kind: 'major', width: 14 },
  trunk: { kind: 'major', width: 13 },
  primary: { kind: 'major', width: 12 },
  secondary: { kind: 'secondary', width: 9.5 },
  tertiary: { kind: 'secondary', width: 8 },
  unclassified: { kind: 'street', width: 6.5 },
  residential: { kind: 'street', width: 6 },
  living_street: { kind: 'street', width: 5 },
  service: { kind: 'service', width: 4 },
  track: { kind: 'service', width: 3.5 },
  pedestrian: { kind: 'path', width: 4 },
  footway: { kind: 'path', width: 2 },
  path: { kind: 'path', width: 1.8 },
  steps: { kind: 'path', width: 1.5 },
  cycleway: { kind: 'path', width: 2 },
};

export function roadClass(tags: Record<string, string> = {}): { kind: string; width: number } | null {
  const highway = tags.highway ?? '';
  // Links inherit their parent class at a narrower width.
  const base = highway.endsWith('_link') ? highway.slice(0, -5) : highway;
  const cls = ROAD_CLASSES[base];
  if (!cls) return null;
  if (tags.area === 'yes') return null;
  return highway.endsWith('_link') ? { kind: cls.kind, width: cls.width * 0.7 } : cls;
}

const WATER_LANDUSE = new Set(['reservoir', 'basin', 'salt_pond']);
const GREEN_LANDUSE = new Set([
  'grass', 'forest', 'meadow', 'cemetery', 'orchard', 'farmland', 'farmyard',
  'recreation_ground', 'village_green', 'allotments', 'greenfield', 'plant_nursery',
]);
const GREEN_LEISURE = new Set(['park', 'garden', 'pitch', 'playground', 'golf_course', 'nature_reserve']);

export type AreaLayer = 'water' | 'green';

export function areaLayerForTags(tags: Record<string, string> = {}): AreaLayer | null {
  if (tags.natural === 'water' || 'water' in tags || tags.waterway === 'riverbank') return 'water';
  if (WATER_LANDUSE.has(tags.landuse ?? '')) return 'water';
  if (GREEN_LEISURE.has(tags.leisure ?? '')) return 'green';
  if (GREEN_LANDUSE.has(tags.landuse ?? '')) return 'green';
  if (['wood', 'scrub', 'grassland', 'tree_row'].includes(tags.natural ?? '')) return 'green';
  return null;
}

// ------------------------------------------------------------------ budget

/** From docs/architecture.md, "Limits". */
export const AREA_WARN_KM2 = 1;
export const AREA_REJECT_KM2 = 4;

/**
 * The architecture budget is ~100–150k triangles for the whole scene. Baseline
 * buildings are not the whole scene — placed assets, vegetation and hotspot markers
 * all come out of the same allowance — so the baseline's own ceiling sits below it.
 */
export const TRIANGLE_WARN = 60_000;
export const TRIANGLE_REJECT = 100_000;

/**
 * Triangles an extruded footprint costs: two per side wall, and a top and bottom cap
 * of (v - 2) each. So about 4v - 4 for v ring vertices, holes included.
 *
 * Worth computing rather than assuming: the plan estimated 50–100 triangles per
 * building, which is what a *mesh* costs, not what an extruded OSM footprint costs.
 * Real footprints are simple, and the difference decides how big the boundary can be.
 */
export function estimateTriangles(buildings: BaselineBuilding[]): number {
  return buildings.reduce((total, b) => {
    const vertices =
      b.footprint.length + (b.holes ?? []).reduce((n, hole) => n + hole.length, 0);
    return total + Math.max(0, 4 * vertices - 4);
  }, 0);
}

export interface BudgetReport {
  errors: string[];
  warnings: string[];
}

export function checkBudget({
  areaKm2,
  triangles,
}: {
  areaKm2: number;
  triangles: number;
}): BudgetReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (areaKm2 > AREA_REJECT_KM2) {
    errors.push(
      `boundary is ${areaKm2.toFixed(2)} km2, above the ${AREA_REJECT_KM2} km2 hard limit — ` +
        `tighten the clip in scripts/fetch-osm.ts`,
    );
  } else if (areaKm2 > AREA_WARN_KM2) {
    warnings.push(
      `boundary is ${areaKm2.toFixed(2)} km2, above the ${AREA_WARN_KM2} km2 comfortable limit`,
    );
  }

  if (triangles > TRIANGLE_REJECT) {
    errors.push(
      `baseline is ~${triangles.toLocaleString('en')} triangles, above the ` +
        `${TRIANGLE_REJECT.toLocaleString('en')} ceiling — shrink the boundary, not the budget`,
    );
  } else if (triangles > TRIANGLE_WARN) {
    warnings.push(
      `baseline is ~${triangles.toLocaleString('en')} triangles, leaving little room for ` +
        `placed assets inside the 100–150k scene budget`,
    );
  }

  return { errors, warnings };
}

// --------------------------------------------------------------- the transform

export interface BuildOptions {
  origin: LatLon;
  /** Local-metre polygons. A feature is kept when its centroid falls inside one. */
  clip: Poly[];
  /**
   * The satellite-derived cache from `scripts/fetch-buildings.py`: footprints OSM
   * lacks, and observed heights for every building including OSM's. Optional, and
   * without it the baseline is OSM alone — which is what a fresh scene gets before
   * anyone runs `npm run fetch:buildings`.
   */
  buildings?: BuildingsCache | null;
  /** Derived from `buildings` by buildBaseline; callers of the lower-level functions may pass their own. */
  observed?: ReadonlyMap<string, ObservedHeight>;
}

export interface Skipped {
  noGeometry: number;
  outsideClip: number;
  degenerate: number;
}

export interface BuildStats {
  heightSources: Record<HeightSource['from'], number>;
  /** Where each building's footprint came from: osm, google, microsoft. */
  sources: Record<string, number>;
  /** External footprints dropped because an OSM building already stood there. */
  duplicates: number;
  /** Building kinds only. Water and green are counted separately — conflating them
   *  makes the building total in the report disagree with the building count. */
  kinds: Record<string, number>;
  areaKinds: Record<string, number>;
  skipped: { buildings: Skipped; roads: Skipped; areas: Skipped };
  multipolygons: number;
  holes: number;
}

function noneSkipped(): Skipped {
  return { noGeometry: 0, outsideClip: 0, degenerate: 0 };
}

export function emptyStats(): BuildStats {
  return {
    heightSources: { height: 0, levels: 0, observed: 0, synth: 0 },
    sources: {},
    duplicates: 0,
    kinds: {},
    areaKinds: {},
    skipped: { buildings: noneSkipped(), roads: noneSkipped(), areas: noneSkipped() },
    multipolygons: 0,
    holes: 0,
  };
}

/** Smaller than this and it is a bin store or a tagging accident, not a building. */
const MIN_BUILDING_AREA_M2 = 4;

/**
 * Ids stay stable across re-imports, which is what edits and hotspots reference.
 * A relation contributing more than one outer ring gets an indexed suffix, ordered
 * by the relation's own member order so the numbering does not wander.
 */
function ringId(base: OsmId, index: number, total: number): OsmId {
  return total > 1 ? `${base}/${index}` : base;
}

export function buildingsFromElements(
  elements: OverpassElement[],
  { origin, clip, observed }: BuildOptions,
  stats: BuildStats = emptyStats(),
): BaselineBuilding[] {
  const buildings: BaselineBuilding[] = [];
  const skipped = stats.skipped.buildings;

  for (const el of elements) {
    if (!el.tags || !('building' in el.tags || 'building:part' in el.tags)) continue;

    const { outer, inner } = ringsFromElement(el);
    if (outer.length === 0) {
      skipped.noGeometry += 1;
      continue;
    }
    if (el.type === 'relation') stats.multipolygons += 1;

    const projectedInner = inner.map((ring) => projectRing(ring, origin)).filter((r) => r.length >= 3);
    const base = osmId(el);
    const kind = kindForTags(el.tags);

    outer.forEach((ring, index) => {
      const footprint = projectRing(ring, origin);
      if (footprint.length < 3) {
        skipped.degenerate += 1;
        return;
      }

      const area = footprintArea(footprint);
      if (area < MIN_BUILDING_AREA_M2) {
        skipped.degenerate += 1;
        return;
      }

      const here = centroid(footprint);
      if (!pointInAny(here, clip)) {
        skipped.outsideClip += 1;
        return;
      }

      // Holes belong to whichever outer ring contains them. With a single outer
      // ring this is a formality; with several it stops a courtyard being punched
      // through the wrong part of the building.
      const holes = projectedInner.filter((hole) => pointInRing(centroid(hole), footprint));

      const id = ringId(base, index, outer.length);
      const { height, from } = resolveHeight(el.tags!, {
        id,
        areaM2: area,
        kind,
        observed: observed?.get(id),
      });

      stats.heightSources[from] += 1;
      stats.sources.osm = (stats.sources.osm ?? 0) + 1;
      stats.kinds[kind] = (stats.kinds[kind] ?? 0) + 1;
      stats.holes += holes.length;

      buildings.push(holes.length ? { id, footprint, holes, height, kind } : { id, footprint, height, kind });
    });
  }

  return buildings;
}

export function roadsFromElements(
  elements: OverpassElement[],
  { origin, clip }: BuildOptions,
  stats: BuildStats = emptyStats(),
): BaselineRoad[] {
  const roads: BaselineRoad[] = [];
  const skipped = stats.skipped.roads;

  for (const el of elements) {
    if (el.type !== 'way' || !el.tags) continue;
    const cls = roadClass(el.tags);
    if (!cls) continue;

    const path = projectRing(el.geometry ?? [], origin);
    if (path.length < 2) {
      skipped.noGeometry += 1;
      continue;
    }

    // Roads are kept if ANY vertex is inside: a street clipped to its midpoint would
    // stop at the boundary and leave the edge of the diorama looking bombed.
    if (!path.some((p) => pointInAny(p, clip))) {
      skipped.outsideClip += 1;
      continue;
    }

    roads.push({ id: osmId(el), path, kind: cls.kind, width: cls.width });
  }

  return roads;
}

export function areasFromElements(
  elements: OverpassElement[],
  layer: AreaLayer,
  { origin, clip }: BuildOptions,
  stats: BuildStats = emptyStats(),
): BaselineArea[] {
  const areas: BaselineArea[] = [];
  const skipped = stats.skipped.areas;

  for (const el of elements) {
    if (!el.tags || areaLayerForTags(el.tags) !== layer) continue;

    const { outer, inner } = ringsFromElement(el);
    if (outer.length === 0) {
      skipped.noGeometry += 1;
      continue;
    }

    const projectedInner = inner.map((r) => projectRing(r, origin)).filter((r) => r.length >= 3);
    const base = osmId(el);

    outer.forEach((ring, index) => {
      const footprint = projectRing(ring, origin);
      if (footprint.length < 3) {
        skipped.degenerate += 1;
        return;
      }

      // Water and green are backdrop, not objects: the Ping runs off both ends of
      // the scene and must be kept whole, so these clip by overlap rather than by
      // centroid. The renderer's ground plane is what bounds them visually.
      const touches =
        footprint.some((p) => pointInAny(p, clip)) ||
        pointInAny(centroid(footprint), clip);
      if (!touches) {
        skipped.outsideClip += 1;
        return;
      }

      const holes = projectedInner.filter((hole) => pointInRing(centroid(hole), footprint));
      const id = ringId(base, index, outer.length);
      const kind = layer === 'water' ? 'water' : (el.tags!.leisure ?? el.tags!.landuse ?? 'green');

      stats.areaKinds[kind] = (stats.areaKinds[kind] ?? 0) + 1;
      areas.push(holes.length ? { id, footprint, holes, kind } : { id, footprint, kind });
    });
  }

  return areas;
}

export interface BuildResult {
  baseline: Baseline;
  stats: BuildStats;
  triangles: number;
}

/** Everything above, in the order the scene document lists it. */
export function buildBaseline(
  elements: OverpassElement[],
  options: BuildOptions,
): BuildResult {
  const stats = emptyStats();

  // Observed heights apply to OSM buildings too — that is most of what the cache
  // is for, since the raster knows Rim Ping Condominium is 65 m and OSM does not.
  const observed = options.buildings ? observedHeights(options.buildings) : undefined;
  const withObserved = { ...options, observed };

  const buildings = buildingsFromElements(elements, withObserved, stats);
  if (options.buildings) {
    buildings.push(...externalBuildings(options.buildings, withObserved, buildings, stats));
  }
  const roads = roadsFromElements(elements, options, stats);
  const water = areasFromElements(elements, 'water', options, stats);
  const green = areasFromElements(elements, 'green', options, stats);

  // Sorted by id so the output is independent of the order Overpass happened to
  // return elements in. Without this, a re-run is not byte-identical and the
  // determinism check in the plan's Verification section fails for a reason that
  // has nothing to do with the synthesis.
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  buildings.sort(byId);
  roads.sort(byId);
  water.sort(byId);
  green.sort(byId);

  return {
    baseline: { buildings, roads, water, green },
    stats,
    triangles: estimateTriangles(buildings),
  };
}

/** Area of a local-metre multipolygon, in square kilometres. */
export function clipAreaKm2(clip: Poly[]): number {
  return (
    clip.reduce((total, poly) => {
      const [outer, ...holes] = poly;
      if (!outer) return total;
      return (
        total +
        holes.reduce((a, hole) => a - Math.abs(ringArea(hole)), Math.abs(ringArea(outer)))
      );
    }, 0) / 1e6
  );
}
