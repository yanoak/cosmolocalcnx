import { describe, expect, it } from 'vitest';
import {
  availableViews,
  clampZoom,
  detailWithin,
  isAvailable,
  resolveView,
  stepView,
  VIEW_ORDER,
  VIEW_RANGE,
  viewSpec,
  type ViewId,
} from '../views';
import { DEFAULT_BLOCK_IN } from '../registers';

const ALL = { circle: true, valley: true };
const CITY_ONLY = { circle: false, valley: false };

describe('availableViews', () => {
  it('is outermost first, which is the chip order and the 1/2/3 keys', () => {
    expect(availableViews(ALL)).toEqual(['circle', 'valley', 'city']);
    expect(VIEW_ORDER).toEqual(['circle', 'valley', 'city']);
  });

  /** A second neighbourhood has a city and nothing else until the generators run. */
  it('always has the city, because the city is the scene', () => {
    expect(availableViews(CITY_ONLY)).toEqual(['city']);
    expect(isAvailable('city', CITY_ONLY)).toBe(true);
  });

  it('hides a view whose field is not committed', () => {
    expect(availableViews({ circle: true, valley: false })).toEqual(['circle', 'city']);
    expect(availableViews({ circle: false, valley: true })).toEqual(['valley', 'city']);
  });

  /** A view with nothing in it must be unreachable rather than empty. */
  it('reports an absent view as unavailable', () => {
    expect(isAvailable('valley', { circle: true, valley: false })).toBe(false);
    expect(isAvailable('circle', CITY_ONLY)).toBe(false);
  });
});

describe('viewSpec', () => {
  it('fits its subject at the fit zoom', () => {
    const spec = viewSpec('city', 0.1);
    expect(spec.fit).toBe(0.1);
    expect(spec.minZoom).toBeLessThan(spec.fit);
    expect(spec.maxZoom).toBeGreaterThan(spec.fit);
  });

  /**
   * The district-to-doorstep ratio the piece has been built around since 16 Sep. It is
   * carried over rather than re-chosen, so the city view is exactly today's range.
   */
  it("keeps the city's district-to-block ratio at the ladder's", () => {
    expect(VIEW_RANGE.city.in).toBe(DEFAULT_BLOCK_IN);
  });

  it('never emits a degenerate range from a zero-sized viewport', () => {
    const spec = viewSpec('city', 0);
    expect(spec.fit).toBe(1);
    expect(spec.minZoom).toBeGreaterThan(0);
    expect(spec.maxZoom).toBeGreaterThan(spec.minZoom);
    expect(Number.isFinite(viewSpec('valley', NaN).fit)).toBe(true);
  });

  it('gives every view a usable range', () => {
    for (const id of VIEW_ORDER) {
      const spec = viewSpec(id, 0.2);
      expect(spec.maxZoom, id).toBeGreaterThan(spec.minZoom);
    }
  });
});

describe('clampZoom — the whole mechanism of "no continuum"', () => {
  const city = viewSpec('city', 0.1);

  it('holds the camera inside the view at both ends', () => {
    expect(clampZoom(city, 1e9)).toBe(city.maxZoom);
    expect(clampZoom(city, 1e-9)).toBe(city.minZoom);
  });

  it('leaves a zoom inside the range alone', () => {
    expect(clampZoom(city, city.fit)).toBe(city.fit);
  });

  /**
   * The property that makes the views discrete: no zoom in any view lands in another
   * view's range in a way that could select it. Nothing here returns a ViewId at all —
   * the only way out of a view is the switcher.
   */
  it('never produces a zoom outside its own view', () => {
    for (const id of VIEW_ORDER) {
      const spec = viewSpec(id, 0.3);
      for (const z of [-1, 0, 1e-6, spec.minZoom, spec.fit, spec.maxZoom, 1e6, Infinity, NaN]) {
        const out = clampZoom(spec, z);
        expect(out, `${id} @ ${z}`).toBeGreaterThanOrEqual(spec.minZoom);
        expect(out, `${id} @ ${z}`).toBeLessThanOrEqual(spec.maxZoom);
      }
    }
  });

  it('falls back to the fit rather than NaN', () => {
    expect(clampZoom(city, NaN)).toBe(city.fit);
  });
});

describe('detailWithin', () => {
  const city = viewSpec('city', 0.1);

  it('is pinned at both ends of the view', () => {
    expect(detailWithin(city, city.minZoom)).toBeCloseTo(0, 12);
    expect(detailWithin(city, city.maxZoom)).toBeCloseTo(1, 12);
  });

  it('is monotone', () => {
    let previous = -1;
    for (let i = 0; i <= 50; i++) {
      const z = city.minZoom * Math.pow(city.maxZoom / city.minZoom, i / 50);
      const d = detailWithin(city, z);
      expect(d).toBeGreaterThanOrEqual(previous);
      previous = d;
    }
  });

  /** Logarithmic, because zoom is multiplicative — the midpoint is the geometric mean. */
  it('puts the geometric mean at the halfway mark', () => {
    const mid = Math.sqrt(city.minZoom * city.maxZoom);
    expect(detailWithin(city, mid)).toBeCloseTo(0.5, 9);
  });

  it('clamps rather than overshooting outside the view', () => {
    expect(detailWithin(city, 1e9)).toBeCloseTo(1, 12);
    expect(detailWithin(city, 1e-9)).toBeCloseTo(0, 12);
  });
});

describe('stepView', () => {
  it('walks the order', () => {
    expect(stepView('circle', 1, ALL)).toBe('valley');
    expect(stepView('valley', 1, ALL)).toBe('city');
    expect(stepView('city', -1, ALL)).toBe('valley');
  });

  /**
   * Does not wrap. Wrapping would put the circle one step in from a doorstep, which is
   * exactly the adjacency this change exists to remove.
   */
  it('stops at the ends rather than wrapping', () => {
    expect(stepView('city', 1, ALL)).toBeNull();
    expect(stepView('circle', -1, ALL)).toBeNull();
  });

  it('skips a view that is not there', () => {
    expect(stepView('circle', 1, { circle: true, valley: false })).toBe('city');
  });

  it('recovers from a view that is not in the list', () => {
    expect(stepView('valley', 1, CITY_ONLY)).toBe('city');
  });
});

describe('resolveView', () => {
  it('honours a view that exists', () => {
    expect(resolveView('valley', ALL)).toBe('valley');
  });

  /** The city is the only view guaranteed to have something in it. */
  it('lands on the city when the wanted view is gone or absent', () => {
    expect(resolveView('circle', CITY_ONLY)).toBe('city');
    expect(resolveView(null, ALL)).toBe('city');
  });

  it('never returns a view a scene does not have', () => {
    const has = { circle: false, valley: true };
    for (const wanted of [...VIEW_ORDER, null] as (ViewId | null)[]) {
      expect(isAvailable(resolveView(wanted, has), has)).toBe(true);
    }
  });
});
