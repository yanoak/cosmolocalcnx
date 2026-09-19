import { describe, expect, it } from 'vitest';
import {
  MAX_HEIGHT_M,
  MAX_OBSERVED_HEIGHT_M,
  MAX_TAGGED_HEIGHT_M,
  MIN_HEIGHT_M,
  OBSERVED_MIN_PIXELS,
  OBSERVED_MIN_PRESENCE,
  acceptObservation,
  footprintArea,
  hash32,
  resolveHeight,
  synthesiseHeight,
  unitFromId,
} from '../synth';
import type { Point2 } from '../extrude';

const rect = (w: number, d: number): Point2[] => [
  [0, 0],
  [w, 0],
  [w, d],
  [0, d],
];

/** A spread of ids and areas, to assert properties over the population rather than one case. */
const POPULATION = Array.from({ length: 400 }, (_, i) => ({
  id: `osm/way/${1000 + i * 37}`,
  areaM2: 12 + ((i * 91) % 900),
  kind: ['residential', 'commercial', 'civic', 'temple', 'industrial', 'shed'][i % 6],
}));

describe('hash32', () => {
  it('is stable for a given string', () => {
    // Pinned literally. If this ever changes, every height in every committed scene
    // document changed with it — which is the failure this module exists to prevent.
    expect(hash32('osm/way/12345')).toBe(hash32('osm/way/12345'));
    expect(hash32('')).toBe(0x811c9dc5);
  });

  it('separates ids that differ by one character', () => {
    expect(hash32('osm/way/12345')).not.toBe(hash32('osm/way/12346'));
  });

  it('yields a unit value in [0, 1)', () => {
    for (const { id } of POPULATION) {
      const u = unitFromId(id);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });
});

describe('synthesiseHeight', () => {
  it('always yields the same height for the same OSM id', () => {
    // The property the whole pipeline rests on: a re-import in November must not
    // reshuffle the skyline. See docs/architecture.md, "Edits snapshot what they
    // point at".
    for (const { id, areaM2, kind } of POPULATION) {
      const first = synthesiseHeight(id, areaM2, kind);
      expect(synthesiseHeight(id, areaM2, kind)).toBe(first);
      expect(synthesiseHeight(id, areaM2, kind)).toBe(first);
    }
  });

  it('gives different ids different heights, rather than one flat default', () => {
    const heights = new Set(
      POPULATION.filter((p) => p.kind === 'residential').map((p) =>
        synthesiseHeight(p.id, p.areaM2, p.kind),
      ),
    );
    // A spreadsheet would produce one value. Anything above a handful is a skyline.
    expect(heights.size).toBeGreaterThan(3);
  });

  it('makes a larger footprint taller, kind held constant', () => {
    // Same id, so the jitter term is identical and only area moves.
    for (const kind of ['residential', 'commercial', 'civic']) {
      const small = synthesiseHeight('osm/way/999', 30, kind);
      const large = synthesiseHeight('osm/way/999', 900, kind);
      expect(large).toBeGreaterThan(small);
    }
  });

  it('is monotonic in area, never dipping as the footprint grows', () => {
    let previous = 0;
    for (let area = 10; area <= 2000; area += 10) {
      const h = synthesiseHeight('osm/way/4242', area, 'residential');
      expect(h).toBeGreaterThanOrEqual(previous);
      previous = h;
    }
  });

  it('keeps every result finite, positive and in a plausible band', () => {
    for (const { id, areaM2, kind } of POPULATION) {
      const h = synthesiseHeight(id, areaM2, kind);
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(MIN_HEIGHT_M);
      expect(h).toBeLessThanOrEqual(MAX_HEIGHT_M);
    }
  });

  it('survives a degenerate area rather than emitting NaN', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const h = synthesiseHeight('osm/way/1', bad, 'residential');
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(MIN_HEIGHT_M);
    }
  });

  it('treats an unknown kind as the default rather than throwing', () => {
    expect(synthesiseHeight('osm/way/7', 100, 'yurt')).toBe(
      synthesiseHeight('osm/way/7', 100, 'default'),
    );
  });
});

