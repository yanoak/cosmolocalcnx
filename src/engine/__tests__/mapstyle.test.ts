import { describe, expect, it } from 'vitest';
import {
  CELLS_LAYER,
  MAX_CELL_HEIGHT_M,
  RING_LAYER,
  basemapLayers,
  cellColour,
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
  const style = presentStyle('pmtiles://basemap', 'pmtiles://cells', 3400);

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
    expect(ids.indexOf(CELLS_LAYER)).toBeGreaterThan(ids.indexOf('earth'));
    expect(ids.indexOf(RING_LAYER)).toBeGreaterThan(ids.indexOf(CELLS_LAYER));
  });

  it('extrudes to 400 km at the densest cell', () => {
    expect(MAX_CELL_HEIGHT_M).toBe(400_000);
  });

  it('colours a cell by its ramp position inside the ring and recedes it outside', () => {
    const expr = cellColour(1000) as unknown[];
    expect(expr[0]).toBe('case');
    expect(JSON.stringify(expr[1])).toContain('"d"');
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
