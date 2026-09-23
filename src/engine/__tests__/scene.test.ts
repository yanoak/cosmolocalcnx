import { describe, expect, it } from 'vitest';
import { validateCopyJoin, validateScene } from '@/engine/scene';

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
      chapter: 'futures',
      view: 'city',
      target: 'osm/way/1',
      at: [1, 2],
    } as never);
    expect(validateScene(both).join(' ')).toMatch(/target|at/i);

    const neither = minimal();
    neither.hotspots.push({ id: 'h2', chapter: 'futures', view: 'city' } as never);
    expect(validateScene(neither).join(' ')).toMatch(/target|at/i);
  });

  it('requires at least one scenario, because 2045 is built as edits over the baseline', () => {
    const doc = minimal();
    doc.scenarios = [];
    expect(validateScene(doc).join(' ')).toMatch(/scenario/i);
  });
});

describe('the relief backdrop', () => {
  it('is optional, and null is fine', () => {
    expect(validateScene(minimal())).toEqual([]);
    expect(validateScene({ ...minimal(), relief: null })).toEqual([]);
  });

  it('needs both paths when present', () => {
    expect(
      validateScene({ ...minimal(), relief: { field: 'wat-ket.relief.png', meta: 'wat-ket.relief.json' } }),
    ).toEqual([]);
    expect(validateScene({ ...minimal(), relief: { field: '', meta: 'x' } })).toHaveLength(1);
    expect(validateScene({ ...minimal(), relief: { field: 'x' } as never })).toHaveLength(1);
  });

  it('does not loosen the terrain rule', () => {
    expect(validateScene({ ...minimal(), terrain: {} as never })).toContainEqual(
      expect.stringContaining('terrain must be null'),
    );
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

/**
 * Hotspots carry a chapter, 24 Sep 2026. A view is a timeless substrate plus a
 * period-bearing overlay; hotspots are overlay; so a hotspot must say which period it
 * belongs to. This is the substrate/overlay rule made checkable at the data level.
 */
describe('hotspots and chapters', () => {
  const at = (extra: object) => ({ id: 'h', at: [10, 20], ...extra }) as never;

  it('rejects a hotspot without a chapter', () => {
    const doc = minimal();
    doc.hotspots.push(at({ view: 'valley' }));
    expect(validateScene(doc).join(' ')).toMatch(/chapter/i);
  });

  it('rejects a chapter that is not one of the three', () => {
    const doc = minimal();
    doc.hotspots.push(at({ chapter: 'yesterday', view: 'valley' }));
    expect(validateScene(doc).join(' ')).toMatch(/chapter/i);
  });

  it('rejects a view the chapter does not use — Past has no city', () => {
    const doc = minimal();
    doc.hotspots.push(at({ chapter: 'past', view: 'city' }));
    expect(validateScene(doc).join(' ')).toMatch(/view/i);
  });

  it('accepts the valley in both chapters that use it, and the city in Futures', () => {
    for (const [chapter, view] of [['past', 'valley'], ['futures', 'valley'], ['futures', 'city'], ['present', 'circle']]) {
      const doc = minimal();
      doc.hotspots.push(at({ chapter, view }));
      expect(validateScene(doc), `${chapter}/${view}`).toEqual([]);
    }
  });

  it('requires a scenario hotspot to be futures — a scenario IS a future', () => {
    const doc = minimal();
    doc.scenarios[0].hotspots.push(at({ chapter: 'past', view: 'valley' }));
    expect(validateScene(doc).join(' ')).toMatch(/futures/i);
  });

  it('lets label and body be absent, because the copy doc is authoritative for them', () => {
    const doc = minimal();
    doc.hotspots.push(at({ chapter: 'futures', view: 'city', icon: 'shed' }));
    expect(validateScene(doc)).toEqual([]);
  });
});

/**
 * The join between the scene document (coordinates, icons, views) and the copy doc
 * (labels, blurbs, bodies) is by id. A hotspot on one side with nothing on the other is a
 * build error, not a silent gap — that is the promise the copy plan makes to the writer.
 */
describe('validateCopyJoin', () => {
  const doc = () => {
    const d = minimal();
    d.hotspots.push({ id: 'station', chapter: 'past', view: 'valley', at: [1, 1] } as never);
    d.hotspots.push({ id: 'wua-lai', chapter: 'futures', view: 'city', at: [2, 2] } as never);
    return d;
  };
  const copy = (ids: Record<string, string[]>) =>
    Object.fromEntries(Object.entries(ids).map(([c, list]) => [c, { hotspots: list.map((id) => ({ id })) }]));

  it('is silent when every hotspot has copy and every copy has a hotspot', () => {
    expect(validateCopyJoin(doc(), copy({ past: ['station'], futures: ['wua-lai'] }))).toEqual([]);
  });

  it('names a hotspot that has coordinates but no copy', () => {
    const out = validateCopyJoin(doc(), copy({ past: ['station'], futures: [] }));
    expect(out.join(' ')).toMatch(/wua-lai/);
    expect(out.join(' ')).toMatch(/no copy/i);
  });

  it('names copy that has no hotspot to land on', () => {
    const out = validateCopyJoin(doc(), copy({ past: ['station', 'khun-tan'], futures: ['wua-lai'] }));
    expect(out.join(' ')).toMatch(/khun-tan/);
    expect(out.join(' ')).toMatch(/no hotspot/i);
  });

  it('joins within a chapter, so the same id in two chapters is two things', () => {
    const d = doc();
    d.hotspots.push({ id: 'station', chapter: 'futures', view: 'valley', at: [3, 3] } as never);
    const out = validateCopyJoin(d, copy({ past: ['station'], futures: ['wua-lai'] }));
    expect(out.join(' ')).toMatch(/futures.*station|station.*futures/);
  });

  it('treats a chapter with no copy tab as having no copy, not as an error in itself', () => {
    expect(validateCopyJoin(minimal(), {})).toEqual([]);
  });
});
