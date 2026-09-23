/**
 * The scene as a printable object.
 *
 * A second consumer of the same baseline document that `merge.ts` feeds to the GPU —
 * not a second renderer. A footprint becomes a solid here through the same
 * `footprintToExtrudeArgs` winding normalisation and the same earcut call the viewer
 * reaches through `ExtrudeGeometry`, so a printed Wat Ket and a drawn Wat Ket cannot
 * disagree about what a building is. Only the walls are raised differently, and
 * `solid` says why. Everything else here is the part a screen never needs: a base
 * plate, a scale, a tile grid and the interlocks between tiles.
 *
 * ### Print space is millimetres, +Z up, and is NOT the renderer's convention
 *
 * Footprints in the document are `[x = east, y = north]` in metres.
 * `THREE.ExtrudeGeometry` builds a shape in XY and pushes it along +Z. A slicer wants
 * +Z up and millimetres. Those three agree, so this module applies **no rotation at
 * all** — where `Buildings.tsx` rotates −90° about X to reach three.js's −Z-is-north.
 *
 * Two conventions, each serving its own consumer. Mixing them up is the failure that
 * `docs/architecture.md` fixes units for in the first place: it is invisible until the
 * model comes out lying on its side.
 *
 * ### Why the tiles
 *
 * The Bambu A1 mini's bed is 180 mm square and the near geometry is 2.5 km across.
 * There is no scale at which one plate holds it, so the model is a grid of plates that
 * interlock, and every tile's geometry is clipped flush to its own edge.
 *
 * ### Why the exaggeration
 *
 * At 1:7,143 the median Wat Ket building — 5.08 m — is 0.71 mm tall, under two layer
 * lines. Printed honestly the city is a flat card. Heights are therefore exaggerated,
 * the factor is an input rather than a constant, and `printSummary` states it so the
 * number travels with the object. The valley view made the same trade on screen.
 *
 * Everything here is pure. `stl.ts` encodes what it returns; the route is a form over
 * it. three.js runs headless, so all of it is testable — `merge.test.ts` proves that.
 */

import * as THREE from 'three';
import { crossesWater, deckStations, waterPolys } from './bridges';
import { clipRingToConvex, rectRing, type Ring } from './clip';
import { footprintToExtrudeArgs, type Point2 } from './extrude';
import type { BaselineArea, BaselineBuilding, BaselineRoad } from './scene';
import { appendSoup, emptySoup, pushQuad, pushTri, triangleCount, type PrintSoup } from './stl';

/** Bambu A1 mini. The whole reason tiles exist. */
export const A1_MINI_BED_MM = 180;

export type LayerId = 'plate' | 'buildings' | 'water' | 'green' | 'roads' | 'bridges';

export const LAYER_ORDER: readonly LayerId[] = [
  'plate',
  'buildings',
  'water',
  'green',
  'roads',
  'bridges',
];

/**
 * The narrowest a printed bridge deck is allowed to be.
 *
 * Wat Ket has 48 bridges over the Ping and its canals and most of them are 2 m
 * footpaths, which at 1:7,143 is a deck 0.28 mm wide standing 3 mm tall — not a
 * bridge, a spike that snaps off the plate. Anything thinner than this is widened
 * until it prints, and `printSummary` says so. The alternative was dropping them,
 * which loses the crossings that make the riverbank readable.
 */
export const MIN_BRIDGE_MM = 1;

export interface TabOptions {
  /** Along the seam. */
  widthMm: number;
  /** Out of the plate edge, and off the usable tile size. */
  depthMm: number;
  /** How much wider and deeper the notch is cut than the tab it receives. */
  clearanceMm: number;
}

