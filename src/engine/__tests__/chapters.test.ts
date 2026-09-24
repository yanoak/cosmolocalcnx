import { describe, expect, it } from 'vitest';
import {
  beatAt,
  joinBeatCopy,
  releasedAt,
  resolvePose,
  validateScore,
  type Beat,
  type Score,
} from '@/engine/chapters';
import type { ViewId } from '@/engine/views';

const beat = (id: string, view: ViewId = 'valley', extra: Partial<Beat> = {}): Beat => ({ id, view, ...extra });

const past = () => ({
  chapter: 'past' as const,
  beats: [beat('river'), beat('caravans'), beat('roads'), beat('rail'), beat('air', 'valley', { terminal: true })],
});

describe('beatAt', () => {
  it('gives each beat an equal share of the scroll, with a 0–1 progress inside it', () => {
    expect(beatAt(0, 4)).toEqual({ index: 0, t: 0 });
    expect(beatAt(0.125, 4)).toEqual({ index: 0, t: 0.5 });
    expect(beatAt(0.5, 4)).toEqual({ index: 2, t: 0 });
    expect(beatAt(0.875, 4)).toEqual({ index: 3, t: 0.5 });
  });

  it('ends on the last beat at t = 1, not on a beat past the end', () => {
    expect(beatAt(1, 4)).toEqual({ index: 3, t: 1 });
  });

  // Present's growing circle binds to t, so a jump at a boundary is a jump on screen.
  it('is continuous across a boundary — the end of one beat is the start of the next', () => {
    const before = beatAt(0.25 - 1e-9, 4);
    const after = beatAt(0.25, 4);
    expect(before.index).toBe(0);
    expect(before.t).toBeCloseTo(1, 6);
    expect(after).toEqual({ index: 1, t: 0 });
  });

  it('is monotonic in progress', () => {
    let last = { index: -1, t: 0 };
    for (let i = 0; i <= 1000; i++) {
      const b = beatAt(i / 1000, 5);
      expect(b.index * 10 + b.t).toBeGreaterThanOrEqual(last.index * 10 + last.t - 1e-9);
      last = b;
    }
  });

  it('clamps outside [0, 1] rather than indexing off the score', () => {
    expect(beatAt(-1, 4)).toEqual({ index: 0, t: 0 });
    expect(beatAt(3, 4)).toEqual({ index: 3, t: 1 });
  });

  it('is constant for a single beat', () => {
    expect(beatAt(0.3, 1)).toEqual({ index: 0, t: 0.3 });
    expect(beatAt(1, 1)).toEqual({ index: 0, t: 1 });
  });

  it('survives an empty score rather than dividing by zero', () => {
    expect(beatAt(0.5, 0)).toEqual({ index: 0, t: 0 });
  });
});

describe('validateScore', () => {
  it('accepts a well-formed score', () => {
    expect(validateScore(past())).toEqual([]);
  });

  // The invariant the 21 Sep rail removal bought, applied to beats: a beat NAMES its view.
  it('rejects a beat in a view its chapter does not use', () => {
    const s = past();
    s.beats[1] = beat('caravans', 'city');
    expect(validateScore(s).join(' ')).toMatch(/city/);
  });

  it('lets Futures use both the city and the valley — the stem shifts partway', () => {
    const s: Score = {
      chapter: 'futures',
      beats: [beat('gen-c', 'city'), beat('ban-tawan', 'city'), beat('kae', 'valley', { terminal: true })],
    };
    expect(validateScore(s)).toEqual([]);
  });

  it('rejects duplicate beat ids', () => {
    const s = past();
    s.beats[2] = beat('river');
    expect(validateScore(s).join(' ')).toMatch(/duplicate|twice/i);
  });

  it('requires exactly one terminal beat, and it must be last', () => {
    const none = past();
    none.beats[4] = beat('air');
    expect(validateScore(none).join(' ')).toMatch(/terminal/i);

    const early = past();
    early.beats[1] = beat('caravans', 'valley', { terminal: true });
    expect(validateScore(early).join(' ')).toMatch(/last|terminal/i);

    const two = past();
    two.beats[3] = beat('rail', 'valley', { terminal: true });
    expect(validateScore(two).join(' ')).toMatch(/one terminal|exactly one/i);
  });

  it('rejects an empty score', () => {
    expect(validateScore({ chapter: 'past', beats: [] }).join(' ')).toMatch(/no beats|empty/i);
  });

  it('rejects a zoom multiple that is not positive', () => {
    const s = past();
    s.beats[0] = beat('river', 'valley', { pose: { zoom: 0 } });
    expect(validateScore(s).join(' ')).toMatch(/zoom/i);
  });
});

