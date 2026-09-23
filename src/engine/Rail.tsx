'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import './Rail.css';

/**
 * The conduit with beaded ring nodes, off page 22 of the exhibition panels.
 *
 * It is drawn there as a vertical pipe with a ring node beside each section heading —
 * a chapter rail, in print, by the same designer. Since 24 Sep 2026 it is keyed on
 * chapters — past, present, futures — and is generic over the stop id so the same
 * component can carry beats inside a chapter later.
 *
 * **It does not yet do what the print does.** The printed rail marks sections WITHIN one
 * panel; this marks whole chapters. When beats land, a visitor needs both levels at once
 * — three chapter stops, and N beat stops inside whichever is open — which is a nested
 * rail, not a data change. The plan originally claimed the upgrade would be free. It will
 * not be.
 *
 * Horizontal only, also deliberately. The mockup in the plan has a vertical variant for
 * wide viewports, but the control lives in the topbar, and standing it upright means
 * moving it out to a side gutter. That is a layout decision worth making WITH chapters,
 * when the rail stops being a switcher and becomes a progress indicator.
 *
 * Selection does not follow focus. Arrowing moves the ring, `Enter` or `Space` commits —
 * which is not how a radio group behaves, and is why this is a group of buttons instead.
 * A view builds on first visit and is kept, so arrowing across the valley on the way to
 * the city would build a valley nobody asked to see.
 *
 * See plans/2026-09-23_kv-design-system.plan.md.
 */

/**
 * Generic over the stop id. It was keyed on ViewId until 24 Sep 2026; it is keyed on
 * ChapterId now, and when chapters gain beats it will be keyed on those too. The rail does
 * not know what a stop IS — only that there is an ordered list of them and one is current.
 */
export interface RailProps<T extends string> {
  /** In presentation order. Absent stops are already filtered out by the caller. */
  stops: readonly T[];
  current: T;
  labels: Record<T, string>;
  onSelect: (id: T) => void;
  /** 1-based, for `aria-keyshortcuts`. Keeps the rail honest about the number keys. */
  shortcutFor?: (id: T) => number;
  /** Accessible name for the group — "Chapter", "Beat". */
  label?: string;
}

export function Rail<T extends string>({
  stops: views,
  current,
  labels,
  onSelect,
  shortcutFor,
  label = 'Chapter',
}: RailProps<T>) {
  const [focused, setFocused] = useState<T>(current);
  const refs = useRef(new Map<T, HTMLButtonElement>());

  // The ring follows the view when it changes from anywhere else — a number key, a deep
  // link, a future chapter handover. Without this the rail can point at a view that is
  // no longer open.
  useEffect(() => setFocused(current), [current]);

  const move = useCallback(
    (to: number) => {
      const next = views[Math.max(0, Math.min(views.length - 1, to))];
      if (!next) return;
      setFocused(next);
      refs.current.get(next)?.focus();
    },
    [views],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const i = views.indexOf(focused);
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          move(i + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          move(i - 1);
          break;
        case 'Home':
          move(0);
          break;
        case 'End':
          move(views.length - 1);
          break;
        default:
          return;
      }
      // Only swallow the keys actually handled: the stage below reads arrows too.
      e.preventDefault();
      e.stopPropagation();
    },
    [focused, move, views],
  );

  return (
    <div className="rail" role="group" aria-label={label} onKeyDown={onKeyDown}>
      {views.map((id, i) => (
        <span className="rail-stop" key={id}>
          {i > 0 && <span className="rail-conduit" aria-hidden="true" />}
          <button
            type="button"
            className="rail-node"
            ref={(el) => {
              if (el) refs.current.set(id, el);
              else refs.current.delete(id);
            }}
            /* One tab stop for the whole rail: Tab enters at the current view and Tab
               again leaves, rather than walking every node. */
            tabIndex={id === focused ? 0 : -1}
            aria-pressed={id === current}
            aria-keyshortcuts={shortcutFor ? String(shortcutFor(id)) : undefined}
            onClick={() => onSelect(id)}
            onFocus={() => setFocused(id)}
          >
            <span className="rail-ring" aria-hidden="true" />
            <span className="rail-label">{labels[id]}</span>
          </button>
        </span>
      ))}
    </div>
  );
}
