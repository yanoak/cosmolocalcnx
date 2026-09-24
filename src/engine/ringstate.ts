/**
 * Which cells the growing ring crossed — the pure half of the map's ring update.
 *
 * Changing a data-driven paint property makes MapLibre re-parse every tile through the
 * worker, which is the whole first-load cost again per scroll tick; on 24 Sep 2026 that
 * was "extremely slow". So the cells' colour expression is fixed — inside or outside by
 * `feature-state` — and each tick flips the state of only the cells whose distance lies
 * between the ring's previous radius and its new one. This module says which those are:
 * given cell distances sorted ascending, a half-open range of indices and the state they
 * take. Binary search, so a tick costs the cells it crosses and nothing else.
 */

export interface Crossing {
  /** Indices `[lo, hi)` into the sorted distances. Empty when `lo === hi`. */
  lo: number;
  hi: number;
  /** The state those cells take: inside the ring, or no longer. */
  inside: boolean;
}

/** First index whose value is greater than `x` — `upperBound` in the usual sense. */
export function upperBound(sorted: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The cells whose distance is in `(from, to]` when the ring grows, or `(to, from]` when it
 * shrinks. A cell exactly on the ring counts as inside, matching the shader's `<=`.
 */
export function crossing(sortedKm: ArrayLike<number>, fromKm: number, toKm: number): Crossing {
  if (toKm === fromKm) return { lo: 0, hi: 0, inside: true };
  const a = upperBound(sortedKm, Math.min(fromKm, toKm));
  const b = upperBound(sortedKm, Math.max(fromKm, toKm));
  return { lo: a, hi: b, inside: toKm > fromKm };
}

/** A sorted index over cells: ids ordered by distance, for `crossing` to slice. */
export interface CellIndex {
  km: Float64Array;
  ids: Float64Array;
}

/**
 * Build the index from (id, km) pairs, dropping duplicate ids — a cell on a tile boundary
 * comes back once per tile it touches.
 */
export function indexCells(pairs: Iterable<readonly [number, number]>): CellIndex {
  const byId = new Map<number, number>();
  for (const [id, km] of pairs) if (!byId.has(id)) byId.set(id, km);
  const order = [...byId.entries()].sort((a, b) => a[1] - b[1]);
  const km = new Float64Array(order.length);
  const ids = new Float64Array(order.length);
  order.forEach(([id, d], i) => {
    ids[i] = id;
    km[i] = d;
  });
  return { km, ids };
}