export interface PrintOptions {
  /** Centre of the crop, in scene-local metres. The scene origin is `[0, 0]`. */
  centre: Point2;
  widthM: number;
  heightM: number;
  /** Millimetres of model per metre of city. The UI shows its reciprocal, "1: n". */
  mmPerMetre: number;
  /** Longest edge of one printed tile, tab included. */
  maxTileMm: number;
  /** Heights only. Footprints are never exaggerated — the streets stay the streets. */
  exaggeration: number;
  plateMm: number;
  /** How far a solid sinks into the plate, so the slicer unions rather than welds. */
  embedMm: number;
  layers: Record<Exclude<LayerId, 'plate'>, boolean>;
  /** Raised heights above the plate top. */
  waterMm: number;
  greenMm: number;
  roadMm: number;
  /** Carriageways narrower than this are dropped: 36,460 segments is not a print. */
  roadMinWidthM: number;
  tabs: TabOptions | null;
}

/**
 * 2,500 m square on the origin is exactly the near set that the viewer document
 * carries, at a scale that puts four A1 mini plates on a table.
 */
export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  centre: [0, 0],
  widthM: 2500,
  heightM: 2500,
  mmPerMetre: 0.14, // 1:7,143 — 350 mm across, so 2 × 2 tiles of 175 mm
  // The bed itself. The tab comes out of this, not off the end of it, so the default
  // lands a 175 mm plate with a 4 mm tab at 179 mm on a 180 mm bed. Drop it to leave
  // room for a brim.
  maxTileMm: A1_MINI_BED_MM,
  exaggeration: 3,
  plateMm: 2,
  embedMm: 0.2,
  layers: { buildings: true, water: true, green: true, roads: true, bridges: true },
  waterMm: 0.6,
  greenMm: 0.6,
  roadMm: 0.6,
  roadMinWidthM: 6,
  tabs: { widthMm: 12, depthMm: 4, clearanceMm: 0.2 },
};

/** 1 mm per metre is 1:1,000. What a model-maker actually thinks in. */
export function scaleDenominator(mmPerMetre: number): number {
  return 1000 / mmPerMetre;
}

export function mmPerMetreFromScale(denominator: number): number {
  return 1000 / denominator;
}

export interface TileSpec {
  /** 1-based, row 1 at the NORTH and column 1 at the WEST — how a plan is read. */
  row: number;
  col: number;
  /** `r1c2`. Goes in the filename, and is the only label a printed tile carries. */
  key: string;
  /** `[west, south, east, north]` in scene-local metres. */
  boundsM: [number, number, number, number];
  widthMm: number;
  heightMm: number;
  /** Which edges have a neighbour, and therefore a tab or a notch. */
  neighbours: { east: boolean; north: boolean; west: boolean; south: boolean };
}

export interface PrintGrid {
  cols: number;
  rows: number;
  tileWidthMm: number;
  tileHeightMm: number;
  /** What one tile occupies on the bed: the plate plus its tabs. */
  bedWidthMm: number;
  bedHeightMm: number;
  totalWidthMm: number;
  totalHeightMm: number;
  /** `[west, south, east, north]` of the whole crop, in metres. */
  cropM: [number, number, number, number];
  tiles: TileSpec[];
}

export function cropBounds({
  centre,
  widthM,
  heightM,
}: PrintOptions): [number, number, number, number] {
  return [
    centre[0] - widthM / 2,
    centre[1] - heightM / 2,
    centre[0] + widthM / 2,
    centre[1] + heightM / 2,
  ];
}

/**
 * The crop, divided into plates that fit the bed.
 *
 * The tab eats into the usable size rather than hanging off it — a 175 mm tile with a
 * 4 mm tab is a 179 mm object, and the point of the maximum is what fits the bed, not
 * what the plate measures. Tiles are equal rather than "as many full ones as fit plus
 * a remainder": a 12 mm strip is a thing that warps off the plate, and equal tiles also
 * mean the seams land in the same place on both axes.
 */
