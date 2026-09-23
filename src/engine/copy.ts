/**
 * Copy comes from a Google Doc. This module is the pure half of that pipeline.
 *
 * `docToMarkdown` walks the Docs API's JSON and emits plain text with hyperlinks kept as
 * `[text](url)` — the only formatting that survives. Bold and italic are dropped on
 * purpose: a bold `kicker:` line would become `**kicker:**`, which ArchieML reads as prose
 * rather than as a key. Plain text plus links is exactly what ArchieML wants, and it is
 * why the reference script this replaces needed a regex to un-bold its headers.
 *
 * `renderCopy` is the other end: it turns a copy string back into paragraphs of runs for
 * the DOM to map onto `<p>` and `<a>`. It is a parser for one construct, not a markdown
 * engine, so nothing a writer types can become markup.
 *
 * Both are pure and tested in node. The script that fetches the doc is
 * `scripts/fetch-copy.ts`; see plans/2026-09-24_copy-from-archieml.plan.md.
 */

// ------------------------------------------------------------- the Docs API shape

/** The subset of a Docs API structural element this module reads. */
export interface DocElement {
  paragraph?: {
    elements?: Array<{
      textRun?: {
        content?: string;
        textStyle?: { link?: { url?: string } };
      };
      /** Images and drawings. Carry no text, and are skipped. */
      inlineObjectElement?: unknown;
    }>;
    bullet?: unknown;
    paragraphStyle?: { namedStyleType?: string };
  };
  table?: {
    tableRows?: Array<{ tableCells?: Array<{ content?: DocElement[] }> }>;
  };
  sectionBreak?: unknown;
}

// ------------------------------------------------------------- doc → markdown

/**
 * One paragraph's runs, with adjacent runs that share a link merged into one.
 *
 * Docs splits a linked phrase into several runs whenever a style changes inside it, so
 * "[the ](u)[report](u)" would otherwise come out as two links. Merge on the url.
 */
function paragraphToLine(elements: NonNullable<DocElement['paragraph']>['elements']): string {
  const merged: Array<{ text: string; url?: string }> = [];
  for (const el of elements ?? []) {
    const run = el.textRun;
    if (!run || typeof run.content !== 'string') continue;
    const url = run.textStyle?.link?.url;
    const last = merged[merged.length - 1];
    if (last && last.url === url) last.text += run.content;
    else merged.push({ text: run.content, url });
  }
  return merged
    .map(({ text, url }) => {
      // The paragraph's own terminator is the run's trailing newline; it is not part of
      // the link text and it is re-added by the caller as the line break.
      const body = text.replace(/\n$/, '');
      return url ? `[${body}](${url})` : body;
    })
    .join('')
    .replace(/[ \t]+$/, '');
}

/**
 * A tab's body as markdown. Headings and bullets are plain text — ArchieML has no use for
 * either, and a list marker in front of `id: river` would break the key. Tables are
 * flattened one cell-paragraph per line. Empty paragraphs are kept as blank lines because
 * writers use them between paragraphs inside a `:end` block.
 */
export function docToMarkdown(body: DocElement[]): string {
  const lines: string[] = [];
  for (const el of body) {
    if (el.paragraph) {
      lines.push(paragraphToLine(el.paragraph.elements));
    } else if (el.table) {
      for (const row of el.table.tableRows ?? []) {
        for (const cell of row.tableCells ?? []) {
          lines.push(docToMarkdown(cell.content ?? []));
        }
      }
    }
    // sectionBreak and anything else carries no text.
  }
  return lines.join('\n').replace(/^\n+|\n+$/g, '');
}

// ------------------------------------------------------------- tab naming

/**
 * Tab title → the key it is stored under. The doc's tab says "Future"; the chapter is
 * `futures`, and the plural is load-bearing — the piece asks "which of these", not "is
 * this an improvement". An unknown tab becomes a slug rather than an error, so a writer
 * adding a tab does not break the fetch.
 */
export function tabKey(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug === 'future' ? 'futures' : slug;
}

// ------------------------------------------------------------- markdown → runs

export type CopyRun = { text: string; href?: string };
export type CopyParagraph = CopyRun[];

const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;

/** Links a writer's doc may point at. Anything else is rendered as text, not as a link. */
function safeHref(url: string): string | undefined {
  return /^(https?:|mailto:)/i.test(url) ? url : undefined;
}

/**
 * A copy string as paragraphs of runs. Paragraphs split on blank lines; single newlines
 * inside a paragraph are the writer's soft wraps and join with a space. This is the whole
 * grammar — there is no markup a string can carry into the DOM.
 */
export function renderCopy(text: string): CopyParagraph[] {
  return text
    .split(/\n[ \t]*\n/)
    .map((block) => block.replace(/\s*\n\s*/g, ' ').trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      const runs: CopyParagraph = [];
      let cursor = 0;
      for (const m of block.matchAll(LINK)) {
        const at = m.index ?? 0;
        if (at > cursor) runs.push({ text: block.slice(cursor, at) });
        const href = safeHref(m[2]);
        runs.push(href ? { text: m[1], href } : { text: m[1] });
        cursor = at + m[0].length;
      }
      if (cursor < block.length) runs.push({ text: block.slice(cursor) });
      return runs;
    });
}
