import { describe, expect, it } from 'vitest';
import {
  browserStorage,
  clearSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  parseSettings,
  resolveSettings,
  saveSettings,
  serialiseSettings,
  SETTINGS_KEY,
  type Settings,
} from '../settings';

const params = (query: string) => new URLSearchParams(query);

/** Storage that throws on everything, as private mode and blocked site data do. */
const HOSTILE = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
};

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe('parseSettings', () => {
  it('gives defaults for nothing stored', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a full settings object', () => {
    const settings: Settings = { view: 'valley', relief: 'terraced', lod: 'full', locale: 'th' };
    expect(parseSettings(serialiseSettings(settings))).toEqual(settings);
  });

  it('falls back to defaults on malformed JSON rather than throwing', () => {
    // A bad settings blob must never blank the exhibition.
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('"a string"')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2,3]')).toEqual({ ...DEFAULT_SETTINGS });
  });

  it('drops values an older build may have written', () => {
    // A renamed view must not put the viewer in a state it cannot render.
    const stale = JSON.stringify({ view: 'district', relief: 'contours', lod: 'ultra', locale: 'fr' });
    expect(parseSettings(stale)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the good fields of a partly bad blob', () => {
    const mixed = JSON.stringify({ view: 'city', relief: 'nonsense', lod: 'full' });
    expect(parseSettings(mixed)).toEqual({
      view: 'city',
      relief: DEFAULT_SETTINGS.relief,
      lod: 'full',
      locale: DEFAULT_SETTINGS.locale,
    });
  });

  it('treats a missing view as "run the on-ramp"', () => {
    expect(parseSettings(JSON.stringify({ lod: 'full' })).view).toBeNull();
  });
});

describe('resolveSettings', () => {
  const stored: Settings = { view: 'city', relief: 'terraced', lod: 'full', locale: 'th' };

  it('uses stored values when the URL says nothing', () => {
    expect(resolveSettings(stored, params(''))).toEqual(stored);
  });

  it('lets a URL parameter beat a stored setting', () => {
    // A QR code aimed at the valley must not be overridden by however the machine
    // was last left.
    expect(resolveSettings(stored, params('view=valley')).view).toBe('valley');
    expect(resolveSettings(stored, params('lod=near')).lod).toBe('near');
    expect(resolveSettings(stored, params('relief=hillshade')).relief).toBe('hillshade');
    expect(resolveSettings(stored, params('locale=en')).locale).toBe('en');
  });

  it('does not let an absent parameter clobber a stored setting', () => {
    // The bug that would make settings worse than the parameters they replace:
    // visiting `/` at all wiping the machine's configuration.
    const resolved = resolveSettings(stored, params('view=valley'));
    expect(resolved.lod).toBe('full');
    expect(resolved.relief).toBe('terraced');
    expect(resolved.locale).toBe('th');
  });

  it('ignores a parameter it does not recognise', () => {
    expect(resolveSettings(stored, params('lod=ultra')).lod).toBe('full');
    expect(resolveSettings(stored, params('relief=rainbow')).relief).toBe('terraced');
  });

  it('lets an explicit empty view parameter mean the on-ramp', () => {
    // `?view=` with nothing after it is a deliberate "do the default thing".
    expect(resolveSettings(stored, params('view=')).view).toBeNull();
  });

  it('resolves defaults when nothing is stored and nothing is asked', () => {
    expect(resolveSettings(DEFAULT_SETTINGS, params(''))).toEqual(DEFAULT_SETTINGS);
  });
});

describe('storage', () => {
  it('round-trips through a real storage-shaped object', () => {
    const storage = memoryStorage();
    const settings: Settings = { view: 'valley', relief: 'gradient', lod: 'full', locale: 'th' };

    expect(saveSettings(storage, settings)).toBe(true);
    expect(storage.map.get(SETTINGS_KEY)).toBeTypeOf('string');
    expect(loadSettings(storage)).toEqual(settings);

    clearSettings(storage);
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('survives storage that throws, as private mode does', () => {
    expect(loadSettings(HOSTILE)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(HOSTILE, DEFAULT_SETTINGS)).toBe(false);
    expect(() => clearSettings(HOSTILE)).not.toThrow();
  });

  it('survives storage being absent entirely', () => {
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(undefined, DEFAULT_SETTINGS)).toBe(false);
    expect(() => clearSettings(undefined)).not.toThrow();
  });

  it('reports no storage when there is no window', () => {
    // The static export prerenders these pages in Node, where this must not throw.
    expect(browserStorage()).toBeUndefined();
  });
});
