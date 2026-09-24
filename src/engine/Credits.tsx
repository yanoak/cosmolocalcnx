'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import './Credits.css';

/**
 * The data credits, behind an `i` in the stage's corner.
 *
 * Seven of the nine licences require the attribution to be VISIBLE, and until 24 Sep
 * 2026 it was — as three lines of small type under the stage, on a projector. Visible
 * does not mean permanent: a control that opens the full text on tap satisfies every
 * one of them, and it gives the stage back its bottom edge.
 *
 * A native `<details>` rather than state: open, close, `Enter` and `Space` come free,
 * and it renders open-able in the static HTML before any script runs. The one thing
 * added is `Escape`, which closes it and puts focus back on the button — the same
 * contract every other panel in the piece keeps.
 */
export function Credits({ children }: { children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || !details.current?.open) return;
    details.current.open = false;
    summary.current?.focus();
    e.stopPropagation();
  }, []);

  return (
    <details ref={details} className="credits" onKeyDown={onKeyDown}>
      <summary ref={summary} className="credits-toggle" aria-label="Data sources and credits">
        <span aria-hidden="true">i</span>
      </summary>
      <div className="credits-panel">{children}</div>
    </details>
  );
}
