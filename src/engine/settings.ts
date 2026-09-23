/**
 * What one machine is configured to do.
 *
 * Not part of the scene document, and the distinction is the point: the document
 * describes Wat Ket, and what a laptop in a mall in Chiang Mai is set to show is not a
 * property of Wat Ket. See docs/architecture.md, "the scene is a document".
 *
 * `output: 'export'` means there is no server, so this lives in `localStorage` — which
 * is a genuine fit rather than a fallback. Settings are PER MACHINE, and per machine is
 * exactly what an installation wants: the exhibition laptop keeps its configuration
 * across restarts, and a visitor's phone has nothing stored and gets the defaults.
 *
 * ### Precedence: URL parameter > stored setting > default
 *
 * A parameter is an explicit one-off instruction and has to beat a remembered one, or a
 * QR code aimed at the valley would be silently overridden by however the machine was
 * last left. `?view=` exists so a code can land somebody somewhere specific, and that
 * capability is older than this file.
 *
 * Everything here is pure except the two storage wrappers at the bottom, which is the
 * arrangement that makes the precedence rules testable without a DOM.
 */

import type { LodMode } from './lod';
import { LOD_MODES } from './lod';
import { VALLEY_STYLES, type ValleyStyle } from './valley';
import { VIEW_ORDER, type ViewId } from './views';

export const SETTINGS_KEY = 'cosmolocalcnx.settings';

export interface Settings {
  /**
   * Which view to open on, or `null` to run the on-ramp.
   *
   * `null` is a real value and not "unset": the piece opening on the circle and handing
   * over to Wat Ket is the default behaviour, and choosing a view deliberately turns it
   * off. Collapsing the two would make "run the on-ramp" unselectable once anything had
   * ever been stored.
   */
  view: ViewId | null;
  relief: ValleyStyle;
  lod: LodMode;
  locale: string;
}

export const DEFAULT_SETTINGS: Settings = {
  view: null,
  relief: 'hillshade',
  lod: 'near',
  locale: 'en',
};

/** Locales the viewer has copy for. A stored value outside this is not honoured. */
const LOCALES = ['en', 'th'];

function asView(value: unknown): ViewId | null {
  return typeof value === 'string' && (VIEW_ORDER as readonly string[]).includes(value)
    ? (value as ViewId)
    : null;
}

function asRelief(value: unknown): ValleyStyle | null {
  return typeof value === 'string' && (VALLEY_STYLES as readonly string[]).includes(value)
    ? (value as ValleyStyle)
    : null;
}

function asLod(value: unknown): LodMode | null {
  return typeof value === 'string' && (LOD_MODES as readonly string[]).includes(value)
    ? (value as LodMode)
    : null;
}

function asLocale(value: unknown): string | null {
  return typeof value === 'string' && LOCALES.includes(value) ? value : null;
}

/**
 * A stored blob to settings, tolerantly.
 *
 * Every field is re-validated rather than trusted. What comes back from storage was
 * written by some earlier build of this app, and a view id that has since been renamed
 * must fall back to a default rather than put the viewer in a state it cannot render.
 * Anything unreadable gives defaults — a bad settings blob must never blank the piece.
 */
export function parseSettings(raw: string | null | undefined): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS };

  const stored = value as Record<string, unknown>;
  return {
    // `view` is the one field whose default IS null, so an unknown value and an absent
    // one land in the same place, which is correct: run the on-ramp.
    view: asView(stored.view),
    relief: asRelief(stored.relief) ?? DEFAULT_SETTINGS.relief,
    lod: asLod(stored.lod) ?? DEFAULT_SETTINGS.lod,
    locale: asLocale(stored.locale) ?? DEFAULT_SETTINGS.locale,
  };
}

export function serialiseSettings(settings: Settings): string {
  return JSON.stringify(settings);
}

/**
 * Stored settings overridden by whatever the URL asked for.
 *
 * An ABSENT parameter must leave the stored value alone rather than reset it to a
 * default — otherwise visiting `/` at all would wipe the machine's configuration, which
 * is the one bug that would make this feature worse than the parameters it replaces.
 */
export function resolveSettings(stored: Settings, params: URLSearchParams): Settings {
  const view = asView(params.get('view'));
  const relief = asRelief(params.get('relief'));
  const lod = asLod(params.get('lod'));
  const locale = asLocale(params.get('locale'));

  return {
    view: params.has('view') ? view : stored.view,
    relief: relief ?? stored.relief,
    lod: lod ?? stored.lod,
    locale: locale ?? stored.locale,
  };
}

// ------------------------------------------------------------------- storage

/**
 * Read, never throwing.
 *
 * `localStorage` throws outright in some private-browsing modes and when a site's data
 * is blocked, and this runs on visitors' own phones with whatever settings they keep.
 * A machine that cannot remember anything still has to show the piece.
 */
export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined): Settings {
  try {
    return parseSettings(storage?.getItem(SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Write, never throwing. Returns whether it actually stuck. */
export function saveSettings(
  storage: Pick<Storage, 'setItem'> | undefined,
  settings: Settings,
): boolean {
  try {
    storage?.setItem(SETTINGS_KEY, serialiseSettings(settings));
    return storage !== undefined;
  } catch {
    return false;
  }
}

export function clearSettings(storage: Pick<Storage, 'removeItem'> | undefined): void {
  try {
    storage?.removeItem(SETTINGS_KEY);
  } catch {
    // Nothing to do, and nothing worth failing for.
  }
}

/** `localStorage`, or undefined where it cannot be reached. */
export function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
