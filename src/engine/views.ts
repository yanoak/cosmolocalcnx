/**
 * Three views, not one rail.
 *
 * Replaces the rail half of `registers.ts`, decided 21 Sep 2026. The circle, the valley
 * and the city are three discrete worlds a visitor moves between deliberately; zoom and
 * pan operate INSIDE a view and can never leave it.
 *
 * What the rail was doing wrong: it put a 3,437 km azimuthal-equidistant population
 * raster and an 8 km building diorama on one continuous gesture, which says they are
 * the same kind of thing seen from different distances. They are not — one is a claim
 * about half of humanity, the other is a model of a place. Every special case in
 * `registers.ts` was the cost of pretending otherwise: a crossfade band, a frame
 * transform, a stage scale absorbing 2,500:1, and `RELIEF_HOLD_OUT`, which existed only
 * because zooming out shrank the district onto the circle before the mountains arrived.
 *
 * Most of this change is deletion. Keeping two frames from tearing, guaranteeing no
 * black frame inside the handover, holding the district while the backdrop catches up —
 * none of those are solved differently here. They stop being problems.
 *
 * What does NOT change: `aeqd.ts` and the anchor it pins. Wat Ket is 279.98 km from the
 * circle's centre, 8.15% of the radius. Separating the views changes how a visitor
 * travels between the scales, not what the scales say.
 *
 * See `plans/2026-09-21_three-views.plan.md`.
 */

export type ViewId = 'circle' | 'valley' | 'city';

/**
 * Presentation order, EARLIEST FIRST. Also the rail order and the `1`/`2`/`3` keys.
 *
 * Temporal since 23 Sep 2026. It used to run outermost-first, by scale — which is an
 * author's concern: a visitor has no reason to care that one view is 3,437 km wide and
 * another is eight. Once space was locked to time period the views had an order of their
 * own, and it is this one.
 */
export const VIEW_ORDER: readonly ViewId[] = ['valley', 'circle', 'city'] as const;

/**
 * A view's place name — the subhead under the header, because a tense on its own does not
 * tell a visitor what they are about to look at. The tense itself belongs to the CHAPTER,
 * below: a view can appear in more than one.
 *
 * Deliberately not localised here. The bilingual pass owns all viewer copy at once.
 */
export const VIEW_PLACE: Record<ViewId, string> = {
  valley: 'The valley',
  circle: 'The circle',
  city: 'Wat Ket',
};

/**
 * Which views a scene actually has.
 *
 * The city is always present — it is the scene. The other two depend on committed
 * fields, and absent is a valid state rather than a broken one: a second neighbourhood
 * has a city view and nothing else until someone runs the generators. A view with
 * nothing in it must be unreachable rather than empty.
 */
// ----------------------------------------------------------------- chapters

/**
 * Scale and tense are different axes. Decided 24 Sep 2026.
 *
 * Valley and city are VIEWS — scales, kinds of rendering. Past, present and futures are
 * CHAPTERS — tenses, the piece's argument. Until today they were one-to-one and the code
 * keyed the rail, the number keys and the tense labels on views. Then the Futures material
 * turned out to be mostly regional, so Futures uses the valley AND the city, and the valley
 * appears in two chapters with two different overlays.
 *
 * That is not a violation of "a view owns a tense": a view is a timeless substrate plus a
 * period-bearing overlay, and geology has no tense. What it does mean is that the valley
 * alone cannot tell you which chapter you are in — so the caller passes the chapter, and
 * nothing here infers one from a view or from a zoom.
 */
export type ChapterId = 'past' | 'present' | 'futures';

/** Temporal, and also the rail order and the `1`/`2`/`3` keys. */
export const CHAPTER_ORDER: readonly ChapterId[] = ['past', 'present', 'futures'] as const;

/**
 * Which views a chapter uses, opening view first. Futures opens in the CITY — Yan's call,
 * 24 Sep 2026 — on the district the newspaper's world grows out of: the stem walks the
 * four places there and then cuts to the valley for the close, with the regional pins.
 * The stem crosses a view partway, which is legitimate because the beat NAMES the view;
 * nothing derives one from a zoom. The city is always the scene, which is why Futures
 * survives a scene with no valley field: it simply never leaves the city.
 */
export const CHAPTER_VIEWS: Record<ChapterId, readonly ViewId[]> = {
  past: ['valley'],
  present: ['circle'],
  futures: ['city', 'valley'],
};

/**
 * What the rail says. Three words in temporal order are what make the order legible at a
 * glance. Plural on Futures, and it is load-bearing: the piece asks what the place could be,
 * and a singular "Future" reads as a prediction.
 *
 * Not localised here; the bilingual pass owns all viewer copy at once.
 */
export const CHAPTER_TENSE: Record<ChapterId, string> = {
  past: 'Past',
  present: 'Present',
  futures: 'Futures',
};

/** The chapters a view appears in. Two for the valley — which is the whole point. */
export function chaptersOf(view: ViewId): ChapterId[] {
  return CHAPTER_ORDER.filter((c) => CHAPTER_VIEWS[c].includes(view));
}

