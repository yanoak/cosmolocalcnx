/**
 * The scene document: the one decision everything depends on.
 *
 * A single JSON document fully describes a city. The viewer reads it, the editor
 * reads and writes it, the renderer never knows where it came from.
 * See docs/architecture.md.
 */

import type { LocaleMap } from './locale';
import type { Point2 } from './extrude';

export type OsmId = string; // "osm/way/12345"

export interface BaselineBuilding {
  id: OsmId;
  footprint: Point2[];
  height: number;
  kind: string;
}

export interface Baseline {
  buildings: BaselineBuilding[];
  roads: unknown[];
  water: unknown[];
  green: unknown[];
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

  return errors;
}