export function tileGrid(options: PrintOptions): PrintGrid {
  const { mmPerMetre, maxTileMm, tabs } = options;
  const cropM = cropBounds(options);

  const totalWidthMm = options.widthM * mmPerMetre;
  const totalHeightMm = options.heightM * mmPerMetre;

  const usable = Math.max(1, maxTileMm - (tabs ? tabs.depthMm : 0));
  const cols = Math.max(1, Math.ceil(totalWidthMm / usable - 1e-9));
  const rows = Math.max(1, Math.ceil(totalHeightMm / usable - 1e-9));

  const tileWidthMm = totalWidthMm / cols;
  const tileHeightMm = totalHeightMm / rows;
  const tileWidthM = options.widthM / cols;
  const tileHeightM = options.heightM / rows;

  const tiles: TileSpec[] = [];
  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= cols; col++) {
      // Row 1 is the northernmost, so it takes the top slice of the crop.
      const north = cropM[3] - (row - 1) * tileHeightM;
      const west = cropM[0] + (col - 1) * tileWidthM;
      tiles.push({
        row,
        col,
        key: `r${row}c${col}`,
        boundsM: [west, north - tileHeightM, west + tileWidthM, north],
        widthMm: tileWidthMm,
        heightMm: tileHeightMm,
        neighbours: {
          west: col > 1,
          east: col < cols,
          north: row > 1,
          south: row < rows,
        },
      });
    }
  }

  return {
    cols,
    rows,
    tileWidthMm,
    tileHeightMm,
    bedWidthMm: tileWidthMm + (tabs && cols > 1 ? tabs.depthMm : 0),
    bedHeightMm: tileHeightMm + (tabs && rows > 1 ? tabs.depthMm : 0),
    totalWidthMm,
    totalHeightMm,
    cropM,
    tiles,
  };
}

/**
 * The plate outline in tile-local millimetres, tabs and notches included.
 *
 * Tabs protrude EAST and NORTH; notches are cut WEST and SOUTH. One rule for the whole
 * grid, so every seam is a tab meeting the notch of the tile beyond it, and no tile has
 * to know anything about its neighbour beyond whether one exists.
 *
 * A polygon rather than a peg and a socket because a socket is a hole, a hole is a
 * boolean, and a boolean is a CSG library this project does not have and does not need.
 */
export function plateRing(tile: TileSpec, tabs: TabOptions | null): Ring {
  const { widthMm: w, heightMm: h } = tile;
  if (!tabs) return rectRing(0, 0, w, h);

  const { widthMm: tw, depthMm: td, clearanceMm: gap } = tabs;
  const ring: Ring = [];

  // Anticlockwise from the south-west corner: south, east, north, west.
  ring.push([0, 0]);
  if (tile.neighbours.south) {
    // A notch is cut INTO the plate, and wider than the tab it receives.
    const half = tw / 2 + gap;
    ring.push([w / 2 - half, 0], [w / 2 - half, td + gap], [w / 2 + half, td + gap], [w / 2 + half, 0]);
  }

  ring.push([w, 0]);
  if (tile.neighbours.east) {
    const half = tw / 2;
    ring.push([w, h / 2 - half], [w + td, h / 2 - half], [w + td, h / 2 + half], [w, h / 2 + half]);
  }

  ring.push([w, h]);
  if (tile.neighbours.north) {
    const half = tw / 2;
    ring.push([w / 2 + half, h], [w / 2 + half, h + td], [w / 2 - half, h + td], [w / 2 - half, h]);
  }

  ring.push([0, h]);
  if (tile.neighbours.west) {
    const half = tw / 2 + gap;
    ring.push([0, h / 2 + half], [td + gap, h / 2 + half], [td + gap, h / 2 - half], [0, h / 2 - half]);
  }

  return ring;
}

// ------------------------------------------------------------------ geometry

type V3 = [number, number, number];

/** A solid's top: one height, or a linear field over the footprint for a ramp. */
type TopZ = number | ((p: Point2) => number);

