/**
 * The Present chapter's map style — the basemap in the design tokens, the population
 * cells, and the ring. Pure: it returns a MapLibre style object and touches no DOM, so
 * `mapstyle.test.ts` can assert the one rule that matters here, which is the same rule
 * `theme.ts` has always had: **nothing names a raw colour.** Every colour in the emitted
 * style resolves to a token, so the map is ours rather than a stock basemap with our
 * data on it, and a palette change reaches the map the way it reaches the diorama.
 *
 * The basemap is a Protomaps extract (`scripts/fetch-basemap.sh`), styled with
 * `@protomaps/basemaps`' `layers()` against a Flavor built entirely from tokens.
 * **No symbol layers.** MapLibre draws text from glyph PBFs it fetches per font range,
 * and self-hosting a font stack is a second asset pipeline; the piece already labels
 * cities from its own file as DOM over the canvas, and keeps doing that on the map with
 * `Marker`s. Country and sea names can come later with glyphs — see the plan.
 *
 * See plans/2026-09-24_present-on-maplibre.plan.md.
 */

import { layers, type Flavor } from '@protomaps/basemaps';
import type { FeatureCollection } from 'geojson';
import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
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
} from './theme';

export const BASEMAP_SOURCE = 'basemap';
export const CELLS_SOURCE = 'cells';

/**
 * One resolution of the cells pyramid, as `scripts/build-cells.py` records it in the
 * sidecar: the source-layer's name and the zooms it was cut for. The style draws one
 * fill-extrusion layer per level, so the map is coarse from far out and dense close in.
 */
export interface CellsLevel {
  layer: string;
  minzoom: number;
  maxzoom: number;
}

/** The style layer id for a level. */
export const cellsLayerId = (level: CellsLevel) => `cells-${level.layer}`;
export const RING_SOURCE = 'ring';
export const RING_LAYER = 'ring';
export const ANCHOR_SOURCE = 'anchor';
export const ANCHOR_LAYER = 'anchor';

/**
 * How tall the densest cell is, in metres — MapLibre extrudes in metres — BY ZOOM. From
 * the fit the field should read as the smooth density map it was as a flat plane, with
 * the cities just standing off it; close in the columns can rise. 400 km at the top,
 * as the three.js columns were.
 */
export const MAX_CELL_HEIGHT_M = 400_000;

/**
 * `h` times a ceiling that rises with zoom. MapLibre allows `zoom` only as the input of
 * a top-level interpolate, so the multiplication sits inside each stop rather than
 * around the whole thing.
 */
export function cellHeight(): ExpressionSpecification {
  const at = (metres: number): ExpressionSpecification => ['*', ['get', 'h'], metres];
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    3,
    at(60_000),
    5,
    at(200_000),
    7,
    at(MAX_CELL_HEIGHT_M),
  ] as ExpressionSpecification;
}

/**
 * The basemap's Flavor, from tokens.
 *
 * Land is Warm White — the diorama's ground — so the two chapters read as one
 * material; water is the water role; parks and woods are the park green and quieter
 * greens off it; roads are the road tones; boundaries the muted ink. The label
 * colours are set too, though no symbol layer is emitted: a Flavor requires them.
 */
export function presentFlavor(): Flavor {
  const ground = GROUND.ground;
  const green = GROUND.green;
  const water = SURFACE_ROLES.water.side;
  const muted = REGISTERS.page.muted;
  const ink = REGISTERS.page.ink;
  const quietGreen = mix(green, ground, 0.45);
  const scrub = mix(green, ground, 0.6);
  const sand = shiftLightness(ground, -0.05, +0.02);
  const road = ROAD_TONES.street;
  const roadMajor = ROAD_TONES.major;
  const casing = mix(roadMajor, ground, 0.5);
  const built = mix(PALETTE['cosmo.lilac'], ground, 0.7);
  return {
    background: PALETTE_EXTENDED['cosmo.offWhite'],
    earth: ground,
    park_a: green,
    park_b: quietGreen,
    hospital: ground,
    industrial: sand,
    school: ground,
    wood_a: quietGreen,
    wood_b: quietGreen,
    pedestrian: sand,
    scrub_a: scrub,
    scrub_b: scrub,
    glacier: PALETTE_EXTENDED['cosmo.offWhite'],
    sand,
    beach: sand,
    aerodrome: sand,
    runway: road,
    water,
    zoo: green,
    military: sand,
    tunnel_other_casing: casing,
    tunnel_minor_casing: casing,
    tunnel_link_casing: casing,
    tunnel_major_casing: casing,
    tunnel_highway_casing: casing,
    tunnel_other: road,
    tunnel_minor: road,
    tunnel_link: road,
    tunnel_major: roadMajor,
    tunnel_highway: roadMajor,
    pier: sand,
    buildings: built,
    minor_service_casing: casing,
    minor_casing: casing,
    link_casing: casing,
    major_casing_late: casing,
    highway_casing_late: casing,
    other: road,
    minor_service: road,
    minor_a: road,
    minor_b: road,
    link: road,
    major_casing_early: casing,
    major: roadMajor,
    highway_casing_early: casing,
    highway: roadMajor,
    railway: muted,
    boundaries: muted,
    bridges_other_casing: casing,
    bridges_minor_casing: casing,
    bridges_link_casing: casing,
    bridges_major_casing: casing,
    bridges_highway_casing: casing,
    bridges_other: road,
    bridges_minor: road,
    bridges_link: road,
    bridges_major: roadMajor,
    bridges_highway: roadMajor,
    roads_label_minor: muted,
    roads_label_minor_halo: ground,
    roads_label_major: ink,
    roads_label_major_halo: ground,
    ocean_label: muted,
    subplace_label: muted,
    subplace_label_halo: ground,
    city_label: ink,
    city_label_halo: ground,
    state_label: muted,
    state_label_halo: ground,
    country_label: muted,
    address_label: muted,
    address_label_halo: ground,
    landcover: {
      barren: sand,
      farmland: mix(green, ground, 0.75),
      forest: quietGreen,
      glacier: PALETTE_EXTENDED['cosmo.offWhite'],
      grassland: mix(green, ground, 0.65),
      scrub,
      urban_area: built,
    },
  };
}

