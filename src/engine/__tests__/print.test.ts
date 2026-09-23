import { describe, expect, it } from 'vitest';
import { encodeBinaryStl, triangleCount, type PrintSoup } from '../stl';
import {
  A1_MINI_BED_MM,
  buildModel,
  buildTile,
  cropBounds,
  DEFAULT_PRINT_OPTIONS,
  MIN_BRIDGE_MM,
  mmPerMetreFromScale,
  plateRing,
  printSummary,
  scaleDenominator,
  stlFilename,
  tileGrid,
  type PrintOptions,
  type PrintSource,
} from '../print';
import type { BaselineArea, BaselineBuilding, BaselineRoad } from '../scene';

function options(over: Partial<PrintOptions> = {}): PrintOptions {
  return { ...DEFAULT_PRINT_OPTIONS, ...over };
}

/** A 20 m square building with its south-west corner at (x, y). */
function box(id: string, x: number, y: number, height = 10, size = 20): BaselineBuilding {
  return {
    id,
    footprint: [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
    ],
    height,
    kind: 'residential',
  };
}

const EMPTY: PrintSource = { buildings: [], roads: [], water: [], green: [] };

describe('scale', () => {
  it('reads as a model-maker’s ratio and back', () => {
    expect(scaleDenominator(0.14)).toBeCloseTo(7142.857, 3);
    expect(mmPerMetreFromScale(7142.857)).toBeCloseTo(0.14, 6);
    expect(scaleDenominator(mmPerMetreFromScale(5000))).toBeCloseTo(5000, 9);
  });
});

describe('tileGrid', () => {
  it('splits the default 350 mm into 2 × 2 plates that clear the bed with their tabs', () => {
    const grid = tileGrid(options());
    expect([grid.cols, grid.rows]).toEqual([2, 2]);
    expect(grid.tileWidthMm).toBeCloseTo(175, 6);
    expect(grid.bedWidthMm).toBeCloseTo(179, 6);
    expect(grid.tiles).toHaveLength(4);
  });

  it('takes the tab out of the bed, not off the end of it', () => {
    // 175 mm of plate plus a 4 mm tab is a 179 mm object; a maximum of 175 must
    // therefore mean three tiles, not two that overrun.
    const grid = tileGrid(options({ maxTileMm: 175 }));
    expect(grid.cols).toBe(3);
    expect(grid.bedWidthMm).toBeLessThanOrEqual(175);
  });

  it('keeps one tile on the bed, tabs included', () => {
    for (const widthM of [800, 1500, 2500, 4000, 5800, 8100]) {
      for (const scale of [2500, 5000, 7143, 12500]) {
        const grid = tileGrid(
          options({ widthM, heightM: widthM, mmPerMetre: mmPerMetreFromScale(scale) }),
        );
        expect(grid.bedWidthMm).toBeLessThanOrEqual(A1_MINI_BED_MM);
        expect(grid.bedHeightMm).toBeLessThanOrEqual(A1_MINI_BED_MM);
      }
    }
  });

  it('is one tile when the whole model already fits', () => {
    const grid = tileGrid(options({ widthM: 500, heightM: 500, mmPerMetre: 0.2 })); // 100 mm
    expect([grid.cols, grid.rows]).toEqual([1, 1]);
    expect(grid.tiles[0].neighbours).toEqual({ east: false, north: false, west: false, south: false });
    // Nothing to interlock with, so nothing eats into the bed.
    expect(grid.bedWidthMm).toBeCloseTo(100, 6);
  });

  it('tiles the crop exactly — no gap, no overlap', () => {
    const grid = tileGrid(options({ widthM: 2500, heightM: 1800 }));
    const [west, south, east, north] = grid.cropM;

    const area = grid.tiles.reduce((sum, t) => {
      const [w, s, e, n] = t.boundsM;
      return sum + (e - w) * (n - s);
    }, 0);
    expect(area).toBeCloseTo((east - west) * (north - south), 6);

    // Row 1 is the northernmost and column 1 the westernmost.
    const first = grid.tiles.find((t) => t.key === 'r1c1')!;
    expect(first.boundsM[3]).toBeCloseTo(north, 9);
    expect(first.boundsM[0]).toBeCloseTo(west, 9);
    const last = grid.tiles[grid.tiles.length - 1];
    expect(last.boundsM[1]).toBeCloseTo(south, 9);
    expect(last.boundsM[2]).toBeCloseTo(east, 9);
  });

  it('centres the crop on the requested point', () => {
    const [w, s, e, n] = cropBounds(options({ centre: [300, -200], widthM: 1000, heightM: 600 }));
    expect([w, s, e, n]).toEqual([-200, -500, 800, 100]);
  });
});

