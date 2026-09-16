/**
 * The scene document: the one decision everything depends on.
 *
 * A single JSON document fully describes a city. The viewer reads it, the editor
 * reads and writes it, the renderer never knows where it came from.
 * See docs/architecture.md.
 */

import { greatCircle } from './aeqd';
import type { LocaleMap } from './locale';
import type { Point2 } from './extrude';
import { projectToLocalMetres } from './project';

export type OsmId = string; // "osm/way/12345"

export interface BaselineBuilding {
  id: OsmId;
  footprint: Point2[];
  /** Courtyards. Absent on almost every building; present on OSM multipolygons. */
  holes?: Point2[][];
  height: number;
  kind: string;
}

/**
 * Roads are stored as polylines and drawn to a ground-plane canvas texture, not
 * extruded. See the performance budget in docs/architecture.md — buffered road
 * polygons are the classic way to spend the whole triangle budget on tarmac.
 *
 * The document keeps the lines rather than a pre-rendered image so the texture can
 * be redrawn at whatever resolution a surface needs, and so roads stay editable.
 */
export interface BaselineRoad {
  id: OsmId;
  /** Polyline in local metres — not a closed ring. */
  path: Point2[];
  kind: string;
  /** Carriageway width in metres, for the stroke. */
  width: number;
}

/** Water and green: flat polygons on the ground plane. */
export interface BaselineArea {
  id: OsmId;
  footprint: Point2[];
  holes?: Point2[][];
  kind: string;
}

export interface Baseline {
  buildings: BaselineBuilding[];
  roads: BaselineRoad[];
  water: BaselineArea[];
  green: BaselineArea[];
}

/**
 * Edits are a DIFF over baseline, never a copy of it.
 *
 * `wasAt` is the target's centroid at authoring time. OSM ids are not stable —
 * ways get split, merged and deleted upstream — so a replace whose target vanished
 * still knows where to put its asset. See "Edits snapshot what they point at".
 */
export type Edit =
  | { op: 'add'; asset: string; at: Point2; rot?: number }
  | { op: 'remove'; target: OsmId; wasAt?: Point2 }
  | { op: 'replace'; target: OsmId; asset: string; wasAt?: Point2 };

export const EDIT_OPS = ['add', 'remove', 'replace'] as const;

/**
 * A hotspot names a `target` where an object exists, and carries a bare `at`
 * position where it does not — one or the other, never both.
 */
export interface Hotspot {
  id: string;
  target?: OsmId;
  at?: Point2;
  label: LocaleMap;
  body: LocaleMap;
  image?: string;
}

export interface Scenario {
  id: string;
  label: LocaleMap;
  edits: Edit[];
  /** Hotspots about this future's own interventions. */
  hotspots: Hotspot[];
}

export interface SceneDocument {
  id: string;
  origin: [number, number];
  boundary: unknown;
  baseline: Baseline;
  scenarios: Scenario[];
  /** Shared hotspots — what every future has in common. */
  hotspots: Hotspot[];
  /** Reserved. Never implement. See "Skip elevation entirely". */
  terrain: null;
  /**
   * The REGION register — the scale at which the scene is a dot.
   *
   * OPTIONAL, and a scene without one is not broken: it simply has two registers
   * instead of three, the zoom ladder loses its outer anchor, and the visitor can
   * never reach a register with nothing in it. That is what a second neighbourhood
   * gets before anyone runs `npm run build:region`, and it has to keep working.
   */
  region?: RegionRef | null;
}

/**
 * A pointer to a committed population field, plus the projection that places it.
 *
 * The raster lives BESIDE the document rather than in it: it is not authored
 * content, it would base64-bloat a 452 KB document, and it would poison every diff.
 * The projection parameters do live in the document, because they are what the
 * renderer needs in order to put the scene's own origin in the right place, and
 * what a human would argue about.
 *
 * Note the deliberate contrast with `*.elevation.json`, which sits entirely outside
 * the schema precisely so that nothing can start rendering it. The region is the
 * opposite — it exists to be rendered — so it gets a schema entry. Two similar
 * looking derived rasters with opposite intent is how terrain would creep back in.
 */
