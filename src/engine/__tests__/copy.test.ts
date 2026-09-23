import { describe, expect, it } from 'vitest';
import { docToMarkdown, renderCopy, tabKey, type DocElement } from '@/engine/copy';

/** A paragraph as the Docs API returns it. Content strings end in '\n' like the real thing. */
function para(runs: Array<{ t: string; link?: string; bold?: boolean }>, extra: object = {}) {
  return {
    paragraph: {
      elements: runs.map((r) => ({
        textRun: {
          content: r.t,
          textStyle: {
            ...(r.bold ? { bold: true } : {}),
            ...(r.link ? { link: { url: r.link } } : {}),
          },
        },
      })),
      ...extra,
    },
  } as DocElement;
}

describe('docToMarkdown', () => {
  it('turns a linked run into [text](url)', () => {
    const md = docToMarkdown([
      para([{ t: 'a month through ' }, { t: 'thirty-two rapids', link: 'https://x.test/r' }, { t: '.\n' }]),
    ]);
    expect(md).toBe('a month through [thirty-two rapids](https://x.test/r).');
  });

  it('keeps the link boundary when adjacent runs differ only in style', () => {
    // Docs splits a linked phrase into two runs when bold changes mid-link. Same url, one link.
    const md = docToMarkdown([
      para([
        { t: 'see ' },
        { t: 'the ', link: 'https://x.test' },
        { t: 'report', link: 'https://x.test', bold: true },
        { t: ' now\n' },
      ]),
    ]);
    expect(md).toBe('see [the report](https://x.test) now');
  });

  // The test that keeps `key:` lines parseable. A bold "kicker:" must not become "**kicker:**",
  // which ArchieML would read as a line of prose rather than a key.
  it('drops bold and italic but keeps the text', () => {
    const md = docToMarkdown([para([{ t: 'kicker: 1867\n', bold: true }])]);
    expect(md).toBe('kicker: 1867');
    expect(md).not.toContain('*');
  });

  it('separates paragraphs with newlines and keeps blank paragraphs as blank lines', () => {
    const md = docToMarkdown([
      para([{ t: 'body: First.\n' }]),
      para([{ t: '\n' }]),
      para([{ t: 'Second.\n' }]),
      para([{ t: ':end\n' }]),
    ]);
    expect(md).toBe('body: First.\n\nSecond.\n:end');
  });

  it('renders a heading as plain text', () => {
    const md = docToMarkdown([
      para([{ t: 'Past\n' }], { paragraphStyle: { namedStyleType: 'HEADING_1' } }),
    ]);
    expect(md).toBe('Past');
  });

  it('gives a bulleted paragraph no marker ArchieML could misread', () => {
    const md = docToMarkdown([para([{ t: 'id: river\n' }], { bullet: { listId: 'x' } })]);
    expect(md).toBe('id: river');
  });

  it('ignores elements that carry no text', () => {
    const md = docToMarkdown([
      { sectionBreak: {} } as DocElement,
      para([{ t: 'title: Wat Ket\n' }]),
      { paragraph: { elements: [{ inlineObjectElement: {} }] } } as DocElement,
    ]);
    expect(md).toBe('title: Wat Ket');
  });

  it('is deterministic', () => {
    const doc = [para([{ t: 'a ', link: 'https://x.test' }, { t: 'b\n' }])];
    expect(docToMarkdown(doc)).toBe(docToMarkdown(doc));
  });
});

describe('tabKey', () => {
  it('maps the doc tab titles onto the chapter keys', () => {
    expect(tabKey('Overall')).toBe('overall');
    expect(tabKey('Past')).toBe('past');
    expect(tabKey('Present')).toBe('present');
    // The tab says Future; the chapter is Futures, plural, and that is load-bearing.
    expect(tabKey('Future')).toBe('futures');
    expect(tabKey('Futures')).toBe('futures');
  });

  it('slugs an unknown tab rather than throwing, so a new tab is not a crash', () => {
    expect(tabKey('Credits & Thanks')).toBe('credits-thanks');
  });
});

describe('renderCopy', () => {
  it('splits paragraphs on blank lines and yields link runs with href', () => {
    const out = renderCopy('One with [a link](https://x.test/1).\n\nTwo.');
    expect(out).toEqual([
      [{ text: 'One with ' }, { text: 'a link', href: 'https://x.test/1' }, { text: '.' }],
      [{ text: 'Two.' }],
    ]);
  });

  it('joins soft-wrapped lines inside a paragraph with a space', () => {
    expect(renderCopy('line one\nline two')).toEqual([[{ text: 'line one line two' }]]);
  });

  it('yields one text run per paragraph when there are no links', () => {
    expect(renderCopy('Plain.\n\nAlso plain.')).toEqual([[{ text: 'Plain.' }], [{ text: 'Also plain.' }]]);
  });

  it('returns nothing for empty copy rather than an empty paragraph', () => {
    expect(renderCopy('')).toEqual([]);
    expect(renderCopy('  \n\n ')).toEqual([]);
  });

  // The surface-area guarantee: a writer's doc can never inject markup. Runs are data —
  // `text` and an optional `href`, nothing the DOM would interpret — so "<script>" in the
  // copy is rendered as those literal characters, and a javascript: link is not a link.
  it('emits only text runs and safe hrefs, never markup', () => {
    const out = renderCopy('<script>alert(1)</script> and [x](javascript:alert(1)) [y](https://ok.test)');
    for (const r of out.flat()) {
      expect(Object.keys(r).sort()).toEqual(r.href ? ['href', 'text'] : ['text']);
    }
    const hrefs = out.flat().flatMap((r) => (r.href ? [r.href] : []));
    expect(hrefs).toEqual(['https://ok.test']);
    expect(out[0][0].text).toBe('<script>alert(1)</script> and ');
  });
});
