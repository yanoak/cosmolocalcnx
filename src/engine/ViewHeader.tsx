import { CHAPTER_TENSE, VIEW_PLACE, type ChapterId, type ViewId } from './views';
import './ViewHeader.css';

/**
 * The header, in the panels' own hierarchy: a kicker, and the headline under it.
 *
 * Every view is named twice. The tense is the kicker because that is the piece's
 * argument — three views, three periods, locked to each other — and a kicker is what
 * the panels use to say which section you are in. The place is the headline because
 * "Past" on its own does not tell a visitor what they are about to look at. Since
 * 24 Sep 2026 this is p22's own stack: orange line, semibold charcoal line under it.
 *
 * The rail carries the tense alone, so the header is where the two names meet. A
 * visitor reading the rail and the header together gets the mapping for free and never
 * has to be told it.
 *
 * Both lines live inside the `h1`. A screen reader then announces "Past, The valley" as
 * one heading, which is the whole name — splitting them would leave the document with a
 * heading that says only "Past".
 */
export function ViewHeader({ chapter, view }: { chapter: ChapterId; view: ViewId }) {
  return (
    <h1 className="view-header">
      <span className="view-header-tense">{CHAPTER_TENSE[chapter]}</span>
      <span className="view-header-place">{VIEW_PLACE[view]}</span>
    </h1>
  );
}