export interface RegionRef {
  projection: {
    kind: 'aeqd';
    /** Circle centre, lat/lon. Defaults to the scene origin; overridden when the circle is a claim. */
    centre: [number, number];
    radiusKm: number;
  };
  /** Two-channel population PNG, relative to `src/scenes/`. */
  field: string;
  /** Sidecar JSON: grid, encoding, stats, source. */
  meta: string;
  label?: LocaleMap;
  /**
   * The world outside the circle, same projection, larger radius.
   *
   * Optional, and the register works without it — but the circle's claim is not
   * weighable without it. "Half of humanity lives inside this circle" needs a
   * visible outside to be a claim rather than a picture of Asia.
   */
  world?: { field: string; meta: string } | null;
}

/**
 * Fields that must never appear on an edit. The time slider was cut on 12 Sep 2026
 * and edits carry no temporal meaning; this stops it creeping back in through data
 * rather than through code.
 */
const FORBIDDEN_EDIT_FIELDS = ['year', 'date', 'when', 'phase'];

function checkHotspot(h: Hotspot, where: string, errors: string[]): void {
  const hasTarget = typeof h.target === 'string' && h.target !== '';
  const hasAt = Array.isArray(h.at);
  if (hasTarget && hasAt) {
    errors.push(`${where}: hotspot "${h.id}" has both target and at — use exactly one`);
  }
  if (!hasTarget && !hasAt) {
    errors.push(`${where}: hotspot "${h.id}" has neither target nor at — use exactly one`);
  }
}

/** Returns a list of problems. Empty means valid. */
export function validateScene(doc: SceneDocument): string[] {
  const errors: string[] = [];

  if (doc.terrain !== null) {
    errors.push('terrain must be null — elevation is a permanent non-goal');
  }

  if (!Array.isArray(doc.scenarios) || doc.scenarios.length === 0) {
    errors.push('at least one scenario is required — the toggle is the whole interaction');
  }

  for (const scenario of doc.scenarios ?? []) {
    for (const [i, edit] of (scenario.edits ?? []).entries()) {
      const where = `scenario "${scenario.id}" edit ${i}`;

      if (!EDIT_OPS.includes(edit.op as (typeof EDIT_OPS)[number])) {
        errors.push(`${where}: unknown op "${edit.op}"`);
      }

      for (const field of FORBIDDEN_EDIT_FIELDS) {
        if (field in edit) {
          errors.push(
            `${where}: carries "${field}". Edits have no date — order is for undo only`,
          );
        }
      }
    }

    for (const hotspot of scenario.hotspots ?? []) {
      checkHotspot(hotspot, `scenario "${scenario.id}"`, errors);
    }
  }

  for (const hotspot of doc.hotspots ?? []) {
    checkHotspot(hotspot, 'scene', errors);
  }

  if (doc.region) {
    const { kind, centre, radiusKm } = doc.region.projection ?? {};

    if (kind !== 'aeqd') {
      errors.push(
        `region: projection must be "aeqd" — the circle has to be a true circle, ` +
          `and "${kind}" would make it an ellipse`,
      );
    }

    if (!(typeof radiusKm === 'number' && radiusKm > 0 && radiusKm < 10_000)) {
      // Past ~10,000 km an azimuthal equidistant plane folds through the antipode
      // and the projection stops being a map of anywhere.
      errors.push(`region: radiusKm must be between 0 and 10,000 — got ${radiusKm}`);
    } else if (Array.isArray(centre) && Array.isArray(doc.origin)) {
      // The one that matters, and the one that is silent otherwise: a district
      // outside its own circle has nowhere for the handover to land.
      const { distanceKm } = greatCircle(centre, doc.origin as [number, number]);
      if (distanceKm > radiusKm) {
        errors.push(
          `region: the scene origin is ${Math.round(distanceKm).toLocaleString()} km ` +
            `from the circle centre, outside its own ${Math.round(radiusKm).toLocaleString()} km circle`,
        );
      }
    }
  }

  return errors;
}

/**
 * The scene's extent in local metres, derived from its GeoJSON boundary.
 *
 * The renderer needs this to size the ground plane, the road texture and the
 * camera. Deriving it from the boundary rather than hard-coding numbers is what
 * lets the clip in scripts/fetch-osm.ts move without the viewer knowing.
 */
export function sceneBoundsMetres(doc: SceneDocument): [number, number, number, number] {
  const ring = (doc.boundary as { coordinates?: number[][][] })?.coordinates?.[0];
  if (!ring?.length) return [-200, -200, 200, 200];

  const origin = doc.origin as [number, number];
  return ring.reduce<[number, number, number, number]>(
    ([w, s, e, n], [lon, lat]) => {
      const [x, y] = projectToLocalMetres([lat, lon], origin);
      return [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
    },
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}
