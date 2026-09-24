import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICON_IDS, ICON_SIZE, ICONS, iconFor, validateIconJoin } from '@/engine/icons';
import scene from '@/scenes/wat-ket.json';
import { CHAPTER_ORDER } from '@/engine/views';

/**
 * The registry is a join between three things that are edited separately: the manifest the
 * generator reads, the sidecar the promoter writes, and the files under public/icons. Any
 * one of them drifting is a blank pin on the projector, so all three are pinned here.
 */
const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, 'scripts/icons/manifest.json'), 'utf8')) as {
  icons: Array<{ id: string; chapter: string }>;
};

describe('the icon registry', () => {
  it('has one sprite per manifest entry, in manifest order', () => {
    expect(ICON_IDS).toEqual(manifest.icons.map((i) => i.id));
  });

  it('names a file that exists under public/ for every sprite', () => {
    for (const s of ICONS.values()) {
      const path = join(root, 'public', s.file);
      expect(existsSync(path), `${s.id}: ${s.file}`).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(1024);
    }
  });

  it('was written at the size it claims, and no sprite is larger', () => {
    for (const s of ICONS.values()) {
      expect(Math.max(s.width, s.height), s.id).toBeLessThanOrEqual(ICON_SIZE);
      expect(Math.max(s.width, s.height), s.id).toBeGreaterThan(ICON_SIZE / 2);
    }
  });

  it('anchors every sprite at the bottom-centre, where the base meets the map', () => {
    for (const s of ICONS.values()) expect(s.anchor).toEqual([0.5, 1]);
  });

  it('files every sprite under a real chapter, matching the manifest', () => {
    const byId = new Map(manifest.icons.map((i) => [i.id, i.chapter]));
    for (const s of ICONS.values()) {
      expect(CHAPTER_ORDER).toContain(s.chapter);
      expect(s.chapter).toBe(byId.get(s.id));
    }
  });

  it('resolves an id, and returns undefined for a plain node', () => {
    expect(iconFor('kae')?.file).toBe('/icons/kae.webp');
    expect(iconFor(undefined)).toBeUndefined();
    expect(iconFor('no-such-icon')).toBeUndefined();
  });

  it('reports a hotspot that names an icon the registry lacks', () => {
    expect(validateIconJoin([{ id: 'a', icon: 'kae' }, { id: 'b' }])).toEqual([]);
    expect(validateIconJoin([{ id: 'c', icon: 'ghost' }])).toEqual([
      'hotspot c names icon "ghost", which is not in the registry',
    ]);
  });

  it('covers every icon the committed scene names', () => {
    const doc = scene as { hotspots?: Array<{ id: string; icon?: string }>; scenarios?: Array<{ hotspots?: Array<{ id: string; icon?: string }> }> };
    const all = [...(doc.hotspots ?? []), ...(doc.scenarios ?? []).flatMap((s) => s.hotspots ?? [])];
    expect(validateIconJoin(all)).toEqual([]);
  });
});
