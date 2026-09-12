'use client';

import { useEffect, useRef } from 'react';
import { pickLocale, type LocaleMap } from './locale';

export interface Selection {
  id: string;
  kind: string;
  height: number;
  label?: LocaleMap;
}

/**
 * The detail panel. Bottom sheet on a phone, side panel on a laptop or projection —
 * covering the diorama matters more on a projection than on a phone.
 *
 * Focus moves to the heading on open and returns to the diorama on close, which is
 * what makes the keyboard path testable by an agent.
 */
export function SelectPanel({
  selection,
  locale,
  onClose,
}: {
  selection: Selection | null;
  locale: string;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (selection) heading.current?.focus();
  }, [selection]);

  if (!selection) return null;

  const title = selection.label
    ? pickLocale(selection.label, locale)
    : selection.id;

  return (
    <aside className="panel" aria-live="polite">
      <div className="panel-head">
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <dl>
        <dt>Kind</dt>
        <dd>{selection.kind}</dd>
        <dt>Height</dt>
        <dd>{selection.height.toFixed(1)} m</dd>
        <dt>Id</dt>
        <dd className="mono">{selection.id}</dd>
      </dl>
    </aside>
  );
}