describe('plateRing', () => {
  const grid = tileGrid(options());
  const tabs = DEFAULT_PRINT_OPTIONS.tabs!;
  const middle = grid.tiles.find((t) => t.key === 'r1c1')!;

  it('is a plain rectangle with interlocks switched off', () => {
    expect(plateRing(middle, null)).toHaveLength(4);
  });

  it('gives an outer edge neither tab nor notch', () => {
    const single = tileGrid(options({ widthM: 500, heightM: 500, mmPerMetre: 0.2 })).tiles[0];
    expect(plateRing(single, tabs)).toHaveLength(4);
  });

  it('puts a tab east and north, a notch west and south', () => {
    // r2c2 of a 2 × 2 has neighbours to the west and north only.
    const r2c2 = grid.tiles.find((t) => t.key === 'r2c2')!;
    expect(r2c2.neighbours).toEqual({ east: false, north: true, west: true, south: false });

    const ring = plateRing(r2c2, tabs);
    const { widthMm: w, heightMm: h } = r2c2;
    // The north tab is the only thing above the plate…
    expect(Math.max(...ring.map((p) => p[1]))).toBeCloseTo(h + tabs.depthMm, 6);
    // …and nothing pokes east, because there is no neighbour there.
    expect(Math.max(...ring.map((p) => p[0]))).toBeCloseTo(w, 6);
    // The west notch cuts inwards rather than out.
    expect(Math.min(...ring.map((p) => p[0]))).toBeCloseTo(0, 6);
  });

  const r1c1 = grid.tiles.find((t) => t.key === 'r1c1')!; // tab east, notch south
  const r1c2 = grid.tiles.find((t) => t.key === 'r1c2')!; // notch west, notch south

  /** The east tab's outer pair: the only points beyond the plate's east edge. */
  const eastTab = () => plateRing(r1c1, tabs).filter((p) => p[0] > r1c1.widthMm + 1e-9);

  /**
   * The west notch's inner pair. Filtering on "inside the plate" alone would also
   * collect this tile's SOUTH notch, which is what made the first version of this
   * test measure a span of 93 mm.
   */
  const westNotch = () =>
    plateRing(r1c2, tabs).filter(
      (p) => p[0] > 1e-9 && p[0] <= tabs.depthMm + tabs.clearanceMm + 1e-9,
    );

  const mean = (points: [number, number][]) =>
    points.reduce((n, p) => n + p[1], 0) / points.length;

  it('cuts the notch wider and deeper than the tab it receives, by the clearance', () => {
    const tab = eastTab();
    expect(tab).toHaveLength(2);
    expect(Math.max(...tab.map((p) => p[1])) - Math.min(...tab.map((p) => p[1]))).toBeCloseTo(
      tabs.widthMm,
      6,
    );
    expect(Math.max(...tab.map((p) => p[0])) - r1c1.widthMm).toBeCloseTo(tabs.depthMm, 6);

    const notch = westNotch();
    expect(notch).toHaveLength(2);
    expect(Math.max(...notch.map((p) => p[1])) - Math.min(...notch.map((p) => p[1]))).toBeCloseTo(
      tabs.widthMm + 2 * tabs.clearanceMm,
      6,
    );
    expect(Math.max(...notch.map((p) => p[0]))).toBeCloseTo(tabs.depthMm + tabs.clearanceMm, 6);
  });

  it('meets its neighbour at the same place along the seam', () => {
    expect(mean(eastTab())).toBeCloseTo(mean(westNotch()), 6);
    expect(mean(eastTab())).toBeCloseTo(r1c1.heightMm / 2, 6);
  });
});