describe('resolveHeight', () => {
  const at = { id: 'osm/way/12345', areaM2: 120, kind: 'residential' };

  it('lets an explicit height tag win over everything', () => {
    expect(resolveHeight({ height: '9.6', 'building:levels': '5' }, at)).toEqual({
      height: 9.6,
      from: 'height',
    });
  });

  it('parses a height carrying units', () => {
    expect(resolveHeight({ height: '12 m' }, at).height).toBe(12);
  });

  it('uses building:levels over synthesis, but loses to height', () => {
    expect(resolveHeight({ 'building:levels': '3' }, at)).toEqual({
      height: 9.6,
      from: 'levels',
    });
    expect(resolveHeight({ height: '5', 'building:levels': '3' }, at).from).toBe('height');
  });

  it('falls through to synthesis when neither tag is present', () => {
    const resolved = resolveHeight({}, at);
    expect(resolved.from).toBe('synth');
    expect(resolved.height).toBe(synthesiseHeight(at.id, at.areaM2, at.kind));
  });

  it('falls through to synthesis on an unparseable tag rather than producing NaN', () => {
    for (const junk of ['about three', '', 'tall', '-4', '0']) {
      const resolved = resolveHeight({ height: junk }, at);
      expect(resolved.from).toBe('synth');
      expect(Number.isFinite(resolved.height)).toBe(true);
    }
  });

  describe('observed heights', () => {
    const good = { height: 14.36, presence: 0.8, px: 120 };

    it('sit between tags and synthesis', () => {
      expect(resolveHeight({}, { ...at, observed: good })).toEqual({ height: 14.36, from: 'observed' });
      expect(resolveHeight({ 'building:levels': '2' }, { ...at, observed: good }).from).toBe('levels');
      expect(resolveHeight({ height: '9' }, { ...at, observed: good }).from).toBe('height');
    });

    it('are clamped to the observed ceiling, which is below the tagged one', () => {
      expect(MAX_OBSERVED_HEIGHT_M).toBeLessThan(MAX_TAGGED_HEIGHT_M);
      expect(MAX_OBSERVED_HEIGHT_M).toBeGreaterThan(MAX_HEIGHT_M);
      const tall = resolveHeight({}, { ...at, observed: { ...good, height: 400 } });
      expect(tall).toEqual({ height: MAX_OBSERVED_HEIGHT_M, from: 'observed' });
      const low = resolveHeight({}, { ...at, observed: { ...good, height: 0.4 } });
      expect(low).toEqual({ height: MIN_HEIGHT_M, from: 'observed' });
    });

    it('are ignored when too little of the footprint reads as building', () => {
      expect(acceptObservation({ ...good, presence: OBSERVED_MIN_PRESENCE - 0.01 })).toBe(false);
      expect(acceptObservation({ ...good, presence: OBSERVED_MIN_PRESENCE })).toBe(true);
      expect(acceptObservation({ ...good, px: OBSERVED_MIN_PIXELS - 1 })).toBe(false);
      expect(acceptObservation({ ...good, px: OBSERVED_MIN_PIXELS })).toBe(true);
      expect(acceptObservation({ ...good, height: Number.NaN })).toBe(false);
      expect(acceptObservation({ ...good, height: 0 })).toBe(false);
      expect(acceptObservation(null)).toBe(false);
      expect(acceptObservation(undefined)).toBe(false);
      expect(resolveHeight({}, { ...at, observed: { ...good, presence: 0.05 } }).from).toBe('synth');
    });
  });

  it('clamps an absurd tagged height instead of trusting it', () => {
    expect(resolveHeight({ height: '3000' }, at).height).toBe(MAX_TAGGED_HEIGHT_M);
    expect(resolveHeight({ 'building:levels': '400' }, at).height).toBe(MAX_TAGGED_HEIGHT_M);
    expect(resolveHeight({ height: '0.4' }, at).height).toBe(MIN_HEIGHT_M);
  });

  it('trusts a tagged tower well above what synthesis may invent', () => {
    // Supalai Monte, on the east bank, really is tagged height=111. Clamping it to
    // the synthesis ceiling would delete the tallest building in the district.
    expect(resolveHeight({ height: '111', 'building:levels': '32' }, at).height).toBe(111);
    expect(resolveHeight({ 'building:levels': '12' }, at).height).toBeGreaterThan(MAX_HEIGHT_M);
  });
});

describe('footprintArea', () => {
  it('measures a rectangle regardless of winding', () => {
    expect(footprintArea(rect(10, 6))).toBeCloseTo(60);
    expect(footprintArea([...rect(10, 6)].reverse())).toBeCloseTo(60);
  });
});
