/**
 * Pull the piece's copy from its Google Doc, via ArchieML, with links intact.
 *
 *     npm run fetch:copy
 *
 * Reads "Nomad Futures Lab Exhibit [ArchieML]" through the authenticated `gws` CLI — the
 * doc is private, so the public export URL 401s, and `gws` is what the rest of this
 * project already uses for Docs. No credential touches the repo: auth lives in the OS
 * keyring of the machine running this, the same arrangement as the Overpass and GHS-POP
 * fetches. `gws` lives under nvm, so run this through npm or with that bin on PATH.
 *
 * One tab per chapter — Overall, Past, Present, Future — each written out twice:
 *   src/content/en/<tab>.md   the markdown, for diffing and for reading in a PR
 *   src/content/copy.json     every tab parsed as ArchieML, under a locale key
 *
 * Locale sits at the top of copy.json rather than at every leaf because a whole tab is one
 * language: Thai is a second tab or doc later, not a refactor. The pure conversion lives
 * in src/engine/copy.ts and is tested; this file is only transport and file I/O.
 *
 * Byte-identical on re-run from an unchanged doc — nothing here writes a timestamp.
 * See plans/2026-09-24_copy-from-archieml.plan.md.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import archieml from 'archieml';
import { docToMarkdown, tabKey, type DocElement } from '../src/engine/copy';

const DOC_ID = '1TvCGOKkP_qagsb5SMkyGFpn4LdaFpw0obwiOpiR1RRw';
const LOCALE = 'en';
const OUT_DIR = join(process.cwd(), 'src', 'content');

interface Tab {
  tabProperties?: { title?: string; tabId?: string };
  documentTab?: { body?: { content?: DocElement[] } };
  childTabs?: Tab[];
}

function fetchDoc(): { title?: string; tabs?: Tab[] } {
  const params = JSON.stringify({ documentId: DOC_ID, includeTabsContent: true });
  const out = execFileSync('gws', ['docs', 'documents', 'get', '--params', params], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out);
}

/** Depth-first, in document order, so the output order is the doc's and stays stable. */
function flatten(tabs: Tab[] | undefined, out: Tab[] = []): Tab[] {
  for (const t of tabs ?? []) {
    out.push(t);
    flatten(t.childTabs, out);
  }
  return out;
}

const doc = fetchDoc();
const tabs = flatten(doc.tabs);
if (tabs.length === 0) throw new Error('The doc has no tabs — was includeTabsContent honoured?');

mkdirSync(join(OUT_DIR, LOCALE), { recursive: true });

const parsed: Record<string, unknown> = {};
for (const tab of tabs) {
  const title = tab.tabProperties?.title ?? 'untitled';
  const key = tabKey(title);
  const markdown = docToMarkdown(tab.documentTab?.body?.content ?? []);
  writeFileSync(join(OUT_DIR, LOCALE, `${key}.md`), markdown + '\n');
  parsed[key] = archieml.load(markdown);
  console.log(`${title.padEnd(10)} → ${key}.md  (${markdown.length} chars)`);
}

const copy = {
  _source: { documentId: DOC_ID, title: doc.title ?? null, via: 'gws docs documents get' },
  [LOCALE]: parsed,
};
writeFileSync(join(OUT_DIR, 'copy.json'), JSON.stringify(copy, null, 2) + '\n');
console.log(`wrote src/content/copy.json with ${tabs.length} tab(s) under "${LOCALE}"`);
