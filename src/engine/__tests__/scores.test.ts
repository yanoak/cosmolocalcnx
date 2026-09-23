import { describe, expect, it } from 'vitest';
import copy from '@/content/copy.json';
import { SCORES } from '@/content/scores';
import { joinBeatCopy, validateScore } from '@/engine/chapters';
import { CHAPTER_ORDER } from '@/engine/views';

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

  /** Futures opens in the city: the stem introduces the four places there first. */
  it('opens Futures in the city, which is also the chapter\'s default view', () => {
    expect(SCORES.futures.beats[0].view).toBe('city');
  });
});
