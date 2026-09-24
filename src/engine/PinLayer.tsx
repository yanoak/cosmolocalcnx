'use client';

import { Html } from '@react-three/drei';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { renderCopy } from './copy';
import type { Point2 } from './extrude';
import { ICON_SIZE, iconFor } from './icons';
import { fitPopup, placeInFrame, type Placement, type PopupFit } from './pins';
import type { Hotspot } from './scene';
import './PinLayer.css';

/**
 * The landscape of pins: one oversized isometric icon per place, standing on the map.
 * `pins.ts` decides what and where; this draws it. (Named for the layer rather than
 * `Pins` because a case-insensitive disk cannot hold `Pins.tsx` beside `pins.ts`.)
 *
 * A pin is a DOM button over the canvas, not a sprite in it — the same drei `Html` the
 * valley's town labels use, carrying an `<img>` of the sprite on its measured ground
 * anchor and the place name as the button's text. That makes it constant screen size at
 * every zoom, which is what a landmark map's icons are; gives it a tap target, an
 * accessible name and keyboard reach for free; and keeps the artwork out of WebGL. The
 * cost is that a pin draws over geometry rather than behind it, which is the convention
 * for a marker and correct for a landmark. See plans/2026-09-23_futures-chapter.plan.md.
 *
 * The popup is part of the pin. It opens above the icon inside the same projected node,
 * so it moves with the pin and needs no screen-space maths of its own. One open at a
 * time — the caller holds which — and since 24 Sep 2026 it IS the story, at standfirst
 * length: the Faiways headline, a couple of paragraphs, and the line that sends the
 * reader to the paper on the table. The full article stays in print.
 *
 * Words come from the copy doc by id, as the cards' do; a pin with no copy shows its id,
 * which the join test makes impossible in a committed build.
 */
export interface PinCopy {
  id: string;
  label?: string;
  /** The small line above the name — a year, in the Futures. */
  kicker?: string;
  blurb?: string;
  body?: string;
  /** The Faiways piece this place appears in, by headline. */
  story?: string;
}

/** The long edge of a pin on screen, in CSS pixels. Sprites are 1024, so retina is covered. */
export const PIN_PX = 88;

const NO_FRAME = Number.POSITIVE_INFINITY;

export function PinLayer({
  pins,
  copy,
  heightAt,
  halfFrameM = NO_FRAME,
  openId,
  onOpen,
  interactive,
  sizePx = PIN_PX,
}: {
  pins: readonly Hotspot[];
  copy: ReadonlyMap<string, PinCopy>;
  /** The surface height at a ground point — the valley's sampled terrain, the city's zero. */
  heightAt: (at: Point2) => number;
  /** Half the square frame's width in metres; a pin beyond it is drawn clamped to the edge. */
  halfFrameM?: number;
  /** The pin whose popup is open, or null. */
  openId: string | null;
  onOpen: (id: string | null) => void;
  /** False during the stem: the pins are scenery there, not controls. */
  interactive: boolean;
  /** The long edge of a pin on screen. The valley draws its eight a little smaller. */
  sizePx?: number;
}) {
  return (
    <>
      {pins.map((h) => {
        if (!h.at) return null;
        const placement = placeInFrame(h.at, halfFrameM);
        return (
          <Pin
            key={h.id}
            hotspot={h}
            placement={placement}
            copy={copy.get(h.id)}
            y={heightAt(placement.at)}
            open={openId === h.id}
            onOpen={onOpen}
            interactive={interactive}
            sizePx={sizePx}
          />
        );
      })}
    </>
  );
}

/** The open pin sits above every other, whatever its depth. */
const TOP: [number, number] = [16777272, 16777272];

function Pin({
  hotspot,
  placement,
  copy,
  y,
  open,
  onOpen,
  interactive,
  sizePx,
}: {
  hotspot: Hotspot;
  placement: Placement;
  copy: PinCopy | undefined;
  y: number;
  open: boolean;
  onOpen: (id: string | null) => void;
  interactive: boolean;
  sizePx: number;
}) {
  const sprite = iconFor(hotspot.icon);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const [fit, setFit] = useState<PopupFit>({ dx: 0, below: false });

  // Where the card goes: above by default, under the icon when there is no room above,
  // slid in from either side. Measured once per opening, against the stage the overlay
  // lives in, then applied as a transform so the projected position is untouched.
  useLayoutEffect(() => {
    if (!open) return;
    const card = popup.current;
    const stage = card?.closest('.diorama') ?? card?.offsetParent;
    if (!card || !stage) return;
    setFit({ dx: 0, below: false });
    const c = card.getBoundingClientRect();
    const st = stage.getBoundingClientRect();
    const iconBottom = button.current?.getBoundingClientRect().bottom ?? c.bottom;
    setFit(fitPopup(c, st, st.top + st.height - iconBottom));
  }, [open]);

  // Focus follows the popup in and comes back to the pin on the way out, so a keyboard
  // visitor never loses their place on the landscape.
  useEffect(() => {
    if (open) heading.current?.focus();
    else if (wasOpen.current) button.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const name = copy?.label ?? hotspot.id;
  // A clamped pin says how far away the place really is: the pin is a signpost there.
  const label = placement.clamped
    ? `${name} · ${placement.distanceKm} km ${placement.compass}`
    : name;
  const scale = sizePx / ICON_SIZE;

  return (
    <Html
      position={[placement.at[0], y, -placement.at[1]]}
      zIndexRange={open ? TOP : undefined}
      style={{ pointerEvents: 'none' }}
    >
      <div ref={wrapper} className={interactive ? 'pin' : 'pin is-static'}>
        <button
          ref={button}
          type="button"
          className="pin-button"
          aria-expanded={open}
          tabIndex={interactive ? 0 : -1}
          onClick={() => onOpen(open ? null : hotspot.id)}
        >
          {sprite ? (
            <img
              className="pin-icon"
              src={sprite.file}
              alt=""
              width={Math.round(sprite.width * scale)}
              height={Math.round(sprite.height * scale)}
              draggable={false}
            />
          ) : (
            <span className="pin-node" aria-hidden="true" />
          )}
          <span className="pin-label">{label}</span>
        </button>

        {open && (
          <div
            ref={popup}
            className={fit.below ? 'pin-popup is-below' : 'pin-popup'}
            style={{ transform: `translateX(calc(-50% + ${fit.dx}px))` }}
            role="dialog"
            aria-labelledby={`pin-${hotspot.id}`}
          >
            {/* The tail, pointing at the icon; it stays under the icon when the card slides. */}
            <span className="pin-tail" style={{ left: `calc(50% - ${fit.dx}px)` }} aria-hidden="true" />
            <button type="button" className="pin-close" aria-label="Close" onClick={() => onOpen(null)}>
              ×
            </button>
            {copy?.kicker && <p className="kicker">{copy.kicker}</p>}
            <h3 id={`pin-${hotspot.id}`} ref={heading} tabIndex={-1} className="headline pin-headline">
              {name}
            </h3>
            {copy?.blurb && <p className="body pin-blurb">{copy.blurb}</p>}
            {copy?.body &&
              renderCopy(copy.body).map((para, j) => (
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
            {copy?.story && (
              <p className="body body--muted footnote">
                In <em>Faiways</em>: “{copy.story}”. The full piece is in the paper on the table.
              </p>
            )}
          </div>
        )}
      </div>
    </Html>
  );
}
