import { describe, expect, it } from 'vitest';
import copy from '@/content/copy.json';
import { SCORES } from '@/content/scores';
import { joinBeatCopy, validateScore } from '@/engine/chapters';
import { CHAPTER_ORDER, defaultView } from '@/engine/views';

/**
 * The build-time promise behind the copy pipeline: a score and the doc's `[beats]` for
 * that chapter agree, by id, both ways. A beat with no words is a blank card; words with
 * no beat are never shown. Either is a failed test here rather than a surprise on the
 * projector.
 */
type CopyBeats = { beats?: Array<{ id: string }> };
const en = (copy as { en: Record<string, CopyBeats> }).en;

describe('the committed scores', () => {
  for (const chapter of CHAPTER_ORDER) {
    it(`${chapter}: is a valid score`, () => {
      expect(validateScore(SCORES[chapter])).toEqual([]);
    });

    it(`${chapter}: joins the doc's copy both ways`, () => {
      expect(joinBeatCopy(SCORES[chapter], en[chapter]?.beats ?? [])).toEqual([]);
    });
  }

  it('has one score per chapter and no others', () => {
    expect(Object.keys(SCORES).sort()).toEqual([...CHAPTER_ORDER].sort());
  });

  /** The first beat is the view the chapter opens on, so the cut into a chapter is not two cuts. */
  for (const chapter of CHAPTER_ORDER) {
    it(`${chapter}: opens on the chapter's default view`, () => {
      expect(SCORES[chapter].beats[0].view).toBe(defaultView(chapter));
    });
  }

  /** Futures is the stem that crosses a view: the city first, then the valley for the close. */
  it('Futures crosses from the city to the valley, once', () => {
    const views = SCORES.futures.beats.map((b) => b.view);
    expect(views[0]).toBe('city');
    expect(views[views.length - 1]).toBe('valley');
    const changes = views.filter((v, i) => i > 0 && v !== views[i - 1]).length;
    expect(changes).toBe(1);
  });
});

import scene from '@/scenes/wat-ket.json';

describe('a chapter walk', () => {
  const hotspots = (scene as unknown as { hotspots: { id: string; chapter: string }[] }).hotspots;
  for (const id of CHAPTER_ORDER) {
    const walk = SCORES[id].walk;
    if (!walk) continue;
    it(`${id} names every one of its pins exactly once`, () => {
      const pins = hotspots.filter((h) => h.chapter === id).map((h) => h.id);
      expect([...walk].sort()).toEqual([...pins].sort());
    });
  }
});