/**
 * A closed solid from a footprint, in tile-local millimetres.
 *
 * Triangulated by `THREE.ShapeUtils.triangulateShape` — the very earcut call
 * `ExtrudeGeometry` makes internally — over rings normalised by the project's own
 * `footprintToExtrudeArgs`. So the print and the screen agree about what a footprint
 * is, which is the thing that would otherwise make this a second renderer.
 *
 * **The walls come from the CAP's boundary, not from the ring.** That is the one
 * deliberate difference from `ExtrudeGeometry`, and it is what makes the output
 * watertight. `clipRingToConvex` warns in `clip.ts` that cutting a concave shape into
 * disjoint parts leaves them joined by a degenerate neck, and a building straddling a
 * tile seam does exactly that — one of Wat Ket's 7,588 does. Earcut is right about it
 * and drops the neck; `ExtrudeGeometry` then raises walls along a ring that the caps
 * no longer follow, and the result is a solid with eight open edges that a slicer asks
 * to repair. Walls raised on the edges the triangulation actually left exposed cannot
 * disagree with it, whatever the ring did.
 */
function solid(soup: PrintSoup, contour: Ring, holes: Ring[], z0: number, z1: TopZ): void {
  if (contour.length < 3) return;
  // A flat top at or below the floor is a solid with no volume; a sloping one is
  // clamped per vertex below instead, because a ramp is allowed to run out.
  if (typeof z1 === 'number' && !(z1 > z0)) return;
  // A height FIELD rather than a number, so a bridge ramp can slope. The field is
  // linear over the footprint, which keeps the top face planar and the fan over it
  // honest; anything curved would need the cap subdivided.
  const topZ = typeof z1 === 'function' ? z1 : () => z1;

  let args;
  try {
    // The depth is a placeholder: this wants the winding normalisation, not the height.
    args = footprintToExtrudeArgs(contour, 1, holes);
  } catch {
    return; // Fewer than three distinct points once the clip was through with it.
  }

  const outer = args.points.map(([x, y]) => new THREE.Vector2(x, y));
  const inner = args.holes.map((hole) => hole.map(([x, y]) => new THREE.Vector2(x, y)));

  let faces: number[][];
  try {
    faces = THREE.ShapeUtils.triangulateShape(outer, inner);
  } catch {
    return;
  }
  if (faces.length === 0) return;

  const flat = [outer, ...inner].flat();
  // Never below the floor: a solid with an inverted top is a solid turned inside out,
  // and a ramp that runs out below the plate would do exactly that.
  const top = (i: number): V3 => [
    flat[i].x,
    flat[i].y,
    Math.max(z0, topZ([flat[i].x, flat[i].y])),
  ];
  const bottom = (i: number): V3 => [flat[i].x, flat[i].y, z0];

  // Directed edges of the cap. An edge with no reverse is on the boundary, and is
  // where a wall goes.
  const edges = new Map<string, [number, number]>();

  for (const [a, b, c] of faces) {
    pushTri(soup, top(a), top(b), top(c));
    pushTri(soup, bottom(c), bottom(b), bottom(a));
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const reverse = `${q}:${p}`;
      if (edges.has(reverse)) edges.delete(reverse);
      else edges.set(`${p}:${q}`, [p, q]);
    }
  }

  for (const [p, q] of edges.values()) {
    const dx = flat[q].x - flat[p].x;
    const dy = flat[q].y - flat[p].y;
    // The cap is wound anticlockwise, so its boundary runs anticlockwise too and the
    // outward side of an edge is to its right. A hole's boundary runs the other way,
    // and the same expression points into the hole — which is also outward, for the
    // solid. One rule, both cases.
    pushQuad(soup, top(p), top(q), bottom(q), bottom(p), [dy, -dx, 0]);
  }
}

function bboxOutside(points: Point2[], [w, s, e, n]: [number, number, number, number]): boolean {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return maxX < w || minX > e || maxY < s || minY > n;
}

/** A road segment as a rectangle in scene metres. Boxes, not a mitred ribbon. */
function segmentRect(a: Point2, b: Point2, halfWidth: number): Ring | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  const nx = (-dy / length) * halfWidth;
  const ny = (dx / length) * halfWidth;
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ];
}