/**
 * The view a chapter opens on: its first, or — given what the scene has — the first of
 * its views that exists. Futures on a scene with no valley field opens in the city.
 */
export function defaultView(chapter: ChapterId, has?: ViewAvailability): ViewId {
  const views = CHAPTER_VIEWS[chapter];
  if (!has) return views[0];
  return views.find((v) => isAvailable(v, has)) ?? views[0];
}

export interface ViewAvailability {
  circle: boolean;
  valley: boolean;
}

export function availableViews({ circle, valley }: ViewAvailability): ViewId[] {
  return VIEW_ORDER.filter((id) => (id === 'circle' ? circle : id === 'valley' ? valley : true));
}

export function isAvailable(id: ViewId, has: ViewAvailability): boolean {
  return availableViews(has).includes(id);
}

/**
 * How far a view can be zoomed, as multiples of its own fit.
 *
 * Each view fits its subject at 1. The ranges are deliberately generous outward and
 * tight inward for the two context views, and the reverse for the city — that is the
 * difference between something you look AT and something you look INTO.
 *
 * The city's 40 is `DEFAULT_BLOCK_IN`, carried over unchanged: it is the district-to-
 * doorstep ratio the piece has been built around since 16 Sep, and `registers.ts` pinned
 * it with tests.
 */
/** The district-to-doorstep ratio the piece has been built around since 16 Sep. */
export const BLOCK_IN = 40;

export const VIEW_RANGE: Record<ViewId, { out: number; in: number }> = {
  // Out to the committed 12,000 km world field, in far enough to read a bright patch.
  circle: { out: 0.35, in: 4 },
  // The basin fills the frame; in far enough to pick a town off the flank of a ridge.
  valley: { out: 0.9, in: 8 },
  // Out for a little air around the district, in to one doorstep.
  city: { out: 0.5, in: BLOCK_IN },
};

export interface ViewSpec {
  id: ViewId;
  /** Orthographic zoom at which this view's subject fits the viewport. */
  fit: number;
  minZoom: number;
  maxZoom: number;
}

export function viewSpec(id: ViewId, fit: number): ViewSpec {
  // A zero-sized viewport is a real state during layout, and a fit of 0 would make
  // every zoom in this view 0 and the camera degenerate.
  const safeFit = Number.isFinite(fit) && fit > 0 ? fit : 1;
  const range = VIEW_RANGE[id];
  return {
    id,
    fit: safeFit,
    minZoom: safeFit * range.out,
    maxZoom: safeFit * range.in,
  };
}

/**
 * Zoom, held inside the view.
 *
 * This is the whole mechanism of "no continuum": there is no zoom in any view that
 * selects another view. Reaching the end of a view's range stops the camera, and the
 * only way out is the switcher.
 */
export function clampZoom(spec: ViewSpec, zoom: number): number {
  if (!Number.isFinite(zoom)) return spec.fit;
  return Math.min(spec.maxZoom, Math.max(spec.minZoom, zoom));
}

/**
 * How far into a view the camera is, 0 at the way out and 1 at the way in.
 *
 * Logarithmic, because zoom is multiplicative — the same reason `zoomToT` was, and the
 * reason a linear map would spend almost the whole range in the last doubling.
 *
 * In the city view this drives hero emphasis through `stockTint`, which is the one
 * thing the old `RegisterState.detail` was for.
 */
export function detailWithin(spec: ViewSpec, zoom: number): number {
  const z = clampZoom(spec, zoom);
  const span = Math.log(spec.maxZoom / spec.minZoom);
  if (!(span > 0)) return 0;
  return Math.log(z / spec.minZoom) / span;
}

/**
 * The next view in a direction, or null at the ends.
 *
 * Returns null rather than wrapping. Wrapping would put the circle one step in from a
 * doorstep, which is exactly the adjacency this change exists to remove.
 */
export function stepView(
  current: ViewId,
  direction: 1 | -1,
  has: ViewAvailability,
): ViewId | null {
  const views = availableViews(has);
  const at = views.indexOf(current);
  if (at === -1) return views[0] ?? null;
  return views[at + direction] ?? null;
}

/**
 * Where a visitor lands when a view they were in stops existing, or was never there.
 *
 * Always the city: it is the only view guaranteed to have something in it, and it is
 * what the piece is about.
 */
/**
 * A chapter is available when ANY of its views is. Past needs the valley field, Present
 * the region field, and Futures has the city, which is always there — so a second
 * neighbourhood with nothing generated yet still has a Futures chapter, opening in the
 * city because `defaultView` skips the valley it lacks.
 */
export function availableChapters(has: ViewAvailability): ChapterId[] {
  return CHAPTER_ORDER.filter((c) => CHAPTER_VIEWS[c].some((v) => isAvailable(v, has)));
}

/** The wanted chapter if it is available, else the first that is. Never an empty result. */
export function resolveChapter(wanted: ChapterId | null, has: ViewAvailability): ChapterId {
  const open = availableChapters(has);
  return wanted && open.includes(wanted) ? wanted : open[0];
}

export function resolveView(wanted: ViewId | null, has: ViewAvailability): ViewId {
  return wanted && isAvailable(wanted, has) ? wanted : 'city';
}
