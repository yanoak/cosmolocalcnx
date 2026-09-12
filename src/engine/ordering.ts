/**
 * Screen ordering for keyboard selection.
 *
 * The diorama is one tab stop with roving focus, so arrow keys move between objects
 * in the order a visitor sees them — not in document order, which is meaningless
 * on screen. Pure, so it can be tested without a canvas.
 */

import type { Point2 } from './extrude';

export interface Selectable {
  id: string;
  footprint: Point2[];
}

export function centroid(footprint: Point2[]): Point2 {
  const n = footprint.length;
  let x = 0;
  let y = 0;
  for (const [px, py] of footprint) {
    x += px;
    y += py;
  }
  return [x / n, y / n];
}

/**
 * With the camera on the (1, 1, 1) diagonal and north at -z, document (x, y) lands
 * on screen at roughly (x + y) horizontally and (x - y) vertically.
 */
export function screenPosition(footprint: Point2[]): Point2 {
  const [x, y] = centroid(footprint);
  return [x + y, x - y];
}

export type Axis = 'horizontal' | 'vertical';

export function orderForAxis<T extends Selectable>(items: T[], axis: Axis): T[] {
  const index = axis === 'horizontal' ? 0 : 1;
  return [...items].sort((a, b) => {
    const d = screenPosition(a.footprint)[index] - screenPosition(b.footprint)[index];
    // Stable tiebreak, so arrow keys never stall between two aligned buildings.
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/** Next selection along an axis, wrapping at the ends. */
export function step<T extends Selectable>(
  items: T[],
  currentId: string | null,
  axis: Axis,
  direction: 1 | -1,
): string | null {
  if (items.length === 0) return null;
  const ordered = orderForAxis(items, axis);
  if (currentId === null) return ordered[direction === 1 ? 0 : ordered.length - 1].id;
  const i = ordered.findIndex((it) => it.id === currentId);
  if (i === -1) return ordered[0].id;
  return ordered[(i + direction + ordered.length) % ordered.length].id;
}
