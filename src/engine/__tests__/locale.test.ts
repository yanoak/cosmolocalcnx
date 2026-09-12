import { describe, expect, it } from 'vitest';
import { PLACEHOLDER, pickLocale } from '@/engine/locale';

const label = { en: 'Riverside Commons', th: 'ริมน้ำร่วม' };

describe('pickLocale', () => {
  it('returns an exact match', () => {
    expect(pickLocale(label, 'th')).toBe('ริมน้ำร่วม');
  });

  it('falls back down the chain when the locale is missing', () => {
    expect(pickLocale({ en: 'only english' }, 'th')).toBe('only english');
  });

  it('never leaks undefined into the DOM', () => {
    // A missing string should be visibly missing, not silently empty.
    expect(pickLocale({}, 'th')).toBe(PLACEHOLDER);
    expect(pickLocale({ th: '' }, 'th')).toBe(PLACEHOLDER);
  });

  it('accepts a locale the palette has never seen, which is the point', () => {
    const withLanna = { ...label, nod: 'ᨶᩣᩴ᩶' };
    expect(pickLocale(withLanna, 'nod')).toBe('ᨶᩣᩴ᩶');
  });

  it('takes an explicit fallback chain', () => {
    expect(pickLocale({ en: 'english' }, 'nod', ['th', 'en'])).toBe('english');
  });
});