describe('buildTile', () => {
  const grid = tileGrid(options({ widthM: 200, heightM: 200, mmPerMetre: 0.5 }));
  const tile = grid.tiles[0];

  it('always prints a plate, even with an empty city on it', () => {
    const model = buildTile(EMPTY, tile, options());
    expect(triangleCount(model.layers.plate)).toBeGreaterThan(0);
    expect(triangleCount(model.layers.buildings)).toBe(0);
    expect(model.triangles).toBe(triangleCount(model.combined));
  });

  it('drops a building that is wholly outside the tile', () => {
    const far = { ...EMPTY, buildings: [box('osm/way/1', 5000, 5000)] };
    expect(triangleCount(buildTile(far, tile, options()).layers.buildings)).toBe(0);
  });

  it('keeps a building inside the tile as a closed solid', () => {
    const one = { ...EMPTY, buildings: [box('osm/way/1', -10, -10)] };
    const built = buildTile(one, tile, options());
    // A square prism: two triangles per wall, two per cap.
    expect(triangleCount(built.layers.buildings)).toBe(12);
  });

  it('cuts a building straddling the seam flush at the tile edge', () => {
    const opts = options({ widthM: 200, heightM: 200, mmPerMetre: 0.5, layers: { buildings: true, water: false, green: false, roads: false, bridges: false } });
    const straddler = box('osm/way/1', -10, -10, 10, 200); // runs far past the east edge
    const twoByTwo = tileGrid(opts);
    const west = twoByTwo.tiles.find((t) => t.key === 'r1c1')!;

    const built = buildTile({ ...EMPTY, buildings: [straddler] }, west, opts);
    expect(triangleCount(built.layers.buildings)).toBeGreaterThan(0);

    // Nothing beyond the plate, in either horizontal axis.
    const p = built.layers.buildings.positions;
    for (let i = 0; i < p.length; i += 3) {
      expect(p[i]).toBeLessThanOrEqual(west.widthMm + 1e-6);
      expect(p[i]).toBeGreaterThanOrEqual(-1e-6);
      expect(p[i + 1]).toBeLessThanOrEqual(west.heightMm + 1e-6);
      expect(p[i + 1]).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it('scales height by the exaggeration and the plan scale, and embeds it in the plate', () => {
    const opts = options({ widthM: 200, heightM: 200, mmPerMetre: 0.5, exaggeration: 3 });
    const built = buildTile({ ...EMPTY, buildings: [box('osm/way/1', -10, -10, 10)] }, tile, opts);

    const z: number[] = [];
    for (let i = 2; i < built.layers.buildings.positions.length; i += 3) {
      z.push(built.layers.buildings.positions[i]);
    }
    // 10 m × 3 × 0.5 mm/m = 15 mm, sitting on a 2 mm plate it sinks 0.2 mm into.
    expect(Math.min(...z)).toBeCloseTo(opts.plateMm - opts.embedMm, 6);
    expect(Math.max(...z)).toBeCloseTo(opts.plateMm - opts.embedMm + 15, 6);
  });

  it('gives water a fixed millimetre thickness, not a scaled one', () => {
    const pond: BaselineArea = {
      id: 'osm/way/9',
      footprint: [
        [-20, -20],
        [20, -20],
        [20, 20],
        [-20, 20],
      ],
      kind: 'water',
    };
    const opts = options({ widthM: 200, heightM: 200, mmPerMetre: 0.5, waterMm: 0.6 });
    const built = buildTile({ ...EMPTY, water: [pond] }, tile, opts);

    const z: number[] = [];
    for (let i = 2; i < built.layers.water.positions.length; i += 3) {
      z.push(built.layers.water.positions[i]);
    }
    expect(Math.max(...z)).toBeCloseTo(opts.plateMm + 0.6, 6);
    expect(Math.min(...z)).toBeCloseTo(opts.plateMm - opts.embedMm, 6);
  });

  it('keeps roads at or above the width threshold and drops the rest', () => {
    const wide: BaselineRoad = {
      id: 'osm/way/2',
      path: [
        [-80, 0],
        [80, 0],
      ],
      kind: 'primary',
      width: 12,
    };
    const soi: BaselineRoad = { ...wide, id: 'osm/way/3', width: 4 };

    const opts = options({ widthM: 200, heightM: 200, mmPerMetre: 0.5, roadMinWidthM: 6 });
    const both = buildTile({ ...EMPTY, roads: [wide, soi] }, tile, opts);
    const only = buildTile({ ...EMPTY, roads: [wide] }, tile, opts);
    expect(triangleCount(both.layers.roads)).toBe(triangleCount(only.layers.roads));
    expect(triangleCount(only.layers.roads)).toBeGreaterThan(0);
  });

  it('honours a layer being switched off', () => {
    const source = {
      buildings: [box('osm/way/1', -10, -10)],
      roads: [] as BaselineRoad[],
      water: [] as BaselineArea[],
      green: [] as BaselineArea[],
    };
    const off = options({ layers: { buildings: false, water: false, green: false, roads: false, bridges: false } });
    const built = buildTile(source, tile, off);
    expect(triangleCount(built.layers.buildings)).toBe(0);
    expect(triangleCount(built.layers.plate)).toBeGreaterThan(0);
  });

  it('skips a footprint that cannot be extruded rather than failing the plate', () => {
    const degenerate: BaselineBuilding = {
      id: 'osm/way/bad',
      footprint: [
        [0, 0],
        [1, 0],
      ],
      height: 8,
      kind: 'residential',
    };
    const source = { ...EMPTY, buildings: [degenerate, box('osm/way/1', -10, -10)] };
    expect(triangleCount(buildTile(source, tile, options()).layers.buildings)).toBe(12);
  });
});

/**
 * Every directed edge of a closed solid is matched by exactly one reverse. This is the
 * property a slicer means by "does not need repair", and it is checkable.
 */
function openEdges(soup: PrintSoup): number {
  const key = (x: number, y: number, z: number) =>
    `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
  const unmatched = new Map<string, number>();
  const p = soup.positions;

  for (let i = 0; i < p.length; i += 9) {
    const v = [
      key(p[i], p[i + 1], p[i + 2]),
      key(p[i + 3], p[i + 4], p[i + 5]),
      key(p[i + 6], p[i + 7], p[i + 8]),
    ];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    for (let k = 0; k < 3; k++) {
      const forward = `${v[k]}|${v[(k + 1) % 3]}`;
      const back = `${v[(k + 1) % 3]}|${v[k]}`;
      if (unmatched.get(back)) unmatched.set(back, unmatched.get(back)! - 1);
      else unmatched.set(forward, (unmatched.get(forward) ?? 0) + 1);
    }
  }

  return [...unmatched.values()].reduce((n, count) => n + count, 0);
}

describe('watertightness', () => {
  const grid = tileGrid(options({ widthM: 200, heightM: 200, mmPerMetre: 0.5 }));
  const tile = grid.tiles[0];

  it('closes a plain building', () => {
    const built = buildTile({ ...EMPTY, buildings: [box('osm/way/1', -10, -10)] }, tile, options());
    expect(openEdges(built.layers.buildings)).toBe(0);
  });

  it('closes a notched plate', () => {
    // The concave case: a tile with neighbours has notches cut into its outline.
    const inner = tileGrid(options()).tiles.find((t) => t.key === 'r2c2')!;
    expect(openEdges(buildTile(EMPTY, inner, options()).layers.plate)).toBe(0);
  });

  it('closes a building with a courtyard', () => {
    const courtyard: BaselineBuilding = {
      id: 'osm/way/1',
      footprint: [
        [-40, -40],
        [40, -40],
        [40, 40],
        [-40, 40],
      ],
      holes: [
        [
          [-10, -10],
          [10, -10],
          [10, 10],
          [-10, 10],
        ],
      ],
      height: 12,
      kind: 'residential',
    };
    const built = buildTile({ ...EMPTY, buildings: [courtyard] }, tile, options());
    expect(openEdges(built.layers.buildings)).toBe(0);
  });

  it('closes a concave building that the tile seam cuts into two pieces', () => {
    // The regression, and the reason walls come from the cap boundary rather than
    // from the ring. Sutherland–Hodgman leaves the two halves joined by a
    // zero-width neck; earcut drops the neck, and walls raised on the ring would
    // then trace an outline the caps no longer follow. osm/way/822116040 in Wat Ket
    // does exactly this, in the shape of the U below straddling x = 0.
    const u: BaselineBuilding = {
      id: 'osm/way/1',
      footprint: [
        [-30, -30],
        [30, -30],
        [30, -20],
        [-10, -20],
        [-10, 20],
        [30, 20],
        [30, 30],
        [-30, 30],
      ],
      height: 9,
      kind: 'residential',
    };
    const twoByTwo = tileGrid(options({ widthM: 200, heightM: 200, mmPerMetre: 0.5 }));
    for (const t of twoByTwo.tiles) {
      const built = buildTile({ ...EMPTY, buildings: [u] }, t, options());
      expect(openEdges(built.layers.buildings)).toBe(0);
    }
  });

  it('closes every layer of a tile carrying all four', () => {
    const source: PrintSource = {
      buildings: [box('osm/way/1', -60, -60), box('osm/way/2', 10, 10, 25)],
      roads: [{ id: 'osm/way/3', path: [[-90, -40], [90, 40], [40, 90]], kind: 'primary', width: 12 }],
      water: [{ id: 'osm/way/4', footprint: [[-80, 60], [80, 60], [80, 80], [-80, 80]], kind: 'water' }],
      green: [{ id: 'osm/way/5', footprint: [[-80, -90], [-20, -90], [-20, -70], [-80, -70]], kind: 'park' }],
    };
    const built = buildTile(source, tile, options());
    for (const id of ['plate', 'buildings', 'water', 'green', 'roads'] as const) {
      expect({ [id]: openEdges(built.layers[id]) }).toEqual({ [id]: 0 });
    }
  });
});

describe('bridges', () => {
  /** A 40 m river running north–south, and a road crossing it west to east. */
  const river: BaselineArea = {
    id: 'osm/way/100',
    footprint: [
      [-20, -200],
      [20, -200],
      [20, 200],
      [-20, 200],
    ],
    kind: 'water',
  };
  const crossing: BaselineRoad = {
    id: 'osm/way/200',
    path: [
      [-60, 0],
      [60, 0],
    ],
    kind: 'secondary',
    width: 9.5,
    bridge: true,
  };

  // Deliberately ONE tile: the road runs along y = 0, which on a 2 × 2 grid is the
  // seam itself, and every measurement below would be of a half-deck.
  const onlyBridges = options({
    widthM: 300,
    heightM: 300,
    mmPerMetre: 0.5,
    layers: { buildings: false, water: false, green: false, roads: false, bridges: true },
  });
  const grid = tileGrid(onlyBridges);
  const tile = grid.tiles[0];

  it('builds a deck for a flagged road that crosses water', () => {
    const built = buildTile({ ...EMPTY, roads: [crossing], water: [river] }, tile, onlyBridges);
    expect(triangleCount(built.layers.bridges)).toBeGreaterThan(0);
  });

  it('ignores a flagged road that crosses no water', () => {
    // OSM tags 248 ways in Wat Ket as bridges and only 48 cross water; the rest carry
    // a road over a road, and a plate has nothing for them to span.
    const built = buildTile({ ...EMPTY, roads: [crossing], water: [] }, tile, onlyBridges);
    expect(triangleCount(built.layers.bridges)).toBe(0);
  });

  it('ignores an unflagged road over water', () => {
    const notABridge = { ...crossing, bridge: undefined };
    const built = buildTile({ ...EMPTY, roads: [notABridge], water: [river] }, tile, onlyBridges);
    expect(triangleCount(built.layers.bridges)).toBe(0);
  });

  it('is filled to the plate, with no void under the span', () => {
    const built = buildTile({ ...EMPTY, roads: [crossing], water: [river] }, tile, onlyBridges);
    const p = built.layers.bridges.positions;
    const base = onlyBridges.plateMm - onlyBridges.embedMm;

    let lowest = Infinity;
    let highest = -Infinity;
    for (let i = 2; i < p.length; i += 3) {
      lowest = Math.min(lowest, p[i]);
      highest = Math.max(highest, p[i]);
    }
    // Everything hangs off the plate: the underside IS the plate, not a deck soffit.
    expect(lowest).toBeCloseTo(base, 6);
    // A secondary's deck is 6.5 m; at 3× and 0.5 mm/m that is 9.75 mm over the base.
    expect(highest).toBeCloseTo(base + 6.5 * 3 * 0.5, 6);
  });

  it('never leaves geometry below the plate, whatever the ramp does', () => {
    // `deckStations` buries its ramp ends at −0.6 m. On screen that hides a cut edge
    // under the ground; on a plate it would be a solid dangling below the bed.
    const built = buildTile({ ...EMPTY, roads: [crossing], water: [river] }, tile, onlyBridges);
    const p = built.layers.bridges.positions;
    for (let i = 2; i < p.length; i += 3) {
      expect(p[i]).toBeGreaterThanOrEqual(onlyBridges.plateMm - onlyBridges.embedMm - 1e-9);
    }
  });

  it('ramps down to road level at its ends rather than stepping', () => {
    const built = buildTile({ ...EMPTY, roads: [crossing], water: [river] }, tile, onlyBridges);
    const p = built.layers.bridges.positions;
    const deckFloor = onlyBridges.plateMm + onlyBridges.roadMm;

    // The far west end of the structure sits at road level; the middle is up in the air.
    let westmost = Infinity;
    let westZ = 0;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i] < westmost) {
        westmost = p[i];
        westZ = p[i + 2];
      }
    }
    expect(westZ).toBeLessThanOrEqual(deckFloor + 1e-6);
  });

  it('widens a footbridge until it prints', () => {
    // 2 m at 1:7,143 is a 0.28 mm deck standing 3 mm tall — a spike, not a bridge.
    const foot: BaselineRoad = { ...crossing, id: 'osm/way/300', kind: 'path', width: 2 };
    const built = buildTile({ ...EMPTY, roads: [foot], water: [river] }, tile, onlyBridges);
    const p = built.layers.bridges.positions;

    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < p.length; i += 3) {
      minY = Math.min(minY, p[i]);
      maxY = Math.max(maxY, p[i]);
    }
    // The road runs west to east, so the deck's width is its extent in Y.
    expect(maxY - minY).toBeGreaterThanOrEqual(MIN_BRIDGE_MM - 1e-6);
  });

  it('keeps a footbridge that the roads threshold would drop', () => {
    // The roads threshold is a triangle budget for 36,460 segments. Seven of the
    // twelve crossings inside the default crop are 2 m footpaths over the canals,
    // and dropping them would lose most of how the riverbank is crossed.
    const foot: BaselineRoad = { ...crossing, id: 'osm/way/300', kind: 'path', width: 2 };
    const strict = { ...onlyBridges, roadMinWidthM: 20 };
    const built = buildTile({ ...EMPTY, roads: [foot], water: [river] }, tile, strict);
    expect(triangleCount(built.layers.bridges)).toBeGreaterThan(0);
  });

  it('closes every bridge solid, including one the tile seam cuts', () => {
    // 240 mm across the bed's 176 mm usable, so 2 × 2 — and the seams fall on x = 0
    // and y = 0, straight down the middle of the crossing.
    const cut = { ...onlyBridges, widthM: 120, heightM: 120, mmPerMetre: 2 };
    const seam = tileGrid(cut);
    expect(seam.tiles.length).toBeGreaterThan(1);
    for (const t of seam.tiles) {
      const built = buildTile({ ...EMPTY, roads: [crossing], water: [river] }, t, cut);
      expect({ [t.key]: openEdges(built.layers.bridges) }).toEqual({ [t.key]: 0 });
    }
  });

  it('is off when the layer is off', () => {
    const off = { ...onlyBridges, layers: { ...onlyBridges.layers, bridges: false } };
    const built = buildTile({ ...EMPTY, roads: [crossing], water: [river] }, tile, off);
    expect(triangleCount(built.layers.bridges)).toBe(0);
  });
});

describe('buildModel', () => {
  const source: PrintSource = {
    buildings: [box('osm/way/1', -300, -300, 6), box('osm/way/2', 200, 200, 30)],
    roads: [{ id: 'osm/way/3', path: [[-400, 0], [400, 0]], kind: 'primary', width: 12 }],
    water: [],
    green: [],
  };
  const opts = options({ widthM: 1000, heightM: 1000, mmPerMetre: 0.2, maxTileMm: 175 });

  it('reports the stats a printer needs before spending four hours', () => {
    const model = buildModel(source, opts);
    expect(model.grid.tiles).toHaveLength(model.tiles.length);
    expect(model.triangles).toBe(model.tiles.reduce((n, t) => n + t.triangles, 0));
    // The tallest building: 30 m × 3 × 0.2 = 18 mm, on a 2 mm plate.
    expect(model.tallestMm).toBeCloseTo(opts.plateMm - opts.embedMm + 18, 4);
    expect(model.medianBuildingMm).toBeGreaterThan(0);
  });

  it('counts the buildings that will not survive a 0.4 mm nozzle', () => {
    const flat = buildModel(source, options({ ...opts, exaggeration: 0.05 }));
    expect(flat.belowNozzle).toBe(2);
    expect(buildModel(source, opts).belowNozzle).toBe(0);
  });

  it('is deterministic — the same options give a byte-identical STL', () => {
    const a = encodeBinaryStl(buildModel(source, opts).tiles[0].combined, 'wat-ket');
    const b = encodeBinaryStl(buildModel(source, opts).tiles[0].combined, 'wat-ket');
    expect([...new Uint8Array(a)]).toEqual([...new Uint8Array(b)]);
  });

  it('states the exaggeration in the summary, so the object cannot lie about it', () => {
    const summary = printSummary(buildModel(source, opts), 'wat-ket');
    expect(summary).toContain('exaggerated 3× — the model is NOT to scale vertically');
    expect(summary).toContain('1:5,000');
    expect(summary).toContain('OpenStreetMap');
  });
});

describe('stlFilename', () => {
  it('names a tile by row and column, north first', () => {
    const tile = tileGrid(options()).tiles.find((t) => t.key === 'r1c2')!;
    expect(stlFilename('wat-ket', tile, 'buildings')).toBe('wat-ket_r1c2_buildings.stl');
    expect(stlFilename('wat-ket', tile, 'combined')).toBe('wat-ket_r1c2_combined.stl');
  });
});
