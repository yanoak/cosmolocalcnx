'use client';

import type { ChapterId } from './views';
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
export function Explore({
  next,
  nextLabel,
  onReread,
  onNext,
}: {
  /** The chapter after this one, or null on the last. */
  next: ChapterId | null;
  nextLabel?: string;
  onReread: () => void;
  onNext: (chapter: ChapterId) => void;
}) {
  return (
    <>
      <button type="button" className="explore-reread" onClick={onReread}>
        Read Introduction Again
      </button>
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
