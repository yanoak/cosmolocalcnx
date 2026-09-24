/**
 * The pin landscape's arithmetic, pure. Which pins a view shows, where an off-frame one
 * is drawn, and which pin an arrow key reaches next. No DOM, no three.js — `Pins.tsx`
 * renders what this decides. See plans/2026-09-23_futures-chapter.plan.md.
 *
 * Positions are the document's: `at` is [east, north] in metres from the scene origin,
 * the same frame for the city and the valley.
 */

import type { Beat } from './chapters';
import { projectView } from './camera';
import type { Point2 } from './extrude';
import type { Hotspot } from './scene';
import type { ViewId } from './views';

/**
 * How far inside the frame edge a clamped pin is drawn, so its icon stands on the field
 * rather than half off it. A tenth of the valley's half-width, which at 60 km is 6 km —
 * generous, because the clamp is a signpost and a signpost is not where the place is.
 */
export const EDGE_MARGIN_FRACTION = 0.1;

export interface Placement {
  /** Where the pin is drawn. Equal to the hotspot's `at` unless it was pulled in. */
  at: Point2;
  /** True when the place is outside the frame and the pin stands at the edge instead. */
  clamped: boolean;
  /** The place's true distance from the origin, in whole kilometres. */
  distanceKm: number;
  /** The place's true direction from the origin — 'north', 'south-east', and so on. */
  compass: string;
}

const POINTS = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'] as const;

/** Eight-point compass direction of a vector, mathematical convention: east is 0°, anticlockwise. */
export function compassPoint([east, north]: Point2): string {
  const a = Math.atan2(north, east); // −π..π
  const i = Math.round(a / (Math.PI / 4)); // −4..4
  return POINTS[((i % 8) + 8) % 8];
}

/**
 * A pin is drawn where its place is, unless the place is outside the square frame of
 * ±`halfM` — then it is pulled in along its own bearing to sit just inside the edge, and
 * the placement says so, so the label can carry the true distance. Chiang Dao at 64 km
 * north of a 60 km frame is the case this exists for. Fiction places approximately and
 * this is one more approximation; the label is what keeps it honest.
 */
export function placeInFrame(at: Point2, halfM: number, margin = EDGE_MARGIN_FRACTION): Placement {
  const [e, n] = at;
  const distanceKm = Math.round(Math.hypot(e, n) / 1000);
  const compass = compassPoint(at);
  const reach = Math.max(Math.abs(e), Math.abs(n));
  const inner = halfM * (1 - margin);
  if (reach <= halfM) return { at, clamped: false, distanceKm, compass };
  const k = inner / reach;
  return { at: [e * k, n * k], clamped: true, distanceKm, compass };
}

/**
 * The pins a view shows right now. In the bowl, every pin placed in that view; during a
 * beat, only the ones the beat names — a pin arriving is what a beat *does*, and a pin
 * the stem has not reached yet is not on the landscape. Order is the document's.
 */
export function pinsFor(hotspots: readonly Hotspot[], view: ViewId, beat: Beat | null): Hotspot[] {
  const inView = hotspots.filter((h) => h.view === view && Array.isArray(h.at));
  if (!beat) return inView;
  const named = new Set(beat.hotspots ?? []);
  return inView.filter((h) => named.has(h.id));
}

/**
 * The pin an arrow key lands on: the nearest one in that screen direction, measured in
 * the camera's own projection so "right" is right on the screen and not east on the
 * ground. Never the pin it started from; null when nothing lies that way. Ties break on
 * id, so the answer is the same on every machine.
 */
export function nearestPin(
  from: Hotspot,
  direction: [number, number],
  pins: readonly Hotspot[],
): Hotspot | null {
  if (!from.at) return null;
  const [fx, fy] = projectView(from.at[0], from.at[1]);
  const [dx, dy] = direction;
  let best: { pin: Hotspot; score: number } | null = null;
  for (const p of pins) {
    if (p.id === from.id || !p.at) continue;
    const [px, py] = projectView(p.at[0], p.at[1]);
    const vx = px - fx;
    const vy = py - fy;
    const along = vx * dx + vy * dy;
    if (along <= 0) continue;
    // Distance, penalised for being off-axis, so a pin straight ahead beats a nearer
    // one off to the side — the usual spatial-navigation weighting.
    const across = Math.abs(vx * dy - vy * dx);
    const score = along + 2 * across;
    if (!best || score < best.score || (score === best.score && p.id < best.pin.id)) {
      best = { pin: p, score };
    }
  }
  return best?.pin ?? null;
}

/** The first pin to land on when none is open: the one nearest the origin, by id on a tie. */
export function firstPin(pins: readonly Hotspot[]): Hotspot | null {
  let best: Hotspot | null = null;
  let bestD = Infinity;
  for (const p of pins) {
    if (!p.at) continue;
    const d = Math.hypot(p.at[0], p.at[1]);
    if (d < bestD || (d === bestD && best && p.id < best.id)) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// The popup's place on the screen.

export interface PopupFit {
  /** Horizontal shift in CSS px to keep the card inside the stage. */
  dx: number;
  /** True when there is no room above the icon and the card opens under it instead. */
  below: boolean;
}

/**
 * Where a pin's card goes, given where it would land if it simply opened above its
 * icon. Cards open above by default, since the icon is the thing they are about and a
 * card over it hides nothing else; a pin near the top of the stage flips its card
 * underneath, and a pin near either side slides its card in. Pure: measured rectangles
 * in, an offset out, so the rule is testable without a browser.
 */
export function fitPopup(
  card: { left: number; top: number; width: number; height: number },
  stage: { left: number; top: number; width: number; height: number },
  spaceBelow: number,
  margin = 12,
): PopupFit {
  let dx = 0;
  const overLeft = stage.left + margin - card.left;
  const overRight = card.left + card.width - (stage.left + stage.width - margin);
  if (overLeft > 0) dx = overLeft;
  else if (overRight > 0) dx = -overRight;
  const below = card.top < stage.top + margin && spaceBelow >= card.height + margin;
  return { dx, below };
}
