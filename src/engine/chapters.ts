/**
 * The beat score: what a chapter's guided stem is made of.
 *
 * A chapter is a tilted martini glass — a flat base, an author-driven stem, and a bowl
 * that widens into exploration. This module is the stem. A score is an ordered list of
 * beats; a beat names the view it happens in, where the camera goes, which layers and
 * hotspots are on, and whether it is the one that releases the visitor into the bowl.
 *
 * Two invariants, both pinned by tests:
 *
 * **Scroll produces a beat index and a progress, never a camera and never a view.** The
 * beat names its view; `resolvePose` turns it into a `CameraPose` for `CameraRig`. This is
 * the rule the 21 Sep rail removal bought — "no function returns a view from a zoom" —
 * kept here by construction. The Futures stem moves from the city to the valley partway,
 * and that is legitimate precisely because the beat *names* the view rather than the zoom
 * implying one.
 *
 * **Progress is continuous inside a beat.** `IntersectionObserver` would give a bare
 * index; Present's growing circle and its zoom-out bind to a 0–1 within the beat, so
 * `beatAt` returns both and the end of one beat is the start of the next.
 *
 * Copy is not here. Beats carry ids; the words come from the Google Doc by id, and
 * `joinBeatCopy` says when the two disagree. Pure, no DOM, no three.js.
 * See plans/2026-09-24_scrolly-shell.plan.md.
 */

import type { CameraPose } from './camera';
import { CHAPTER_VIEWS, type ChapterId, type ViewId } from './views';

/**
 * Where a beat puts the camera, relative to its view.
 *
 * `zoom` is a MULTIPLE of the view's fitted zoom, not an absolute — the fit depends on
 * the viewport, and a beat has to mean the same thing on a phone, a laptop and a
 * projector of unknown shape. `target` is in world units, because a place is a place.
 */
export interface BeatPose {
  zoom: number;
  target: [number, number, number];
}

export interface Beat {
  id: string;
  /** Named, never derived. Must be one of `CHAPTER_VIEWS[chapter]`. */
  view: ViewId;
  /** Absent means the view's own fit, centred on its world. */
  pose?: Partial<BeatPose>;
  /** Overlay layers switched on for this beat — thread ids in the past, and so on. */
  layers?: readonly string[];
  /** Hotspots revealed by this beat. */
  hotspots?: readonly string[];
  /**
   * The growing circle, for a beat in the circle view: its radius at the beat's start
   * and end, as MULTIPLES of the claim radius — the distance from the centre that holds
   * half of humanity, which is computed from the committed field rather than typed
   * here. 0 is no ring; 1 is the claim; past 1 shows the curve flattening. Progress
   * within the beat interpolates between the two.
   */
  ring?: { from: number; to: number };
  /**
   * Where the MAP camera is, for a beat in the circle view — since 24 Sep 2026 that view
   * is a MapLibre map rather than the three.js scene, and its camera is a globe camera:
   * zoom in MapLibre's own scale, pitch and bearing in degrees, centre as lat/lon.
   * Absent fields hold the score's default for the chapter. A beat with a `ring`
   * interpolates toward the next beat's map pose as it plays.
   */
  mapPose?: Partial<MapPose>;
  /** The last beat: ends the stem and releases the bowl. Exactly one per score, and last. */
  terminal?: boolean;
}

/** A MapLibre camera. */
export interface MapPose {
  zoom: number;
  pitch: number;
  bearing: number;
  /** [lat, lon]. */
  centre: [number, number];
}

/** A beat's map pose, filled from the chapter's default. */
export function resolveMapPose(beat: Beat, fallback: MapPose): MapPose {
  return { ...fallback, ...beat.mapPose };
}

/**
 * The map pose `u` of the way from one to another: zoom linearly (MapLibre's zoom is
 * already logarithmic), pitch and bearing linearly, centre linearly in lat/lon — the
 * moves here are short enough that a straight line is a great circle to the eye.
 */
export function mapPoseBetween(from: MapPose, to: MapPose, u: number): MapPose {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    zoom: lerp(from.zoom, to.zoom),
    pitch: lerp(from.pitch, to.pitch),
    bearing: lerp(from.bearing, to.bearing),
    centre: [lerp(from.centre[0], to.centre[0]), lerp(from.centre[1], to.centre[1])],
  };
}

export interface Score {
  chapter: ChapterId;
  beats: readonly Beat[];
}

/** A position in a score: which beat, and how far through it. */
export interface BeatPosition {
  index: number;
  /** 0 at the start of the beat, 1 at its end. */
  t: number;
}

/**
 * Scroll progress over the whole stem → beat and progress within it. Each beat gets an
 * equal share. The last beat owns `progress === 1` (index n−1, t = 1) rather than there
 * being a phantom beat past the end, and a boundary belongs to the beat it begins.
 */
