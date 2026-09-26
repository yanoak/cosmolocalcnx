import { describe, expect, it } from 'vitest';
import { inWalkOrder, tourStep, type TourState } from '@/engine/keytour';

const stem = (stop: number, stops = 3): TourState => ({ mode: 'stem', stop, stops, pins: ['a', 'b', 'c'], open: null });
const bowl = (open: string | null, pins: string[] = ['a', 'b', 'c']): TourState => ({ mode: 'explore', stop: 2, stops: 3, pins, open });

describe('tourStep', () => {
  it('steps through the stem stops both ways', () => {
    expect(tourStep(stem(0), 1)).toEqual({ kind: 'stop', index: 1 });
    expect(tourStep(stem(1), -1)).toEqual({ kind: 'stop', index: 0 });
  });

  it('does nothing above the first stop', () => {
    expect(tourStep(stem(0), -1)).toBeNull();
  });

  it('opens the bowl on the first pin past the last stop', () => {
    expect(tourStep(stem(2), 1)).toEqual({ kind: 'explore', pin: 'a' });
  });

  it('opens the bowl with nothing open when the chapter has no pins', () => {
    expect(tourStep({ ...stem(2), pins: [] }, 1)).toEqual({ kind: 'explore', pin: null });
  });

  it('opens the pins one after another in order', () => {
    expect(tourStep(bowl(null), 1)).toEqual({ kind: 'pin', id: 'a' });
    expect(tourStep(bowl('a'), 1)).toEqual({ kind: 'pin', id: 'b' });
    expect(tourStep(bowl('b'), 1)).toEqual({ kind: 'pin', id: 'c' });
  });

  it('stops at the last pin', () => {
    expect(tourStep(bowl('c'), 1)).toBeNull();
  });

  it('retraces: previous pin, then closes the first, then back onto the last card', () => {
    expect(tourStep(bowl('c'), -1)).toEqual({ kind: 'pin', id: 'b' });
    expect(tourStep(bowl('a'), -1)).toEqual({ kind: 'pin', id: null });
    expect(tourStep(bowl(null), -1)).toEqual({ kind: 'stem', index: 2 });
  });

  it('treats an open pin that has left the list as none open', () => {
    expect(tourStep(bowl('gone'), 1)).toEqual({ kind: 'pin', id: 'a' });
    expect(tourStep(bowl('gone'), -1)).toEqual({ kind: 'stem', index: 2 });
  });
});

describe('inWalkOrder', () => {
  const pins = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  it('keeps the given order when there is no walk', () => {
    expect(inWalkOrder(pins).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('follows the walk, and puts pins it does not name after it', () => {
    expect(inWalkOrder(pins, ['c', 'a']).map((p) => p.id)).toEqual(['c', 'a', 'b', 'd']);
  });
  it('skips walk ids that are not on screen', () => {
    expect(inWalkOrder(pins.slice(0, 2), ['c', 'b', 'a']).map((p) => p.id)).toEqual(['b', 'a']);
  });
});
