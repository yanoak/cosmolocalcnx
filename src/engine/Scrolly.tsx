'use client';

import type { Beat } from './chapters';
import { renderCopy } from './copy';
import './Scrolly.css';

/**
 * The stem's cards: one section per beat, a card centred in each, scrolling over the
 * full-bleed scene. This is the Pudding pattern — the card floats over the
 * visualisation rather than sitting in a column beside it, which is also the only
 * layout that works at every aspect ratio the three delivery surfaces have.
 *
 * It renders; it does not scroll. The page owns the scroll container and turns
 * scroll progress into a beat position (`beatAt`), because the page is what has to
 * hand that position to the camera, the layers and the hotspots at once.
 *
 * The stem ends on a button, not a threshold. Since 24 Sep 2026 the terminal beat's
 * card carries an invitation under it — "Explore the Past" — and nothing opens the
 * bowl but pressing it. Scrolling to the end used to release automatically, which made
 * the last card impossible to read without falling through it; a visitor who reaches
 * the bottom now stays on the last words until they choose to move.
 *
 * Copy comes from the doc by beat id — kicker, headline, body — already fetched into
 * copy.json. A beat with no copy renders an empty card rather than crashing; the
 * scores test makes that state impossible in a committed build.
 */
export interface BeatCopy {
  id: string;
  kicker?: string;
  headline?: string;
  body?: string;
  /**
   * A quieter line under the body — the method behind a number, a source, a caveat.
   * Added 24 Sep 2026 with the revised copy, whose Present chapter keeps the
   * population bracket here rather than in the headline.
   */
  footnote?: string;
}

export function Scrolly({
  beats,
  copy,
  current,
  exploreLabel,
  onExplore,
}: {
  beats: readonly Beat[];
  copy: readonly BeatCopy[];
  /** The beat the scroll is currently in — its card is lit, the rest recede. */
  current: number;
  /** The invitation under the terminal card, e.g. "Explore the Past". */
  exploreLabel: string;
  /** Pressed: the stem is over and the bowl opens. */
  onExplore: () => void;
}) {
  const byId = new Map(copy.map((c) => [c.id, c]));
  const last = beats.length - 1;
  return (
    <div className="scrolly-track" aria-label="Story">
      {/* The prompt to keep going, until the last card — which has its own button. */}
      <div className={current < last ? 'scrolly-more' : 'scrolly-more is-done'} aria-hidden="true">
        <span>Scroll</span>
        {/* A drawn chevron rather than a glyph: the glyph sat on the baseline, below the word. */}
        <svg className="scrolly-more-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2 4.5 L6 8.5 L10 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {beats.map((b, i) => {
        const c = byId.get(b.id);
        return (
          <section
            key={b.id}
            className={i === current ? 'scrolly-section is-current' : 'scrolly-section'}
            data-beat={b.id}
          >
            <article className="scrolly-card">
              {c?.kicker && <p className="kicker">{c.kicker}</p>}
              {c?.headline && <h2 className="headline">{c.headline}</h2>}
              {c?.body &&
                renderCopy(c.body).map((para, j) => (
                  <p className="body" key={j}>
                    {para.map((run, k) =>
                      run.href ? (
                        <a key={k} href={run.href} target="_blank" rel="noopener noreferrer">
                          {run.text}
                        </a>
                      ) : (
                        <span key={k}>{run.text}</span>
                      ),
                    )}
                  </p>
                ))}
              {c?.footnote && <p className="body body--muted footnote">{c.footnote}</p>}
            </article>
            {b.terminal && (
              <button type="button" className="button--invite scrolly-explore" onClick={onExplore}>
                {exploreLabel} →
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