// --------------------------------------------------------------------- build

export interface TileModel {
  tile: TileSpec;
  layers: Record<LayerId, PrintSoup>;
  combined: PrintSoup;
  triangles: number;
}

export interface PrintModel {
  grid: PrintGrid;
  options: PrintOptions;
  tiles: TileModel[];
  triangles: number;
  /** Tallest point of any solid, in millimetres. Against the 180 mm Z of the bed. */
  tallestMm: number;
  /** Median printed building height. The number that says whether this is a city. */
  medianBuildingMm: number;
  /** Buildings whose printed height is under one nozzle width. */
  belowNozzle: number;
}

export interface PrintSource {
  buildings: readonly BaselineBuilding[];
  roads: readonly BaselineRoad[];
  water: readonly BaselineArea[];
  green: readonly BaselineArea[];
}

/**
 * One tile's five layers.
 *
 * Everything is clipped in METRES against the tile rectangle and only then scaled, so
 * `clip.ts`'s tested Sutherland–Hodgman does the cutting and nothing overhangs a plate.
 * A building straddling a seam is cut flush and printed in halves — the alternative,
 * keeping it whole on whichever tile owns its centroid, leaves a solid hanging in the
 * air over the neighbour.
 */
export function buildTile(source: PrintSource, tile: TileSpec, options: PrintOptions): TileModel {
  const { plateMm, embedMm, mmPerMetre, exaggeration } = options;
  const [west, south, east, north] = tile.boundsM;
  const clipper = rectRing(west, south, east, north);

  /** Scene metres to this tile's own millimetres, its south-west corner at the origin. */
  const toMm = (ring: Ring): Ring =>
    ring.map(([x, y]) => [(x - west) * mmPerMetre, (y - south) * mmPerMetre]);

  const clip = (ring: Ring): Ring | null => {
    const cut = clipRingToConvex(ring, clipper);
    return cut.length < 3 ? null : toMm(cut);
  };

  const clipHoles = (holes: Point2[][] | undefined): Ring[] =>
    (holes ?? []).map(clip).filter((hole): hole is Ring => hole !== null);

  const layers: Record<LayerId, PrintSoup> = {
    plate: emptySoup(),
    buildings: emptySoup(),
    water: emptySoup(),
    green: emptySoup(),
    roads: emptySoup(),
    bridges: emptySoup(),
  };

  // Everything in the city sits on the plate and sinks `embedMm` into it, so the
  // slicer unions two overlapping solids rather than welding two touching faces.
  const base = plateMm - embedMm;

  solid(layers.plate, plateRing(tile, options.tabs), [], 0, plateMm);

  if (options.layers.buildings) {
    for (const building of source.buildings) {
      if (bboxOutside(building.footprint, tile.boundsM)) continue;
      const footprint = clip(building.footprint);
      if (!footprint) continue;
      // Height is the only thing the exaggeration touches. Footprints stay to scale.
      const top = base + building.height * exaggeration * mmPerMetre;
      solid(layers.buildings, footprint, clipHoles(building.holes), base, top);
    }
  }

  // Green before water, the same order `Ground.tsx` draws them in, so a pond inside a
  // park is water rather than being covered by it.
  const pads: [Extract<LayerId, 'green' | 'water'>, readonly BaselineArea[], number][] = [
    ['green', source.green, options.greenMm],
    ['water', source.water, options.waterMm],
  ];

  for (const [id, areas, padMm] of pads) {
    if (!options.layers[id]) continue;
    for (const area of areas) {
      if (bboxOutside(area.footprint, tile.boundsM)) continue;
      const footprint = clip(area.footprint);
      if (!footprint) continue;
      // A fixed thickness in millimetres, not a scaled one: a pad the plan scale
      // shrank would vanish long before the buildings did.
      solid(layers[id], footprint, clipHoles(area.holes), base, plateMm + padMm);
    }
  }

  if (options.layers.roads) {
    for (const road of source.roads) {
      if (road.width < options.roadMinWidthM) continue;
      if (bboxOutside(road.path, tile.boundsM)) continue;
      for (let i = 0; i < road.path.length - 1; i++) {
        const rect = segmentRect(road.path[i], road.path[i + 1], road.width / 2);
        if (!rect) continue;
        const clipped = clip(rect);
        if (!clipped) continue;
        solid(layers.roads, clipped, [], base, plateMm + options.roadMm);
      }
    }
  }

  if (options.layers.bridges) {
    // The deck meets the road surface at its ramp ends, so a bridge and the street it
    // carries are one continuous solid rather than a step.
    const deckFloorMm = plateMm + options.roadMm;
    const polys = waterPolys([...source.water]);
    // Widen a deck until it prints, in metres, so `deckStations` sees one width.
    const minWidthM = MIN_BRIDGE_MM / mmPerMetre;

    for (const road of source.roads) {
      // The flag alone is not enough: OSM tags 248 ways here as bridges and only 48 of
      // them cross water. The rest carry a road over a road, and `bridges.ts` has
      // always insisted on the same test.
      //
      // `roadMinWidthM` deliberately does NOT apply. That threshold is a triangle
      // budget for the 36,460 road segments in the scene; there are 48 bridges, and
      // seven of the twelve inside the default crop are 2 m footpaths over the canals
      // — which is most of how the riverbank is actually crossed. What makes a thin
      // deck printable is the width floor below, not dropping it.
      if (!road.bridge) continue;
      if (bboxOutside(road.path, tile.boundsM)) continue;
      if (!crossesWater(road.path, polys)) continue;

      const stations = deckStations({ ...road, width: Math.max(road.width, minWidthM) });

      for (let i = 0; i < stations.length - 1; i++) {
        const s0 = stations[i];
        const s1 = stations[i + 1];
        const span: Ring = [s0.left, s1.left, s1.right, s0.right];
        if (bboxOutside(span, tile.boundsM)) continue;
        const clipped = clip(span);
        if (!clipped) continue;

        // Where along the span a point sits, so a clipped corner gets the height the
        // ramp actually has there rather than the height of the station it came from.
        // Done in millimetres because the metre-to-millimetre map is affine and the
        // ring has already been through it.
        const a = mid(toMm([s0.left, s0.right]));
        const b = mid(toMm([s1.left, s1.right]));
        const ax = b[0] - a[0];
        const ay = b[1] - a[1];
        const length2 = ax * ax + ay * ay;
        const deckMm = (m: number) => base + m * exaggeration * mmPerMetre;

        solid(layers.bridges, clipped, [], base, ([x, y]) => {
          const t = length2 > 0 ? ((x - a[0]) * ax + (y - a[1]) * ay) / length2 : 0;
          const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
          // `bottom` is ignored on purpose. A printed bridge is filled to the plate:
          // a deck on piers is an overhang over a void, which on an A1 mini means
          // supports under every span and a bridge that snaps when they come off.
          return Math.max(deckFloorMm, deckMm(s0.top + (s1.top - s0.top) * clamped));
        });
      }
    }
  }

  const combined = emptySoup();
  for (const id of LAYER_ORDER) appendSoup(combined, layers[id]);

  return { tile, layers, combined, triangles: triangleCount(combined) };
}

