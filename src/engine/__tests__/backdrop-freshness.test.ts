import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backdropFingerprint, type BackdropMeta, type FingerprintInput } from '../backdrop';
import type { SceneDocument } from '../scene';

/**
 * The committed backdrop must match the committed scene document.
 *
 * `docs/roadmap.md` rejected pre-rendered raster because a hand-maintained image drifts
 * from the document. The answer on 21 Sep 2026 was that this image is DERIVED — but
 * derived only stays true if something re-derives it, and a committed artefact goes
 * stale the moment `npm run fetch:osm` rewrites the scene. Rendering during the build
 * would prevent that; so does this, without putting a six-second render on the deploy
 * path, and it fails somewhere a person can fix it.
 *
 * If this test fails, the fix is `npm run render:backdrop`. It is not a bug in the test.
 */

const SCENES = new URL('../../scenes/', import.meta.url);

function read<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(name, SCENES), 'utf8')) as T;
}

describe('the committed backdrop is not stale', () => {
  const doc = read<SceneDocument>('wat-ket.json');
  const meta = read<BackdropMeta>('wat-ket.backdrop.json');

  // Derived exactly as page.tsx and the generator derive it.
  const heroIds = new Set(
    [...doc.hotspots, ...doc.scenarios.flatMap((s) => s.hotspots)]
      .map((h) => h.target)
      .filter((t): t is string => typeof t === 'string' && t !== ''),
  );

  it('was rendered from this scene document', () => {
    const actual = backdropFingerprint({
      buildings: doc.baseline.buildings,
      heroIds,
      centre: meta.near.centreM,
      radiusM: meta.near.radiusM,
      widthPx: meta.size.width,
    });

    expect(
      actual,
      'The backdrop is stale — the scene document has changed since it was rendered. ' +
        'Run `npm run render:backdrop`.',
    ).toBe(meta.source.fingerprint);
  });

  it('agrees with the document about how many buildings there are', () => {
    expect(meta.source.buildings).toBe(doc.baseline.buildings.length);
  });

  it('accounts for every building — near plus both slices is the whole scene', () => {
    const inSlices = meta.slices.reduce((n, s) => n + s.buildings, 0);
    expect(meta.near.buildings + inSlices).toBe(doc.baseline.buildings.length);
  });

  it('keeps the near set inside the triangle budget', () => {
    // The budget in docs/architecture.md is ~100-150k, and the near set is the only
    // baseline geometry the viewer extrudes once the backdrop is wired in.
    const near = doc.baseline.buildings.filter((b) => {
      const n = b.footprint.length;
      let cx = 0;
      let cy = 0;
      for (const [x, y] of b.footprint) {
        cx += x;
        cy += y;
      }
      const dx = cx / n - meta.near.centreM[0];
      const dy = cy / n - meta.near.centreM[1];
      return heroIds.has(b.id) || dx * dx + dy * dy <= meta.near.radiusM ** 2;
    });
    const triangles = near.reduce(
      (t, b) => t + (b.footprint.length - 2) * 2 + b.footprint.length * 2,
      0,
    );
    expect(triangles).toBeLessThanOrEqual(150_000);
  });
});

describe('backdropFingerprint', () => {
  const base: FingerprintInput = {
    buildings: [
      {
        id: 'osm/way/1',
        footprint: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        height: 6,
        kind: 'residential',
      },
    ],
    heroIds: new Set<string>(),
    centre: [0, 0],
    radiusM: 1250,
    widthPx: 2048,
  };

  it('is stable for the same inputs', () => {
    expect(backdropFingerprint(base)).toBe(backdropFingerprint(base));
  });

  it('notices a building that moved', () => {
    const moved: FingerprintInput = {
      ...base,
      buildings: [
        {
          ...base.buildings[0],
          footprint: [
            [0, 0],
            [1, 0],
            [1, 1.5],
          ],
        },
      ],
    };
    expect(backdropFingerprint(moved)).not.toBe(backdropFingerprint(base));
  });

  it('notices a height change, which changes every wall in the raster', () => {
    const taller = { ...base, buildings: [{ ...base.buildings[0], height: 30 }] };
    expect(backdropFingerprint(taller)).not.toBe(backdropFingerprint(base));
  });

  it('notices a kind change, which changes the tone', () => {
    const civic = { ...base, buildings: [{ ...base.buildings[0], kind: 'temple' }] };
    expect(backdropFingerprint(civic)).not.toBe(backdropFingerprint(base));
  });

  /** A hero moves from the raster into geometry, so the raster changes. */
  it('notices a new hero', () => {
    const hero = { ...base, heroIds: new Set(['osm/way/1']) };
    expect(backdropFingerprint(hero)).not.toBe(backdropFingerprint(base));
  });

  it('notices each generator parameter', () => {
    expect(backdropFingerprint({ ...base, radiusM: 1500 })).not.toBe(backdropFingerprint(base));
    expect(backdropFingerprint({ ...base, widthPx: 4096 })).not.toBe(backdropFingerprint(base));
    expect(backdropFingerprint({ ...base, centre: [10, 0] })).not.toBe(
      backdropFingerprint(base),
    );
  });

  /**
   * The hero set is built by flattening scenarios, so its insertion order follows the
   * order scenarios happen to be written in. Reordering them is not a change to the
   * picture and must not read as one.
   */
  it('does not depend on the order the hero set was built in', () => {
    const one = { ...base, heroIds: new Set(['a', 'b']) };
    const other = { ...base, heroIds: new Set(['b', 'a']) };
    expect(backdropFingerprint(one)).toBe(backdropFingerprint(other));
  });

  it('does depend on building order, because the painter draws in it', () => {
    const second = { ...base.buildings[0], id: 'osm/way/2' };
    const forward = { ...base, buildings: [base.buildings[0], second] };
    const backward = { ...base, buildings: [second, base.buildings[0]] };
    expect(backdropFingerprint(forward)).not.toBe(backdropFingerprint(backward));
  });
});
