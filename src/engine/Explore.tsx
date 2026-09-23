'use client';

import type { ChapterId } from './views';
import './Explore.css';

/**
 * The bowl's chrome: what appears once the stem has released the visitor.
 *
 * Two controls, and both are CONTROLS — the terminal beat releases into explore, and
 * nothing moves a visitor on from there but their own hand. "Story" re-enters the stem
 * at its last beat; "Next" opens the next chapter. A visitor who wants to stay stays.
 *
 * Layer toggles belong here too, and arrive with the first chapter that has layers to
 * toggle (the Past's five threads). Until then this is deliberately small.
 */
export function Explore({
  next,
  nextLabel,
  onStory,
  onNext,
}: {
  /** The chapter after this one, or null on the last. */
  next: ChapterId | null;
  nextLabel?: string;
  onStory: () => void;
  onNext: (chapter: ChapterId) => void;
}) {
  return (
    <div className="explore" role="group" aria-label="Explore">
      <button type="button" onClick={onStory}>
        ← Story
      </button>
      <span className="explore-hint">Drag to pan, pinch or scroll to zoom.</span>
      {next && (
        <button type="button" className="explore-next" onClick={() => onNext(next)}>
          {nextLabel ?? 'Next'} →
        </button>
      )}
    </div>
  );
}