/** The basemap's layers, without text. */
export function basemapLayers(source: string = BASEMAP_SOURCE): LayerSpecification[] {
  return layers(source, presentFlavor(), { lang: 'en' }).filter((l) => l.type !== 'symbol');
}

/**
 * The colour of a cell's top, from its `t` through the population ramp — the same
 * stops `fieldToRgba` and the columns used, as a MapLibre interpolate expression.
 */
export function rampExpression(): ExpressionSpecification {
  const stops = POPULATION_RAMP.flatMap((hex, i) => [i / (POPULATION_RAMP.length - 1), hex]);
  return ['interpolate', ['linear'], ['get', 't'], ...stops] as ExpressionSpecification;
}

/** A cell's colour given the ring: the ramp inside, receded toward the ground outside. */
export function cellColour(ringKm: number): ExpressionSpecification {
  const outside = POPULATION_RAMP.map((hex) => mix(hex, GROUND.ground, 0.55));
  const stopsOut = outside.flatMap((hex, i) => [i / (outside.length - 1), hex]);
  return [
    'case',
    ['<=', ['get', 'd'], ringKm],
    rampExpression(),
    ['interpolate', ['linear'], ['get', 't'], ...stopsOut],
  ] as ExpressionSpecification;
}

/** The cells as extrusions, one layer per level. Height in metres from `h`; colour from `t` and the ring. */
export function cellsLayers(ringKm: number, levels: readonly CellsLevel[]): LayerSpecification[] {
  return levels.map((level) => ({
    id: cellsLayerId(level),
    type: 'fill-extrusion',
    source: CELLS_SOURCE,
    'source-layer': level.layer,
    minzoom: level.minzoom,
    // A layer's maxzoom is exclusive; the tiles overzoom past the last level's cut.
    maxzoom: level === levels[levels.length - 1] ? 24 : level.maxzoom + 1,
    paint: {
      'fill-extrusion-color': cellColour(ringKm),
      'fill-extrusion-height': cellHeight(),
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 1,
    },
  }));
}

/** The ring's tone: the accent up to the claim, the muted ink beyond it. */
export function ringColour(ringKm: number, claimKm: number): string {
  return ringKm > claimKm * 1.001 ? REGISTERS.page.muted : UI_TOKENS['ui.accent'];
}

export function ringLayer(ringKm: number, claimKm: number): LayerSpecification {
  return {
    id: RING_LAYER,
    type: 'line',
    source: RING_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ringColour(ringKm, claimKm), 'line-width': 2.5 },
  };
}

/** The "you are here" ring at Wat Ket, in the accent. */
export function anchorLayer(): LayerSpecification {
  return {
    id: ANCHOR_LAYER,
    type: 'circle',
    source: ANCHOR_SOURCE,
    paint: {
      'circle-radius': 6,
      'circle-color': PALETTE_EXTENDED['cosmo.offWhite'],
      'circle-stroke-color': UI_TOKENS['ui.accent'],
      'circle-stroke-width': 3,
    },
  };
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * The whole style. `basemapUrl` and `cellsUrl` are `pmtiles://…` URLs; the page
 * registers the protocol once. Flat — Mercator, MapLibre's default — since Yan asked
 * for it on 24 Sep 2026: the ring is still a circle of true distance, which on this
 * projection bulges northward, and that is the honest shape of 3,400 km here. The ring and the anchor start empty and are filled by
 * the map component, which owns the only mutable state — the ring's radius.
 */
export function presentStyle(
  basemapUrl: string,
  cellsUrl: string,
  claimKm: number,
  levels: readonly CellsLevel[],
): StyleSpecification {
  return {
    version: 8,
    sources: {
      [BASEMAP_SOURCE]: {
        type: 'vector',
        url: basemapUrl,
        attribution: '© OpenStreetMap contributors, Protomaps',
      },
      [CELLS_SOURCE]: { type: 'vector', url: cellsUrl },
      [RING_SOURCE]: { type: 'geojson', data: EMPTY },
      [ANCHOR_SOURCE]: { type: 'geojson', data: EMPTY },
    },
    layers: [...basemapLayers(), ...cellsLayers(0, levels), ringLayer(0, claimKm), anchorLayer()],
  };
}

/** Every hex colour string in a style, for the test that says they are all tokens. */
export function coloursIn(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    if (/^#[0-9a-f]{6}$/i.test(value)) out.add(value.toUpperCase());
  } else if (Array.isArray(value)) {
    for (const v of value) coloursIn(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) coloursIn(v, out);
  }
  return out;
}
