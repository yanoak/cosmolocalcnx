import { describe, expect, it } from 'vitest';
import { validateScene } from '@/engine/scene';

const minimal = () => ({
  id: 'wat-ket',
  origin: [18.7912, 99.0043] as [number, number],
  boundary: { type: 'Polygon', coordinates: [] },
  baseline: { buildings: [], roads: [], water: [], green: [] },
  scenarios: [
    {
      id: 'commons-2045',
      label: { en: 'Riverside Commons' },
      edits: [],
      hotspots: [],
    },
  ],
  hotspots: [],
  terrain: null,
});

describe('validateScene', () => {
  it('accepts a minimal document', () => {
    expect(validateScene(minimal())).toEqual([]);
  });

  it('accepts terrain: null and rejects a populated terrain', () => {
    const doc = minimal();
    // Deliberately violating the type — the point of the runtime check is to catch
    // data that never went through the compiler, e.g. a hand-edited scene file.
    (doc as unknown as { terrain: unknown }).terrain = { heightmap: 'anything' };
    expect(validateScene(doc).join(' ')).toMatch(/terrain/i);
  });

  it('rejects an unknown edit op', () => {
    const doc = minimal();
    doc.scenarios[0].edits.push({ op: 'explode', target: 'osm/way/1' } as never);
    expect(validateScene(doc).join(' ')).toMatch(/op/i);
  });

  it('rejects an edit carrying a date, so the cut time slider cannot return via data', () => {
    const doc = minimal();
    doc.scenarios[0].edits.push({
      op: 'remove',
      target: 'osm/way/1',
      year: 2035,
    } as never);
    expect(validateScene(doc).join(' ')).toMatch(/year|date/i);
  });

  it('accepts wasAt on remove and replace', () => {
    const doc = minimal();
    doc.scenarios[0].edits.push({
      op: 'remove',
      target: 'osm/way/1',
      wasAt: [80, -12],
    } as never);
    expect(validateScene(doc)).toEqual([]);
  });

  it('requires a hotspot to carry exactly one of target or at', () => {
    const both = minimal();
    both.hotspots.push({
      id: 'h1',
      target: 'osm/way/1',
      at: [1, 2],
      label: { en: 'x' },
      body: { en: 'y' },
    } as never);
    expect(validateScene(both).join(' ')).toMatch(/target|at/i);

    const neither = minimal();
    neither.hotspots.push({ id: 'h2', label: { en: 'x' }, body: { en: 'y' } } as never);
    expect(validateScene(neither).join(' ')).toMatch(/target|at/i);
  });

  it('requires at least one scenario, because the toggle is the whole interaction', () => {
    const doc = minimal();
    doc.scenarios = [];
    expect(validateScene(doc).join(' ')).toMatch(/scenario/i);
  });
});

describe('the region register', () => {
  const VALERIEPIERIS = {
    projection: { kind: 'aeqd' as const, centre: [21.0, 100.29] as [number, number], radiusKm: 3437 },
    field: 'regions/aeqd_21.000_100.290_r3437_n512.png',
    meta: 'regions/aeqd_21.000_100.290_r3437_n512.json',
  };

  /** A second neighbourhood has no population field until someone builds one. */
  it('is optional — a scene without one is valid', () => {
    expect(validateScene(minimal())).toEqual([]);
    expect(validateScene({ ...minimal(), region: null })).toEqual([]);
  });

  it('accepts Wat Ket inside the Valeriepieris circle', () => {
    const doc = { ...minimal(), origin: [18.7912, 99.0043], region: VALERIEPIERIS };
    expect(validateScene(doc as never)).toEqual([]);
  });

  it('rejects a projection that would make the circle an ellipse', () => {
    const doc = {
      ...minimal(),
      origin: [18.7912, 99.0043],
      region: { ...VALERIEPIERIS, projection: { ...VALERIEPIERIS.projection, kind: 'mercator' } },
    };
    expect(validateScene(doc as never).join(' ')).toMatch(/must be "aeqd"/);
  });

  /**
   * Silent otherwise, and fatal: a district outside its own circle has nowhere for
   * the handover to land.
   */
  it('rejects a scene whose origin falls outside its own circle, and says by how far', () => {
    const doc = { ...minimal(), origin: [51.5, -0.12], region: VALERIEPIERIS }; // London
    const problems = validateScene(doc as never).join(' ');
    expect(problems).toMatch(/outside its own/);
    expect(problems).toMatch(/km from the circle centre/);
  });

  it('rejects a radius that folds through the antipode', () => {
    for (const radiusKm of [0, -1, 25_000]) {
      const doc = {
        ...minimal(),
        origin: [18.7912, 99.0043],
        region: { ...VALERIEPIERIS, projection: { ...VALERIEPIERIS.projection, radiusKm } },
      };
      expect(validateScene(doc as never).join(' ')).toMatch(/radiusKm must be/);
    }
  });
});
