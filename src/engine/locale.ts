/**
 * Localised text lookup.
 *
 * Strings in the scene document are maps keyed by locale code, not a fixed {en, th}
 * pair. September ships English and Thai; the structure costs an hour now and means
 * a translator appearing late only has to supply words. See docs/roadmap.md.
 */

export type LocaleMap = Record<string, string>;

/** Visibly missing beats silently empty — an em dash shows up in review. */
export const PLACEHOLDER = '—';

export const DEFAULT_FALLBACK_CHAIN = ['en', 'th'];

export function pickLocale(
  map: LocaleMap,
  locale: string,
  fallbackChain: string[] = DEFAULT_FALLBACK_CHAIN,
): string {
  for (const candidate of [locale, ...fallbackChain]) {
    const value = map[candidate];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return PLACEHOLDER;
}
