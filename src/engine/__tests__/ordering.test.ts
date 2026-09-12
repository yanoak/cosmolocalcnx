import { describe, expect, it } from 'vitest';
import { orderForAxis, step } from '@/engine/ordering';

const box = (id: string, x: number, y: number) => ({
  id,
  footprint: [
    [x, y],
    [x + 10, y],
    [x + 10, y + 10],
    [x, y + 10],
  ] as [number, number][],
});

const items = [box('north', 0, 100), box('south', 0, -100), box('east', 100, 0)];

describe('orderForAxis', () => {
  it('orders horizontally as the camera sees it, not in document order', () => {
    const ids = orderForAxis(items, 'horizontal').map((i) => i.id);
    expect(ids).toEqual(['south', 'east', 'north']);
  });

  it('orders vertically differently from horizontally', () => {
    expect(orderForAxis(items, 'vertical').map((i) => i.id)).not.toEqual(
      orderForAxis(items, 'horizontal').map((i) => i.id),
    );
  });

  it('does not mutate its input', () => {
    const before = items.map((i) => i.id);
    orderForAxis(items, 'horizontal');
    expect(items.map((i) => i.id)).toEqual(before);
  });
});

describe('step', () => {
  it('starts a selection when nothing is selected', () => {
    expect(step(items, null, 'horizontal', 1)).toBe('south');
  });

  it('moves forward and back', () => {
    expect(step(items, 'south', 'horizontal', 1)).toBe('east');
    expect(step(items, 'east', 'horizontal', -1)).toBe('south');
  });

  it('wraps rather than stalling at the ends', () => {
    expect(step(items, 'north', 'horizontal', 1)).toBe('south');
    expect(step(items, 'south', 'horizontal', -1)).toBe('north');
  });

  it('recovers if the selected id has gone', () => {
    expect(step(items, 'demolished', 'horizontal', 1)).toBe('south');
  });

  it('returns null for an empty scene rather than throwing', () => {
    expect(step([], null, 'horizontal', 1)).toBeNull();
  });
});
