import { VIEW_PLACE, VIEW_TENSE, type ViewId } from './views';
import './ViewHeader.css';

/**
 * The header, in the panels' own hierarchy: a line, and a quieter line under it.
 *
 * Every view is named twice. The tense is the header because that is the piece's
 * argument — three views, three periods, locked to each other. The place is the subhead
 * because "Past" on its own does not tell a visitor what they are about to look at.
 *
 * The rail carries the tense alone, so the header is where the two names meet. A
 * visitor reading the rail and the header together gets the mapping for free and never
 * has to be told it.
 *
 * Both lines live inside the `h1`. A screen reader then announces "Past, The valley" as
 * one heading, which is the whole name — splitting them would leave the document with a
 * heading that says only "Past".
 */
export function ViewHeader({ view }: { view: ViewId }) {
  return (
    <h1 className="view-header">
      <span className="view-header-tense">{VIEW_TENSE[view]}</span>
      <span className="view-header-place">{VIEW_PLACE[view]}</span>
    </h1>
  );
}
