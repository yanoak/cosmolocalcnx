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