/** Midpoint of two points. */
function mid([a, b]: Ring): Point2 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export function buildModel(source: PrintSource, options: PrintOptions): PrintModel {
  const grid = tileGrid(options);
  const tiles = grid.tiles.map((tile) => buildTile(source, tile, options));

  const [west, south, east, north] = grid.cropM;
  const inside = source.buildings.filter((b) => !bboxOutside(b.footprint, [west, south, east, north]));
  const printed = inside
    .map((b) => b.height * options.exaggeration * options.mmPerMetre)
    .sort((a, b) => a - b);

  const tallest = tiles.reduce((max, t) => {
    let z = max;
    for (let i = 2; i < t.combined.positions.length; i += 3) {
      if (t.combined.positions[i] > z) z = t.combined.positions[i];
    }
    return z;
  }, 0);

  return {
    grid,
    options,
    tiles,
    triangles: tiles.reduce((n, t) => n + t.triangles, 0),
    tallestMm: tallest,
    medianBuildingMm: printed.length ? printed[printed.length >> 1] : 0,
    // 0.4 mm is the A1 mini's stock nozzle: under that, a building is not printed so
    // much as implied.
    belowNozzle: printed.filter((mm) => mm < 0.4).length,
  };
}

/**
 * What the print is, in words, for the README inside the zip.
 *
 * The exaggeration especially: a model that silently multiplies its heights is a model
 * that lies to whoever picks it up in December. Same reason the valley view puts its
 * factor in the caption.
 */
