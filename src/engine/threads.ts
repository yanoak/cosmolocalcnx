/**
 * The Past chapter's five threads — river, caravans, roads, rail, air — and the rule
 * that governs how each is drawn: **certainty is visual grammar.** Each thread gets the
 * geometry its evidence supports, and the drawing says how much we know. A confirmed
 * alignment is a solid line; a probable corridor is a broad dashed band between the
 * places the trade is documented at; a connection with no route — remote work — is
 * nodes and nothing else. See docs/research/2026-09-23_past-chapter.findings.md.
 *
 * The valley-as-futures draws soft shapes too, for the opposite reason: fiction places
 * approximately because nothing is claimed as fact. Same strokes, different justification,
 * and that is why this module exists apart from the Futures' transport overlay rather than
 * sharing a flag with it — nobody can unify the two without deleting this comment.
 *
 * Pure: features in, strokes out. `ValleyView` draws what this decides.
 */

import type { Point2 } from './extrude';
import { PING } from './valley';

export type ThreadId = 'river' | 'caravans' | 'roads' | 'rail' | 'air';
export type Certainty = 'confirmed' | 'probable' | 'none';

export const THREAD_ORDER: readonly ThreadId[] = ['river', 'caravans', 'roads', 'rail', 'air'];

export interface Thread {
  id: ThreadId;
  label: string;
  certainty: Certainty;
}

export const THREADS: Record<ThreadId, Thread> = {
  river: { id: 'river', label: 'River', certainty: 'confirmed' },
  caravans: { id: 'caravans', label: 'Caravans', certainty: 'probable' },
  roads: { id: 'roads', label: 'Roads', certainty: 'confirmed' },
  rail: { id: 'rail', label: 'Rail', certainty: 'confirmed' },
  // Remote work has no surveyable line. Its only geometry is the airport, which is a
  // hotspot; this thread yields no polylines at all, and the test pins that.
  air: { id: 'air', label: 'Air', certainty: 'none' },
};

/** How a certainty is drawn. `dashed` is the grammar: dashed means uncertain, here. */
export interface StrokeStyle {
  dashed: boolean;
  widthPx: number;
  opacity: number;
}

export function styleFor(certainty: Certainty): StrokeStyle | null {
  switch (certainty) {
    case 'confirmed':
      return { dashed: false, widthPx: 3, opacity: 0.95 };
    case 'probable':
      // Broad and faint: a band the route lay somewhere inside, not a line it followed.
      return { dashed: true, widthPx: 12, opacity: 0.35 };
    case 'none':
      return null;
  }
}

/** The subset of the valley's features a thread is built from. */
export interface ThreadFeatures {
  rivers: { name: string; path: Point2[] }[];
  roads?: { kind: string; ref?: string; path: Point2[] }[];
  rails?: { path: Point2[] }[];
}

/** The route number the Superhighway's last section carries. */
export const HIGHWAY_11 = '11';

/**
 * The caravan corridors: the Yunnan–Lan Na axis north up the Ping and Mae Taeng valleys
 * toward Chiang Dao and Yunnan beyond it, and the southern leg down to Lamphun and on
 * toward the Chao Phraya and the Burmese ports. The NODES are documented; the lines
 * between them are not routes — no centreline exists to find — so each is drawn as a
 * broad dashed band and clamped to the frame where it leaves. Local metres.
 */
export const CARAVAN_CORRIDORS: readonly { id: string; nodes: Point2[] }[] = [
  { id: 'north', nodes: [[0, 0], [-6670, 36940], [-4040, 60000]] },
  { id: 'south', nodes: [[0, 0], [390, -23730], [3000, -60000]] },
];

export interface ThreadStroke {
  thread: ThreadId;
  style: StrokeStyle;
  paths: Point2[][];
}

/**
 * The strokes for a set of threads. A thread not in `on` is absent; a thread with
 * certainty `none` is absent whatever `on` says, because there is nothing to draw.
 */
export function threadStrokes(on: ReadonlySet<ThreadId>, f: ThreadFeatures): ThreadStroke[] {
  const out: ThreadStroke[] = [];
  for (const id of THREAD_ORDER) {
    if (!on.has(id)) continue;
    const style = styleFor(THREADS[id].certainty);
    if (!style) continue;
    const paths = pathsFor(id, f);
    if (paths.length > 0) out.push({ thread: id, style, paths });
  }
  return out;
}

function pathsFor(id: ThreadId, f: ThreadFeatures): Point2[][] {
  switch (id) {
    case 'river':
      // The Ping, which the argument opens with. Tributaries are the substrate's business.
      return f.rivers.filter((r) => r.name === PING).map((r) => r.path);
    case 'caravans':
      return CARAVAN_CORRIDORS.map((c) => c.nodes);
    case 'roads':
      // Highway 11 by its ref, and only that: the research warns against implying the
      // Superhighway paved an older alignment, so no other road is on this layer.
      return (f.roads ?? []).filter((r) => r.ref === HIGHWAY_11).map((r) => r.path);
    case 'rail':
      return (f.rails ?? []).map((r) => r.path);
    case 'air':
      return [];
  }
}
