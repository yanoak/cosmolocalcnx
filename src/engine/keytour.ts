/**
 * The keyboard's walk through a chapter: Down and Up step through the stem's stops — each
 * card and the empty screen after it, where the map changes before the next card's words
 * arrive (see `stemAt`) — and past the last card into the bowl, where they open the chapter's pins one after another
 * in the document's order. Up retraces the same path — through the pins, closing the
 * first, and back onto the last card.
 *
 * One line, not a grid. Left and Right still walk the pins spatially; this is the path
 * for somebody reading the chapter start to finish with two keys, which is what the
 * exhibition laptop and the projector are driven with. Pure, so the ends are testable.
 */

export interface TourState {
  mode: 'stem' | 'explore';
  /** The stem stop on screen: 2i is card i, 2i + 1 the empty screen after it. */
  stop: number;
  /** How many stops the stem has — `stemStops`. */
  stops: number;
  /** The pins in the bowl, in the order Down opens them. */
  pins: readonly string[];
  /** The pin whose popup is open, if any. */
  open: string | null;
}

export type TourMove =
  | { kind: 'stop'; index: number }
  | { kind: 'explore'; pin: string | null }
  | { kind: 'pin'; id: string | null }
  | { kind: 'stem'; index: number };

/** What one press of Down (+1) or Up (−1) does from here; null at either end of the walk. */
export function tourStep(s: TourState, dir: 1 | -1): TourMove | null {
  if (s.mode === 'stem') {
    if (dir === 1) {
      if (s.stop < s.stops - 1) return { kind: 'stop', index: s.stop + 1 };
      return { kind: 'explore', pin: s.pins[0] ?? null };
    }
    return s.stop > 0 ? { kind: 'stop', index: s.stop - 1 } : null;
  }
  // An open pin the list no longer holds — its thread toggled off — counts as none open.
  const i = s.open ? s.pins.indexOf(s.open) : -1;
  if (dir === 1) return i + 1 < s.pins.length ? { kind: 'pin', id: s.pins[i + 1] } : null;
  if (i > 0) return { kind: 'pin', id: s.pins[i - 1] };
  if (i === 0) return { kind: 'pin', id: null };
  return { kind: 'stem', index: Math.max(0, s.stops - 1) };
}

/**
 * Pins in a chapter's walk order: the ones `order` names first, as it names them, then
 * any it does not, in the order they came. A pin toggled off is simply not in `pins`.
 */
export function inWalkOrder<T extends { id: string }>(pins: readonly T[], order?: readonly string[]): T[] {
  if (!order) return [...pins];
  const rank = new Map(order.map((id, i) => [id, i]));
  return pins
    .map((p, i) => ({ p, k: rank.get(p.id) ?? order.length + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.p);
}