export function printSummary(model: PrintModel, sceneId: string): string {
  const o = model.options;
  const g = model.grid;
  const mm = (n: number) => n.toFixed(1);

  return [
    `${sceneId} — 3D print`,
    ``,
    `Scale            1:${Math.round(scaleDenominator(o.mmPerMetre)).toLocaleString()}`,
    `Heights          exaggerated ${o.exaggeration}× — the model is NOT to scale vertically`,
    `Crop             ${o.widthM} × ${o.heightM} m centred on [${o.centre[0]}, ${o.centre[1]}] scene metres`,
    `Model            ${mm(g.totalWidthMm)} × ${mm(g.totalHeightMm)} mm, ${mm(model.tallestMm)} mm tall`,
    `Tiles            ${g.cols} × ${g.rows}, each ${mm(g.tileWidthMm)} × ${mm(g.tileHeightMm)} mm`,
    `On the bed       ${mm(g.bedWidthMm)} × ${mm(g.bedHeightMm)} mm including tabs (A1 mini: ${A1_MINI_BED_MM} mm)`,
    `Plate            ${mm(o.plateMm)} mm`,
    `Interlocks       ${o.tabs ? `${mm(o.tabs.widthMm)} mm tabs, ${mm(o.tabs.depthMm)} mm deep, ${o.tabs.clearanceMm} mm clearance` : 'none — butt joints'}`,
    `Layers           ${LAYER_ORDER.filter((id) => id === 'plate' || o.layers[id]).join(', ')}`,
    `Roads            carriageways ${o.roadMinWidthM} m and wider, raised ${mm(o.roadMm)} mm`,
    `Bridges          ${o.layers.bridges ? `every water crossing, solid to the plate with no void beneath;` : 'not included'}`,
    ...(o.layers.bridges
      ? [`                 decks narrower than ${MIN_BRIDGE_MM} mm widened to it so they print`]
      : []),
    `Triangles        ${model.triangles.toLocaleString()}`,
    `Median building  ${model.medianBuildingMm.toFixed(2)} mm (${model.belowNozzle.toLocaleString()} under a 0.4 mm nozzle)`,
    ``,
    `Each STL is in its own tile's coordinates, sitting on the bed origin, so every`,
    `file can be sliced as it is. Tabs point east and north; notches receive them from`,
    `the west and south. Tiles are named rROWcCOL with row 1 at the NORTH.`,
    ``,
    `Building footprints © OpenStreetMap contributors (ODbL) and Overture Maps (ODbL,`,
    `incorporating Google Open Buildings and Microsoft Building Footprints); heights`,
    `from Google Open Buildings 2.5D Temporal (CC BY 4.0).`,
  ].join('\n');
}

/** `wat-ket_r1c2_buildings.stl`. */
export function stlFilename(sceneId: string, tile: TileSpec, layer: LayerId | 'combined'): string {
  return `${sceneId}_${tile.key}_${layer}.stl`;
}
