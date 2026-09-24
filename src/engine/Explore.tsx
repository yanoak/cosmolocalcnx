'use client';

import type { ChapterId, ViewId } from './views';
import './Explore.css';

/**
 * The bowl's chrome: what appears once the visitor has pressed their way out of the stem.
 *
 * Two controls, and both are CONTROLS — nothing moves a visitor on from the bowl but
 * their own hand. "Read Introduction Again" sits top centre and re-enters the stem at
 * its first beat; "Next" sits bottom right and opens the next chapter. A visitor who
 * wants to stay stays. The way IN to the bowl is the stem's own button, under the last
 * card — see Scrolly.tsx.
 *
 * "Read Introduction Again" is a button, not the "← Story" link it replaced on
 * 24 Sep 2026: a link in the corner read as a breadcrumb, and visitors who had
 * scrolled past the words had no obvious way back to them.
 *
 * Layer toggles belong here too, and arrive with the first chapter that has layers to
 * toggle (the Past's five threads). Until then this is deliberately small.
 */
/** What the view pair says. Short, because the header beside it already names the place. */
const VIEW_WORD: Partial<Record<ViewId, string>> = { city: 'City', valley: 'Valley' };

export function Explore({
  next,
  nextLabel,
  onReread,
  onNext,
  views,
  view,
  onView,
}: {
  /** The chapter after this one, or null on the last. */
  next: ChapterId | null;
  nextLabel?: string;
  onReread: () => void;
  onNext: (chapter: ChapterId) => void;
  /**
   * The views this chapter can show, when there is more than one — Futures, with its
   * city and its valley. The only place a visitor picks a view directly; it is a cut
   * between two mounted views, not a zoom, and `views.ts` keeps its rule.
   */
  views?: readonly ViewId[];
  view?: ViewId;
  onView?: (view: ViewId) => void;
}) {
  const pair = views && views.length > 1 ? views : null;
  return (
    <>
      <button type="button" className="explore-reread" onClick={onReread}>
        Read Introduction Again
      </button>
      {/* The scale toggle, under the chapter rail: a pill, the pressed half filled in the
          invert register like the invitation, since it is the same kind of thing — the one
          control here that changes what you are looking at. Yan, 24 Sep 2026 evening. */}
      {pair && (
        <div className="explore-scale" role="group" aria-label="Scale">
          {pair.map((v) => (
            <button key={v} type="button" aria-pressed={v === view} onClick={() => onView?.(v)}>
              {VIEW_WORD[v] ?? v}
            </button>
          ))}
        </div>
      )}
      <div className="explore" role="group" aria-label="Explore">
        <span className="explore-hint">Drag to pan, pinch or scroll to zoom.</span>
        {next && (
          <button type="button" className="button--invite" onClick={() => onNext(next)}>
            {nextLabel ?? 'Next'} →
          </button>
        )}
      </div>
    </>
  );
}
