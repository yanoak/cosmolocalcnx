'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  browserStorage,
  clearSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from '@/engine/settings';
import './settings.css';

/**
 * How one machine is configured. Not how the piece works.
 *
 * Settings live in `localStorage`, so this configures the BROWSER it is opened in —
 * which is the right granularity for an installation: the exhibition laptop keeps its
 * setup across restarts, the projector keeps its own, and a visitor's phone has nothing
 * stored and gets the defaults. There is no server to put them anywhere else.
 *
 * Deliberately not linked from the viewer's control row. Those controls are the three
 * views and the language, and they are about Wat Ket; a rendering-quality switch beside
 * them would be the first control in the piece that is about the software. This is
 * reached by typing the address, or from the debug overlay.
 *
 * See plans/2026-09-23_settings.plan.md.
 */

const VIEW_CHOICES = [
  { value: '', label: "The piece's default", hint: 'Whatever the piece opens on. The default.' },
  { value: 'valley', label: 'The valley', hint: 'Open on the basin. The past.' },
  { value: 'circle', label: 'The circle', hint: 'Open on the Valeriepieris claim. The present.' },
  { value: 'city', label: 'Wat Ket', hint: 'Open on the diorama. 2045.' },
] as const;

const RELIEF_CHOICES = [
  { value: 'hillshade', label: 'Hillshade', hint: 'A plaster relief model. The default.' },
  { value: 'gradient', label: 'Gradient', hint: 'Hypsometric tint by height.' },
  { value: 'terraced', label: 'Terraced', hint: 'Stepped contours.' },
] as const;

const LOD_CHOICES = [
  {
    value: 'near',
    label: 'Backdrop raster beyond 1,250 m',
    hint: 'The default, and what every phone should use. 7,588 buildings as geometry and a pre-rendered image for the other 61,116.',
  },
  {
    value: 'full',
    label: 'Every building as geometry',
    hint: 'All 68,704. Crisp at any zoom — but a 19 MB download, about a million triangles, and roughly six seconds of frozen screen while it loads. For the laptop and the projector. Not for a phone.',
  },
] as const;

const LOCALE_CHOICES = [
  { value: 'en', label: 'English', hint: '' },
  { value: 'th', label: 'ไทย', hint: '' },
] as const;

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  /** Null until the effect has run, so nothing is claimed before storage was read. */
  const [storable, setStorable] = useState<boolean | null>(null);
  const [everStored, setEverStored] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  /**
   * Read in an effect, never during render. The page is prerendered by the static
   * export, so touching storage during render is a hydration mismatch.
   */
  useEffect(() => {
    const storage = browserStorage();
    setSettings(loadSettings(storage));
    setStorable(storage !== undefined);
    try {
      setEverStored(storage?.getItem('cosmolocalcnx.settings') != null);
    } catch {
      setEverStored(false);
    }
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      // Saved on change rather than behind a Save button: there is nothing here that is
      // only valid in combination, so a button would be a step that can be forgotten.
      setStorable(saveSettings(browserStorage(), next));
      setEverStored(true);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    clearSettings(browserStorage());
    setSettings(DEFAULT_SETTINGS);
    setEverStored(false);
    first.current?.focus();
  }, []);

  return (
    <main className="settings">
      <div className="settings-head">
        <h1>Wat Ket 2045 — settings</h1>
        <p className="note">This machine only. Nothing here leaves the browser it is set in.</p>
      </div>

      <form className="settings-form" onSubmit={(e) => e.preventDefault()}>
        <Group
          legend="Opens on"
          name="view"
          choices={VIEW_CHOICES}
          value={settings.view ?? ''}
          onChange={(v) => update({ view: v === '' ? null : (v as Settings['view']) })}
          firstRef={first}
        />

        <Group
          legend="Topography in the valley"
          name="relief"
          choices={RELIEF_CHOICES}
          value={settings.relief}
          onChange={(v) => update({ relief: v as Settings['relief'] })}
        />

        <Group
          legend="Detail"
          name="lod"
          choices={LOD_CHOICES}
          value={settings.lod}
          onChange={(v) => update({ lod: v as Settings['lod'] })}
        />

        <Group
          legend="Language"
          name="locale"
          choices={LOCALE_CHOICES}
          value={settings.locale}
          onChange={(v) => update({ locale: v })}
        />

        <p className="saved" role="status">
          {storable === false
            ? 'This browser will not keep settings — private mode, or site data is blocked. The choices above still apply to this session.'
            : everStored
              ? `Saved on this machine. ${describe(settings)}`
              : 'Nothing stored — using defaults.'}
        </p>

        <div className="settings-actions">
          <Link className="button" href="/">
            Open the viewer
          </Link>
          <button type="button" onClick={reset}>
            Reset to defaults
          </button>
        </div>
      </form>

      <p className="note foot">
        A URL parameter still wins for the load it is on — <code>?view=</code>,{' '}
        <code>?relief=</code>, <code>?lod=</code>, <code>?locale=</code> — so a QR code can
        aim somewhere specific without changing what this machine is set to. In the viewer,{' '}
        <kbd>f</kbd> toggles detail and saves what it toggled to.
      </p>
    </main>
  );
}

function Group<T extends { value: string; label: string; hint: string }>({
  legend,
  name,
  choices,
  value,
  onChange,
  firstRef,
}: {
  legend: string;
  name: string;
  choices: readonly T[];
  value: string;
  onChange: (value: string) => void;
  firstRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      {choices.map((choice, i) => (
        <label className="choice" key={choice.value}>
          <input
            ref={i === 0 ? firstRef : undefined}
            type="radio"
            name={name}
            value={choice.value}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
          />
          <span>
            <strong>{choice.label}</strong>
            {choice.hint && <span className="hint">{choice.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** What is actually stored, in the same words the URL would use. */
function describe(settings: Settings): string {
  const parts: string[] = [];
  if (settings.view) parts.push(`view=${settings.view}`);
  if (settings.relief !== DEFAULT_SETTINGS.relief) parts.push(`relief=${settings.relief}`);
  if (settings.lod !== DEFAULT_SETTINGS.lod) parts.push(`lod=${settings.lod}`);
  if (settings.locale !== DEFAULT_SETTINGS.locale) parts.push(`locale=${settings.locale}`);
  return parts.length ? parts.join(', ') : 'all defaults';
}