export function beatAt(progress: number, count: number): BeatPosition {
  if (count <= 0) return { index: 0, t: 0 };
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  if (p === 1) return { index: count - 1, t: 1 };
  const scaled = p * count;
  const index = Math.min(Math.floor(scaled), count - 1);
  return { index, t: scaled - index };
}

/** The fitted camera for each view, as the renderer knows it right now. */
export type ViewFits = Record<ViewId, { zoom: number; target: [number, number, number] }>;

/**
 * A beat → the pose `CameraRig` applies. The view is the beat's, always; the zoom is the
 * view's fit times the beat's multiple; the target is the beat's or the view's centre.
 */
/**
 * The ring's radius during a beat, in km, or null for a beat without one. A beat with
 * no `ring` in the circle view holds whatever the previous beat left — the caller keeps
 * that state; this only answers for beats that say.
 */
export function ringAt(beat: Beat, t: number, claimKm: number): number | null {
  if (!beat.ring) return null;
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return (beat.ring.from + (beat.ring.to - beat.ring.from) * u) * claimKm;
}

export function resolvePose(beat: Beat, fits: ViewFits): CameraPose {
  const fit = fits[beat.view];
  return {
    view: beat.view,
    zoom: fit.zoom * (beat.pose?.zoom ?? 1),
    target: beat.pose?.target ?? fit.target,
  };
}

/** True once the terminal beat has fully played: the stem is over and the bowl is open. */
export function releasedAt(score: Score, at: BeatPosition): boolean {
  const last = score.beats.length - 1;
  return at.index === last && at.t >= 1 && !!score.beats[last]?.terminal;
}

/**
 * Problems with a score. Empty means valid. Run at build time on committed scores, so a
 * beat in a view its chapter cannot show is a failed test rather than a blank screen.
 */
export function validateScore(score: Score): string[] {
  const errors: string[] = [];
  const where = `score "${score.chapter}"`;
  if (score.beats.length === 0) {
    errors.push(`${where}: has no beats — a chapter with an empty stem is not a chapter`);
    return errors;
  }

  const views = CHAPTER_VIEWS[score.chapter];
  const seen = new Set<string>();
  for (const [i, b] of score.beats.entries()) {
    if (seen.has(b.id)) errors.push(`${where}: beat "${b.id}" appears twice`);
    seen.add(b.id);
    if (!views.includes(b.view)) {
      errors.push(
        `${where}: beat "${b.id}" is in view "${b.view}", which the ${score.chapter} chapter ` +
          `does not use — one of ${views.join(', ')}`,
      );
    }
    const zoom = b.pose?.zoom;
    if (zoom !== undefined && !(zoom > 0)) {
      errors.push(`${where}: beat "${b.id}" has zoom ${zoom} — it is a multiple of the fit and must be positive`);
    }
    if (b.terminal && i !== score.beats.length - 1) {
      errors.push(`${where}: beat "${b.id}" is terminal but not last — the release ends the stem`);
    }
    if (b.mapPose && b.view !== 'circle') {
      errors.push(`${where}: beat "${b.id}" has a map pose but is in view "${b.view}" — only the circle is a map`);
    }
    if (b.mapPose?.pitch !== undefined && !(b.mapPose.pitch >= 0 && b.mapPose.pitch <= 85)) {
      errors.push(`${where}: beat "${b.id}" has pitch ${b.mapPose.pitch} — MapLibre allows 0 to 85`);
    }
    if (b.ring) {
      if (b.view !== 'circle') {
        errors.push(`${where}: beat "${b.id}" has a ring but is in view "${b.view}" — the ring is the circle's`);
      }
      if (!(b.ring.from >= 0) || !(b.ring.to >= 0)) {
        errors.push(`${where}: beat "${b.id}" has a negative ring — it is a multiple of the claim radius`);
      }
    }
  }

  const terminals = score.beats.filter((b) => b.terminal).length;
  if (terminals !== 1) {
    errors.push(
      `${where}: has ${terminals} terminal beats — exactly one, and it is the last. ` +
        `The terminal beat releases the bowl; moving on to the next chapter is a control, never a beat`,
    );
  }
  return errors;
}

/**
 * The join between a score and the copy doc's `[beats]` for that chapter, by id — the
 * same promise `validateCopyJoin` makes for hotspots. A beat with no words and words with
 * no beat are both build errors.
 */
export function joinBeatCopy(score: Score, copyBeats: ReadonlyArray<{ id: string }>): string[] {
  const errors: string[] = [];
  const inScore = new Set(score.beats.map((b) => b.id));
  const inCopy = new Set(copyBeats.map((c) => c.id));
  for (const id of inScore) {
    if (!inCopy.has(id)) errors.push(`${score.chapter}: beat "${id}" has no copy in the doc`);
  }
  for (const id of inCopy) {
    if (!inScore.has(id)) errors.push(`${score.chapter}: copy "${id}" has no beat to land on`);
  }
  return errors;
}