describe('resolvePose', () => {
  const fits = {
    valley: { zoom: 2, target: [0, 0, 0] as [number, number, number] },
    circle: { zoom: 0.25, target: [0, 0, 0] as [number, number, number] },
    city: { zoom: 16, target: [100, 0, -50] as [number, number, number] },
  };

  it('defaults to the view fit, centred on the view', () => {
    expect(resolvePose(beat('river'), fits)).toEqual({ view: 'valley', zoom: 2, target: [0, 0, 0] });
    expect(resolvePose(beat('shed', 'city'), fits)).toEqual({ view: 'city', zoom: 16, target: [100, 0, -50] });
  });

  it('expresses zoom as a multiple of the fit, so a beat means the same on every screen', () => {
    expect(resolvePose(beat('river', 'valley', { pose: { zoom: 3 } }), fits).zoom).toBe(6);
  });

  it('takes an explicit target in world units', () => {
    expect(resolvePose(beat('kae', 'valley', { pose: { target: [-1300, 0, 5250] } }), fits).target).toEqual([-1300, 0, 5250]);
  });

  /** A pose's view is the beat's, always — nothing about a zoom can change it. */
  it('never derives the view from the zoom', () => {
    const p = resolvePose(beat('tiny', 'circle', { pose: { zoom: 1000 } }), fits);
    expect(p.view).toBe('circle');
  });
});

describe('releasedAt', () => {
  it('is true only on the terminal beat, at its end', () => {
    const s = past();
    expect(releasedAt(s, { index: 4, t: 1 })).toBe(true);
    expect(releasedAt(s, { index: 4, t: 0.5 })).toBe(false);
    expect(releasedAt(s, { index: 3, t: 1 })).toBe(false);
  });
});

describe('joinBeatCopy', () => {
  it('is silent when every beat has copy and every copy has a beat', () => {
    expect(joinBeatCopy(past(), ['river', 'caravans', 'roads', 'rail', 'air'].map((id) => ({ id })))).toEqual([]);
  });

  it('names a beat with no copy, and copy with no beat', () => {
    const out = joinBeatCopy(past(), ['river', 'caravans', 'roads', 'rail', 'flight'].map((id) => ({ id })));
    expect(out.join(' ')).toMatch(/"air".*no copy/);
    expect(out.join(' ')).toMatch(/"flight".*no beat/);
  });
});

// ---------------------------------------------------------------------------------
// The ring. Added 24 Sep 2026 with the Present chapter.

import { ringAt } from '../chapters';

describe('ringAt and the ring rule', () => {
  const grow: Beat = { id: 'grow', view: 'circle', ring: { from: 0, to: 1 } };

  it('interpolates the ring between the beat\'s ends, in multiples of the claim', () => {
    expect(ringAt(grow, 0, 3400)).toBe(0);
    expect(ringAt(grow, 0.5, 3400)).toBeCloseTo(1700, 9);
    expect(ringAt(grow, 1, 3400)).toBe(3400);
  });

  it('clamps progress and answers null for a beat without a ring', () => {
    expect(ringAt(grow, 2, 3400)).toBe(3400);
    expect(ringAt({ id: 'x', view: 'circle' }, 0.5, 3400)).toBeNull();
  });

  it('rejects a ring on a beat outside the circle view', () => {
    const score: Score = {
      chapter: 'past',
      beats: [{ id: 'a', view: 'valley', ring: { from: 0, to: 1 }, terminal: true }],
    };
    expect(validateScore(score).join('\n')).toMatch(/ring/);
  });

  it('rejects a negative ring', () => {
    const score: Score = {
      chapter: 'present',
      beats: [{ id: 'a', view: 'circle', ring: { from: -1, to: 1 }, terminal: true }],
    };
    expect(validateScore(score).join('\n')).toMatch(/negative ring/);
  });
});
