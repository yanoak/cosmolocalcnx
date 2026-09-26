import { describe, expect, it } from 'vitest';
import {
  MAX_CELL_HEIGHT_M,
  RING_LAYER,
  basemapLayers,
  cellColour,
  cellsLayerId,
  cellsLayers,
  coloursIn,
  presentFlavor,
  presentStyle,
  ringColour,
} from '../mapstyle';
import {
  GROUND,
  PALETTE,
  PALETTE_EXTENDED,
  POPULATION_RAMP,
  REGISTERS,
  ROAD_TONES,
  SURFACE_ROLES,
  UI_TOKENS,
  mix,
  shiftLightness,
} from '../theme';

/** Every colour the theme can produce for the map: tokens, and the derivations the style names. */
function tokenColours(): Set<string> {
  const out = new Set<string>();
  const add = (hex: string) => out.add(hex.toUpperCase());
  for (const v of Object.values(PALETTE)) add(v);
  for (const v of Object.values(PALETTE_EXTENDED)) add(v);
  for (const v of Object.values(GROUND)) add(v);
  for (const v of Object.values(ROAD_TONES)) add(v);
  for (const v of Object.values(UI_TOKENS)) add(v);
  for (const r of Object.values(SURFACE_ROLES)) for (const v of Object.values(r)) add(v);
  for (const r of Object.values(REGISTERS)) for (const v of Object.values(r)) add(v);
  for (const v of POPULATION_RAMP) add(v);
  // The style's own derivations, all through theme.ts functions.
  const green = GROUND.green;
  const ground = GROUND.ground;
  for (const a of [0.45, 0.6, 0.65, 0.75]) add(mix(green, ground, a));
  add(shiftLightness(ground, -0.05, +0.02));
  add(mix(ROAD_TONES.major, ground, 0.5));
  add(mix(PALETTE['cosmo.lilac'], ground, 0.7));
  for (const hex of POPULATION_RAMP) add(mix(hex, ground, 0.55));
  return out;
}

describe('the map style', () => {
  const LEVELS = [
    { layer: 'cells_050', minzoom: 2, maxzoom: 2 },
    { layer: 'cells_025', minzoom: 3, maxzoom: 3 },
    { layer: 'cells_0125', minzoom: 4, maxzoom: 8 },
  ];
  const style = presentStyle('pmtiles://basemap', 'pmtiles://cells', 3400, LEVELS);

  it('names no colour that is not a token or a derivation of one', () => {
    const allowed = tokenColours();
    const used = coloursIn(style);
    const strays = [...used].filter((c) => !allowed.has(c));
    expect(strays, `raw colours in the style: ${strays.join(', ')}`).toEqual([]);
    expect(used.size).toBeGreaterThan(5);
  });

  it('has no symbol layers — there are no glyphs to draw them with', () => {
    expect(style.layers.every((l) => l.type !== 'symbol')).toBe(true);
    expect(basemapLayers().length).toBeGreaterThan(10);
  });

  it('draws the cells over the basemap and the ring over the cells', () => {
    const ids = style.layers.map((l) => l.id);
    for (const level of LEVELS) {
      expect(ids.indexOf(cellsLayerId(level))).toBeGreaterThan(ids.indexOf('earth'));
      expect(ids.indexOf(RING_LAYER)).toBeGreaterThan(ids.indexOf(cellsLayerId(level)));
    }
  });

  it('cuts one layer per level, each for its own zooms, with the last overzooming', () => {
    const layers = cellsLayers(LEVELS) as Array<{ 'source-layer'?: string; minzoom?: number; maxzoom?: number }>;
    expect(layers.map((l) => l['source-layer'])).toEqual(['cells_050', 'cells_025', 'cells_0125']);
    expect(layers.map((l) => l.minzoom)).toEqual([2, 3, 4]);
    expect(layers[0].maxzoom).toBe(3);
    expect(layers[2].maxzoom).toBe(24);
  });

  it('extrudes to 400 km at the densest cell', () => {
    expect(MAX_CELL_HEIGHT_M).toBe(400_000);
  });

  it('colours a cell by feature-state, so the ring never changes the expression', () => {
    const expr = cellColour() as unknown[];
    expect(expr[0]).toBe('case');
    expect(JSON.stringify(expr[1])).toContain('feature-state');
    expect(JSON.stringify(expr)).not.toContain('"d"');
  });

  it('turns the ring muted past the claim', () => {
    expect(ringColour(3000, 3400)).toBe(UI_TOKENS['ui.accent']);
    expect(ringColour(3500, 3400)).toBe(REGISTERS.page.muted);
  });

  it('builds a complete flavour — every field a colour', () => {
    const f = presentFlavor() as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(f)) {
      if (k === 'landcover' || k === 'pois') continue;
      expect(typeof v, k).toBe('string');
    }
  });
});

import { legendStops } from '@/engine/mapstyle';
import { POPULATION_RAMP as RAMP } from '@/engine/theme';

describe('legendStops', () => {
  it('has one swatch per ramp stop, in ramp order, from empty to the densest cell', () => {
    const stops = legendStops(47_499);
    expect(stops.map((s) => s.colour)).toEqual([...RAMP]);
    expect(stops[0].perKm2).toBe(0);
    expect(stops[stops.length - 1].perKm2).toBe(47_000);
  });
  it('inverts the log ramp build-cells.py writes', () => {
    // t = 0.5 is the geometric middle: sqrt(47,500) − 1 ≈ 217.
    expect(legendStops(47_499)[2].perKm2).toBe(220);
  });
  it('rises monotonically', () => {
    const d = legendStops(47_499).map((s) => s.perKm2);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1]);
  });
});
