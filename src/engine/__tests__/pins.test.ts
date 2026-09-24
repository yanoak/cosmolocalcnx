import { describe, expect, it } from 'vitest';
import copy from '@/content/copy.json';
import { compassPoint, firstPin, fitPopup, nearestPin, pinsFor, placeInFrame } from '@/engine/pins';
import { sceneBoundsMetres, validateCopyJoin, type Hotspot, type SceneDocument } from '@/engine/scene';
import { validateIconJoin } from '@/engine/icons';
import { CHAPTER_VIEWS } from '@/engine/views';
import scene from '@/scenes/wat-ket.json';
import viewer from '@/scenes/wat-ket.viewer.json';

const DOC = scene as unknown as SceneDocument;
const VIEWER = viewer as unknown as SceneDocument;
const FUTURES = DOC.hotspots.filter((h) => h.chapter === 'futures');
const VALLEY_HALF_M = 60_000;

const pin = (id: string, at: [number, number], view: 'city' | 'valley' = 'valley'): Hotspot => ({
  id,
  chapter: 'futures',
  view,
  at,
});

describe('compassPoint', () => {
  it('names the eight points, east first and anticlockwise', () => {
    expect(compassPoint([1, 0])).toBe('east');
    expect(compassPoint([0, 1])).toBe('north');
    expect(compassPoint([-1, 0])).toBe('west');
    expect(compassPoint([0, -1])).toBe('south');
    expect(compassPoint([1, 1])).toBe('north-east');
    expect(compassPoint([-1, -1])).toBe('south-west');
  });
});

describe('placeInFrame', () => {
  it('leaves a pin inside the frame where it is', () => {
    const p = placeInFrame([-6670, 36940], VALLEY_HALF_M);
    expect(p.clamped).toBe(false);
    expect(p.at).toEqual([-6670, 36940]);
    expect(p.distanceKm).toBe(38);
    expect(p.compass).toBe('north');
  });

  it('pulls Chiang Dao in to the northern edge along its own bearing, and keeps the true distance', () => {
    const p = placeInFrame([-4040, 63880], VALLEY_HALF_M);
    expect(p.clamped).toBe(true);
    expect(p.distanceKm).toBe(64);
    expect(p.compass).toBe('north');
    // Inside the frame, just under the margin line, and still west of the origin.
    expect(p.at[1]).toBeCloseTo(VALLEY_HALF_M * 0.9, 3);
    expect(p.at[1]).toBeLessThan(VALLEY_HALF_M);
    expect(p.at[0]).toBeLessThan(0);
    // The bearing is unchanged: the same ratio of east to north.
    expect(p.at[0] / p.at[1]).toBeCloseTo(-4040 / 63880, 6);
  });

  it('treats the frame edge itself as inside', () => {
    expect(placeInFrame([VALLEY_HALF_M, 0], VALLEY_HALF_M).clamped).toBe(false);
  });
});

describe('pinsFor', () => {
  const pins = [pin('a', [0, 0], 'city'), pin('b', [1, 1], 'city'), pin('c', [2, 2], 'valley')];

  it('shows every pin in the view in the bowl', () => {
    expect(pinsFor(pins, 'city', null).map((p) => p.id)).toEqual(['a', 'b']);
    expect(pinsFor(pins, 'valley', null).map((p) => p.id)).toEqual(['c']);
  });

  it('shows only the pins a beat names during the stem', () => {
    const beat = { id: 'x', view: 'city' as const, hotspots: ['b'] };
    expect(pinsFor(pins, 'city', beat).map((p) => p.id)).toEqual(['b']);
    expect(pinsFor(pins, 'city', { id: 'y', view: 'city' })).toEqual([]);
  });
});

describe('nearestPin', () => {
  // A row of pins along screen-x: under the isometric camera east-and-south is screen right,
  // so build the row in world terms that project to increasing x.
  const row = [pin('w', [-1000, 1000]), pin('m', [0, 0]), pin('e', [1000, -1000])];

  it('moves right and left along the row and never returns the start', () => {
    expect(nearestPin(row[1], [1, 0], row)?.id).toBe('e');
    expect(nearestPin(row[1], [-1, 0], row)?.id).toBe('w');
    expect(nearestPin(row[2], [1, 0], row)).toBeNull();
  });

  it('is deterministic on a tie, by id', () => {
    const tie = [pin('m', [0, 0]), pin('b', [1000, -1000]), pin('a', [1000, -1000])];
    expect(nearestPin(tie[0], [1, 0], tie)?.id).toBe('a');
  });

  it('starts from the pin nearest the origin', () => {
    expect(firstPin(row)?.id).toBe('m');
    expect(firstPin([])).toBeNull();
  });
});

/**
 * The committed Futures landscape: coordinates in the scene, words in the doc, artwork in
 * the registry — three files edited by three processes, joined here so none can drift.
 */
describe('the committed futures pins', () => {
  const en = (copy as { en: Record<string, { hotspots?: Array<{ id: string }> }> }).en;

  it('are twelve, and the viewer document carries the same twelve', () => {
    expect(FUTURES).toHaveLength(12);
    expect(VIEWER.hotspots.filter((h) => h.chapter === 'futures')).toEqual(FUTURES);
  });

  it('every pin has copy in the doc and every copy entry has a pin', () => {
    expect(validateCopyJoin({ ...DOC, hotspots: FUTURES, scenarios: [] }, { futures: en.futures })).toEqual([]);
  });

  it('every pin has its own distinct icon in the registry', () => {
    expect(validateIconJoin(FUTURES)).toEqual([]);
    const icons = FUTURES.map((h) => h.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('sits in a view the chapter uses, with a coordinate and a note', () => {
    for (const h of FUTURES) {
      expect(CHAPTER_VIEWS.futures, h.id).toContain(h.view);
      expect(h.at, h.id).toBeDefined();
      expect(h.note, h.id).toBeTruthy();
    }
  });

  it('the city pins all fall inside the scene rectangle', () => {
    const [w, s, e, n] = sceneBoundsMetres(DOC);
    for (const h of FUTURES.filter((h) => h.view === 'city')) {
      const [x, y] = h.at!;
      expect(x >= w && x <= e && y >= s && y <= n, `${h.id} at ${x},${y}`).toBe(true);
    }
  });

  it('exactly one valley pin is off the ±60 km frame, and it is Chiang Dao', () => {
    const off = FUTURES.filter((h) => h.view === 'valley' && placeInFrame(h.at!, VALLEY_HALF_M).clamped);
    expect(off.map((h) => h.id)).toEqual(['chiang-dao']);
  });
});

describe('fitPopup', () => {
  const stage = { left: 0, top: 0, width: 1000, height: 800 };

  it('leaves a card alone when it is already on the stage', () => {
    expect(fitPopup({ left: 300, top: 200, width: 320, height: 240 }, stage, 300)).toEqual({ dx: 0, below: false });
  });

  it('slides a card in from the left and from the right edge', () => {
    expect(fitPopup({ left: -100, top: 200, width: 320, height: 240 }, stage, 300).dx).toBe(112);
    expect(fitPopup({ left: 900, top: 200, width: 320, height: 240 }, stage, 300).dx).toBe(-232);
  });

  it('opens under the icon when there is no room above and room below', () => {
    expect(fitPopup({ left: 300, top: -50, width: 320, height: 240 }, stage, 400).below).toBe(true);
    // No room either way: stays above and scrolls, rather than flipping into the same problem.
    expect(fitPopup({ left: 300, top: -50, width: 320, height: 240 }, stage, 100).below).toBe(false);
  });
});
