import { describe, expect, it } from 'vitest';
import {
  CARAVAN_CORRIDORS,
  HIGHWAY_11,
  THREADS,
  THREAD_ORDER,
  styleFor,
  threadStrokes,
  threadOf,
  THREAD_PINS,
  type ThreadFeatures,
  type ThreadId,
} from '@/engine/threads';
import { PING } from '@/engine/valley';
import features from '@/scenes/wat-ket.valley.features.json';
import scene from '@/scenes/wat-ket.json';

const F = features as unknown as ThreadFeatures;
const ALL = new Set<ThreadId>(THREAD_ORDER);

describe('the certainty grammar', () => {
  it('gives every thread a certainty, in the chapter\'s order', () => {
    expect(THREAD_ORDER).toEqual(['river', 'caravans', 'roads', 'rail', 'air']);
    for (const id of THREAD_ORDER) expect(['confirmed', 'probable', 'none']).toContain(THREADS[id].certainty);
  });

  it('never draws a probable thread as a solid line — the honesty rule', () => {
    expect(styleFor('probable')?.dashed).toBe(true);
    expect(styleFor('confirmed')?.dashed).toBe(false);
    expect(styleFor('none')).toBeNull();
    for (const s of threadStrokes(ALL, F)) {
      if (THREADS[s.thread].certainty === 'probable') expect(s.style.dashed, s.thread).toBe(true);
    }
  });

  it('draws nothing for the air thread at all — remote work has no route', () => {
    expect(threadStrokes(new Set<ThreadId>(['air']), F)).toEqual([]);
    expect(threadStrokes(ALL, F).map((s) => s.thread)).not.toContain('air');
  });
});

describe('threadStrokes on the committed features', () => {
  it('draws only the threads that are on', () => {
    expect(threadStrokes(new Set<ThreadId>(['river']), F).map((s) => s.thread)).toEqual(['river']);
    expect(threadStrokes(new Set<ThreadId>(), F)).toEqual([]);
  });

  it('the river thread is the Ping and nothing else', () => {
    const river = threadStrokes(new Set<ThreadId>(['river']), F)[0];
    expect(river.paths.length).toBe(F.rivers.filter((r) => r.name === PING).length);
    expect(river.paths.length).toBeGreaterThan(0);
  });

  it('the roads thread is Highway 11 by its ref, and no other road', () => {
    const roads = threadStrokes(new Set<ThreadId>(['roads']), F)[0];
    const eleven = (F.roads ?? []).filter((r) => r.ref === HIGHWAY_11);
    expect(eleven.length).toBeGreaterThan(100);
    expect(roads.paths.length).toBe(eleven.length);
  });

  it('the rail thread is the whole committed railway', () => {
    const rail = threadStrokes(new Set<ThreadId>(['rail']), F)[0];
    expect(rail.paths.length).toBe(F.rails?.length);
    expect(rail.paths.length).toBeGreaterThan(10);
  });

  it('the caravan corridors start at the origin, pass a documented town and leave the frame', () => {
    for (const c of CARAVAN_CORRIDORS) {
      expect(c.nodes[0]).toEqual([0, 0]);
      expect(c.nodes.length).toBeGreaterThanOrEqual(3);
      const last = c.nodes[c.nodes.length - 1];
      expect(Math.max(Math.abs(last[0]), Math.abs(last[1]))).toBe(60000);
    }
  });
});

describe('THREAD_PINS', () => {
  it('claims every Past hotspot in the document exactly once', () => {
    const past = (scene as { hotspots: Array<{ id: string; chapter: string }> }).hotspots.filter((h) => h.chapter === 'past');
    expect(past.length).toBeGreaterThan(0);
    const claimed = Object.values(THREAD_PINS).flat();
    expect(new Set(claimed).size).toBe(claimed.length);
    for (const h of past) expect(threadOf(h.id), h.id).not.toBeNull();
    for (const id of claimed) expect(past.some((h) => h.id === id), id).toBe(true);
  });
});
