/**
 * The scene document's on-disk formatting, owned in one place.
 *
 * Extracted from `fetch-osm.ts` on 21 Sep 2026 when `render-backdrop.ts` became the
 * second script that writes the document. Two copies of this would drift, and the
 * drift would show up as a 68,704-building diff the first time the copies disagreed
 * about a line length — which is the worst possible way to find out.
 */

/**
 * JSON with coordinate arrays kept on one line.
 *
 * Not cosmetic. `JSON.stringify(doc, null, 2)` puts every number of every footprint
 * on its own line, which turns ~1,600 buildings into a file of several hundred
 * thousand lines that no diff is readable in. The rule is: arrays containing only
 * numbers or only short number-arrays collapse; everything else indents.
 */
export function format(value: unknown, depth = 0): string {
  const pad = '  '.repeat(depth);
  const inner = '  '.repeat(depth + 1);

  if (value === null || typeof value !== 'object') return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const flat = value.every((v) => typeof v === 'number');
    if (flat) return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;

    const points = value.every(
      (v) => Array.isArray(v) && v.every((n: unknown) => typeof n === 'number'),
    );
    if (points) {
      const oneLine = `[${value.map((v) => format(v)).join(', ')}]`;
      if (oneLine.length + pad.length <= 160) return oneLine;
      return `[\n${value.map((v) => inner + format(v)).join(',\n')}\n${pad}]`;
    }

    return `[\n${value.map((v) => inner + format(v, depth + 1)).join(',\n')}\n${pad}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  const oneLine = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${format(v)}`).join(', ')} }`;
  if (oneLine.length + pad.length <= 120 && !oneLine.includes('\n')) return oneLine;

  return `{\n${entries
    .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${format(v, depth + 1)}`)
    .join(',\n')}\n${pad}}`;
}
