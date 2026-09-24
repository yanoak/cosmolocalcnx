'use client';

import { Html, Line } from '@react-three/drei';
import { PinLayer, type PinCopy } from './PinLayer';
import type { Hotspot } from './scene';
import type { Point2 } from './extrude';
import { threadStrokes, type ThreadId } from './threads';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { decodeRelief, reliefColour, reliefShade, type ReliefMeta } from './relief';
import { toneForNormal } from './shading';
import {
  GROUND,
  PALETTE,
  PALETTE_EXTENDED,
  RELIEF_HILLSHADE,
  posterise,
  ramp,
  RELIEF_RAMP_THREAD,
  sampleRamp,
  THREAD_BANDS,
  UI_TOKENS,
} from './theme';
import {
  cityPatchExtent,
  hillshade,
  hillshadeColour,
  sampleHeight,
  smoothField,
  terracedHeights,
  valleyHeights,
  TERRACE_STEP_M,
  VALLEY_EXAGGERATION,
  valleyRowOf,
  valleySide,
  valleyVertexAt,
  VALLEY_STRIDE,
  STROKE_PX,
  waterwayWeight,
  type ValleyStyle,
  type WaterwayWeight,
} from './valley';

/**
 * The valley view: the basin Chiang Mai grew in, 120 km across.
 *
 * Unlike `ReliefBackdrop`, which draws the land AROUND the city and flattens it
 * underneath, this draws topography as the subject — nothing flattened, nothing
 * feathered, and the mountains are the point.
 *
 * Still not `terrain`. This is its own view with its own field, and no building, road or
 * water polygon is anywhere near it. The city appears as an outlined patch: a rectangle
 * drawn on a surface, not a diorama draped over one.
 *
 * THREE STYLES, because a hypsometric gradient on its own did not read as mountains.
 * They are a real choice rather than a debug toggle — see `ValleyStyle`.
 */

export interface ValleyFeatures {
  rivers: { id: string; name: string; path: [number, number][] }[];
  /** motorway, trunk and primary, by OSM class. Optional: an older features file has none. */
  roads?: { id: string; kind: string; ref?: string; path: [number, number][] }[];
  rails?: { id: string; path: [number, number][] }[];
  towns: { name: string; population: number; at: [number, number] }[];
}

export interface ValleySource {
  url: string;
  meta: ReliefMeta;
  features?: ValleyFeatures | null;
}

/**
 * Which towns get a label at all. Yan, 24 Sep 2026: only Chiang Mai — the pins name the
 * places the chapters are about, and six more town names on the plaster were clutter
 * around them. The rest of the town data stays in the features file for the day a
 * setting wants them back.
 */
const LABELLED_TOWNS: ReadonlySet<string> = new Set(['Chiang Mai']);

/** How many towns get a label. Beyond this a landscape becomes a table of contents. */
const MAX_LABELS = 7;

export function useValleyField(url: string, meta: ReliefMeta) {
  const [field, setField] = useState<Float32Array | null>(null);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled) return;
      const { size } = meta.grid;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(image, 0, 0);
      const { data } = ctx.getImageData(0, 0, size, size);
      setField(decodeRelief(data, size, meta.encoding.min, meta.encoding.max));
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, meta]);

  return field;
}

/**
 * The surface a river and a town marker hang on — exaggerated, and stepped if the style
 * is stepped, so features sit on the terrain rather than through it.
 */
export function surfaceHeights(
  field: Float32Array,
  meta: ReliefMeta,
  style: ValleyStyle,
): Float32Array {
  // Smoothing is already done, once, by the caller — see the memo in ValleyView. Doing
  // it here as well cost two full blurs of a quarter-million cells per render and wedged
  // the page.
  return style === 'terraced'
    ? terracedHeights(field, meta, TERRACE_STEP_M, VALLEY_EXAGGERATION, 0)
    : valleyHeights(field, meta, VALLEY_EXAGGERATION, 0);
}

/**
 * The topographic mesh, in one of three styles.
 *
 * - `gradient` — a hypsometric ramp with an ambient shade. The original, and the one
 *   that prompted this: at 120 km it reads as a stain rather than as ground.
 * - `terraced` — heights quantised to a 100 m contour interval, drawn flat-faced with
 *   the three-tone ramp keyed off each face's normal. This is the project's own rule
 *   ("form comes from face orientation rather than from lights") applied to terrain, and
 *   it makes the mountains siblings of the buildings rather than a different medium. It
 *   looks like a laser-cut site model, which is what an exhibition audience already
 *   knows how to read.
 * - `hillshade` — one base colour, form entirely from a north-west light. The
 *   cartographic convention, and the quietest of the three.
 */
export function valleyGeometry(
  field: Float32Array,
  meta: ReliefMeta,
  style: ValleyStyle = 'hillshade',
  stride: number = VALLEY_STRIDE,
): THREE.BufferGeometry {
  const { size } = meta.grid;
  const heights = surfaceHeights(field, meta, style);
  const side = valleySide(size, stride);

  const positions = new Float32Array(side * side * 3);
  const trueHeight = new Float32Array(side * side);

  for (let a = 0; a < side; a++) {
    for (let b = 0; b < side; b++) {
      const i = valleyRowOf(a, size, stride);
      const j = valleyRowOf(b, size, stride);
      const k = a * side + b;
      const [x, north] = valleyVertexAt(meta, i, j);
      positions[k * 3] = x;
      positions[k * 3 + 1] = heights[i * size + j];
      positions[k * 3 + 2] = -north;
      // Colour from the TRUE height above the plain, never the exaggerated one, so the
      // ramp keeps meaning metres.
      trueHeight[k] = field[i * size + j] - meta.base;
    }
  }

  const index = new Uint32Array((side - 1) * (side - 1) * 6);
  let n = 0;
  for (let a = 0; a < side - 1; a++) {
    for (let b = 0; b < side - 1; b++) {
      const p = a * side + b;
      const q = p + 1;
      const r = p + side;
      const t = r + 1;
      // Counter-clockwise seen from above (+Y), so the top face is the front face.
      index[n++] = p; index[n++] = r; index[n++] = q;
      index[n++] = q; index[n++] = r; index[n++] = t;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));

  if (style === 'terraced') {
    // FLAT faces, which needs one vertex per corner per triangle: a shared vertex would
    // average the normals across a step and smooth away the terrace that is the whole
    // point. Triangle count is unchanged; only the vertex count doubles.
    const flat = geometry.toNonIndexed();
    geometry.dispose();
    flat.computeVertexNormals();

    const position = flat.getAttribute('position');
    const normal = flat.getAttribute('normal');
    const colours = new Float32Array(position.count * 3);

    /**
     * One three-tone ramp per contour band, built on first use.
     *
     * There are five or six bands between the plain and Doi Inthanon, and 130,052
     * triangles. Calling `ramp()` per face meant 130,052 colour-space conversions per
     * rebuild, which froze the tab outright.
     */
     const bands = new Map<number, Record<string, THREE.Color>>();
    const bandFor = (level: number) => {
      let cached = bands.get(level);
      if (!cached) {
        const [r, g, b] = reliefColour(level);
        const hex = `#${new THREE.Color(r / 255, g / 255, b / 255).getHexString()}`;
        const tones = ramp(hex);
        cached = {
          top: new THREE.Color(tones.top),
          side: new THREE.Color(tones.side),
          shade: new THREE.Color(tones.shade),
        };
        bands.set(level, cached);
      }
      return cached;
    };

    for (let f = 0; f < position.count; f += 3) {
      // One tone for the whole triangle, from its own normal — exactly what
      // mergeBuildings does to every building in the city view.
      const tone = toneForNormal(normal.getX(f), normal.getY(f), normal.getZ(f));
      // The band comes from the highest corner, so a riser takes the colour of the
      // terrace it holds up rather than the one below it. Divided back out of the
      // exaggeration so the key is true metres and the cache has few entries.
      const top = Math.max(position.getY(f), position.getY(f + 1), position.getY(f + 2));
      const colour = bandFor(Math.round(top / VALLEY_EXAGGERATION))[tone];
      for (let v = 0; v < 3; v++) {
        colours[(f + v) * 3] = colour.r;
        colours[(f + v) * 3 + 1] = colour.g;
        colours[(f + v) * 3 + 2] = colour.b;
      }
    }

    flat.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    flat.computeBoundingSphere();
    return flat;
  }

  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const colours = new Float32Array(side * side * 3);
  /**
   * A warm near-white in the light, so the hillshade reads as a plaster relief model —
   * the same Warm White the city's ground plane uses, which is the point: the valley and
   * the diorama are then made of the same material at different scales. The shade end
   * carries purple since 24 Sep 2026, so the relief sits in the palette beside the
   * building stock rather than as the one grey thing on the page.
   */
  const litColour = new THREE.Color(RELIEF_HILLSHADE.lit);
  const shadowColour = new THREE.Color(RELIEF_HILLSHADE.shadow);
  const lit = [litColour.r, litColour.g, litColour.b] as const;
  const shadow = [shadowColour.r, shadowColour.g, shadowColour.b] as const;

  for (let k = 0; k < side * side; k++) {
    if (style === 'hillshade') {
      // Warm White in the light, a dusk violet in the shade — see RELIEF_HILLSHADE.
      const shade = hillshade(normals.getX(k), normals.getY(k), normals.getZ(k));
      const [r, g, b] = hillshadeColour(shade, lit, shadow);
      colours[k * 3] = r;
      colours[k * 3 + 1] = g;
      colours[k * 3 + 2] = b;
    } else if (style === 'thread') {
      /**
       * The same light as `hillshade`, quantised to five flat tones and mapped onto
       * purple — the exhibition's key visual draws these ranges as embroidery, and an
       * embroidered hill has a countable number of thread colours with visible
       * boundaries between them.
       *
       * Note what is NOT quantised: the mesh. Terracing stepped the geometry and lost
       * at this resolution; this steps only the shading, so the surface stays smooth
       * and the 469 m vertex spacing never enters into it.
       */
      const shade = hillshade(normals.getX(k), normals.getY(k), normals.getZ(k));
      const [r, g, b] = sampleRamp(RELIEF_RAMP_THREAD, posterise(shade, THREAD_BANDS));
      colours[k * 3] = r / 255;
      colours[k * 3 + 1] = g / 255;
      colours[k * 3 + 2] = b / 255;
    } else {
      const [r, g, b] = reliefColour(trueHeight[k]);
      const shade = reliefShade(normals.getY(k));
      colours[k * 3] = (r / 255) * shade;
      colours[k * 3 + 1] = (g / 255) * shade;
      colours[k * 3 + 2] = (b / 255) * shade;
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

type Path = { path: [number, number][] };

/**
 * Line segments for a set of paths, hung on the surface: every consecutive pair of
 * points becomes one segment, so a whole class of features is ONE fat-line draw. Points
 * are three.js world coordinates — [east, height, −north].
 */
function segmentsOn(
  paths: readonly Path[],
  heights: Float32Array,
  meta: ReliefMeta,
  lift: number,
): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const { path } of paths) {
    for (let i = 0; i + 1 < path.length; i++) {
      for (const p of [path[i], path[i + 1]]) {
        out.push([p[0], sampleHeight(heights, meta, p) + lift, -p[1]]);
      }
    }
  }
  return out;
}

/**
 * One class of strokes — the Ping, the other rivers, the trunk roads — as a single
 * `LineSegments2`. Fat lines, because `lineBasicMaterial` is a hairline on every GPU
 * that matters and a hairline at 120 km reads as a scratch; widths are screen pixels,
 * constant at every zoom. Never raycast: there are tens of thousands of segments and
 * nothing here is a target.
 */
function Strokes({
  points,
  width,
  color,
  opacity = 1,
  dashed = false,
  dashScale = 1,
}: {
  points: [number, number, number][];
  width: number;
  color: string;
  opacity?: number;
  dashed?: boolean;
  /** Stretches the dash pattern: 0.25 makes a 2 km dash an 8 km one, for a corridor. */
  dashScale?: number;
}) {
  if (points.length < 2) return null;
  return (
    <Line
      points={points}
      segments
      lineWidth={width}
      color={color}
      transparent={opacity < 1}
      opacity={opacity}
      dashed={dashed}
      // Dash lengths are world metres: a 2 km dash and a 1.2 km gap read as a railway
      // at the field's fit and are still a dashed line at three times it.
      dashSize={2000}
      gapSize={1200}
      dashScale={dashScale}
      toneMapped={false}
      raycast={() => null}
    />
  );
}

/**
 * The rivers that drew the basin, hung on the surface — three weights, three draws.
 * The Ping is the subject; the named tributaries are rivers; the unnamed entries are
 * reservoir outlines and stay thin.
 */
function Rivers({
  rivers,
  heights,
  meta,
  lift,
}: {
  rivers: ValleyFeatures['rivers'];
  heights: Float32Array;
  meta: ReliefMeta;
  lift: number;
}) {
  const byWeight = useMemo(() => {
    const groups: Record<WaterwayWeight, ValleyFeatures['rivers']> = { main: [], named: [], reservoir: [] };
    for (const r of rivers) groups[waterwayWeight(r.name)].push(r);
    return (Object.keys(groups) as WaterwayWeight[]).map((w) => ({
      weight: w,
      points: segmentsOn(groups[w], heights, meta, lift),
    }));
  }, [rivers, heights, meta, lift]);

  return (
    <>
      {byWeight.map(({ weight, points }) => (
        <Strokes
          key={weight}
          points={points}
          width={STROKE_PX[weight]}
          color={PALETTE_EXTENDED['cosmo.skyBlue']}
          opacity={weight === 'reservoir' ? 0.7 : 0.95}
        />
      ))}
    </>
  );
}

/** What each of the Past's threads is drawn in. The grammar — solid, dashed, nothing — is threads.ts's. */
const THREAD_COLOUR: Record<ThreadId, string> = {
  river: PALETTE_EXTENDED['cosmo.skyBlue'],
  caravans: PALETTE_EXTENDED['cosmo.coral'],
  // Purples, not slate and charcoal: on the plaster those read as black. The road and the
  // rail are confirmed and solid; the colour says "in the family", the line says "sure".
  roads: PALETTE['cosmo.violet'],
  rail: PALETTE_EXTENDED['cosmo.deepViolet'],
  air: PALETTE['cosmo.violet'],
};

/**
 * The Past's threads, as the certainty grammar says: the Ping solid, the caravan
 * corridors broad and dashed, Highway 11 and the railway solid, and nothing at all for
 * remote work. One fat-line draw per thread. The dashes here mean UNCERTAIN — not the
 * railway convention the Futures overlay uses — which is why the two never share code.
 */
function Threads({
  on,
  features,
  heights,
  meta,
  lift,
}: {
  on: ReadonlySet<ThreadId>;
  features: ValleyFeatures;
  heights: Float32Array;
  meta: ReliefMeta;
  lift: number;
}) {
  const strokes = useMemo(
    () =>
      threadStrokes(on, features).map((s) => ({
        ...s,
        points: segmentsOn(s.paths.map((path) => ({ path })), heights, meta, lift),
      })),
    [on, features, heights, meta, lift],
  );
  return (
    <>
      {strokes.map((s) => (
        <Strokes
          key={s.thread}
          points={s.points}
          width={s.style.widthPx}
          color={THREAD_COLOUR[s.thread]}
          opacity={s.style.opacity}
          dashed={s.style.dashed}
          dashScale={s.style.dashed && s.thread === 'caravans' ? 0.25 : 1}
        />
      ))}
    </>
  );
}

/**
 * The ways out of the basin: the main roads and the one railway, from OSM. An overlay,
 * so the caller says which chapter shows it — the Futures does, since 24 Sep 2026; the
 * Past draws its own routes as evidence allows and does not want these. Roads in slate
 * so they sit under the purple shadows rather than over them; the railway dashed and
 * darker, the map convention.
 */
function Transport({
  roads,
  rails,
  heights,
  meta,
  lift,
}: {
  roads: NonNullable<ValleyFeatures['roads']>;
  rails: NonNullable<ValleyFeatures['rails']>;
  heights: Float32Array;
  meta: ReliefMeta;
  lift: number;
}) {
  const strokes = useMemo(() => {
    const major = roads.filter((r) => r.kind === 'motorway' || r.kind === 'trunk');
    const primary = roads.filter((r) => r.kind === 'primary');
    return {
      major: segmentsOn(major, heights, meta, lift),
      primary: segmentsOn(primary, heights, meta, lift),
      rail: segmentsOn(rails, heights, meta, lift + 5),
    };
  }, [roads, rails, heights, meta, lift]);

  return (
    <>
      {/* In the purple family and well under full strength — Yan, 24 Sep 2026: slate and
          charcoal read as black on the plaster, and the roads are context, not subject. */}
      <Strokes points={strokes.primary} width={STROKE_PX.primary} color={PALETTE['cosmo.violet']} opacity={0.32} />
      <Strokes points={strokes.major} width={STROKE_PX.motorway} color={PALETTE['cosmo.violet']} opacity={0.45} />
      <Strokes points={strokes.rail} width={STROKE_PX.rail} color={PALETTE_EXTENDED['cosmo.deepViolet']} opacity={0.6} dashed />
    </>
  );
}

/**
 * The city, outlined on the valley floor.
 *
 * A patch rather than a dot: at 120 km across the scene rectangle is about 5% of the
 * frame, and that ratio is itself part of what the view says.
 */
function CityPatch({
  bounds,
  heights,
  meta,
  lift,
}: {
  bounds: [number, number, number, number];
  heights: Float32Array;
  meta: ReliefMeta;
  lift: number;
}) {
  const geometry = useMemo(() => {
    const { centre, width, depth } = cityPatchExtent(bounds);
    const [cx, cy] = centre;
    const hw = width / 2;
    const hd = depth / 2;
    const corners: [number, number][] = [
      [cx - hw, cy - hd],
      [cx + hw, cy - hd],
      [cx + hw, cy + hd],
      [cx - hw, cy + hd],
      [cx - hw, cy - hd],
    ];
    const points = new Float32Array(
      corners.flatMap(([x, y]) => [x, sampleHeight(heights, meta, [x, y]) + lift, -y]),
    );
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(points, 3));
    return g;
  }, [bounds, heights, meta, lift]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <line>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color={UI_TOKENS['ui.text']} toneMapped={false} />
    </line>
  );
}

/**
 * Town names, in the DOM over the canvas.
 *
 * Same decision as the circle view's city labels and as every other piece of copy in
 * this project: text stays selectable, scalable and readable by a screen reader rather
 * than being baked into a texture. See the accessibility note in docs/roadmap.md.
 */
function Towns({
  towns,
  heights,
  meta,
  lift,
  hide,
}: {
  towns: ValleyFeatures['towns'];
  heights: Float32Array;
  meta: ReliefMeta;
  lift: number;
  /** Names a pin already carries — a town with an icon on it needs no marker. */
  hide: ReadonlySet<string>;
}) {
  return (
    <>
      {towns.slice(0, MAX_LABELS).filter((t) => LABELLED_TOWNS.has(t.name) && !hide.has(t.name)).map((town) => (
        <Html
          key={town.name}
          position={[town.at[0], sampleHeight(heights, meta, town.at) + lift, -town.at[1]]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <span className="valley-town">{town.name}</span>
        </Html>
      ))}
    </>
  );
}

/** A little under the city's 88: eight landmarks on one field, some a few kilometres apart. */
const VALLEY_PIN_PX = 72;
const NO_PINS: readonly Hotspot[] = [];
const NO_COPY: ReadonlyMap<string, PinCopy> = new Map();

export function ValleyView({
  source,
  sceneBounds,
  style = 'hillshade',
  labelled = true,
  pins = NO_PINS,
  pinCopy = NO_COPY,
  openPin = null,
  onOpenPin,
  pinsInteractive = false,
  transport = false,
  threads = null,
}: {
  source: ValleySource;
  sceneBounds: [number, number, number, number];
  style?: ValleyStyle;
  /**
   * Whether the town names are on. The mesh follows its group's `visible`, but the
   * labels are DOM (`Html`) and do not — so a valley kept mounted behind the circle
   * would still print Lamphun over the Bay of Bengal. A view owns its overlay; the
   * caller says when this one is the view.
   */
  labelled?: boolean;
  /** The Futures pins placed in the valley, already filtered to what this beat shows. */
  pins?: readonly Hotspot[];
  pinCopy?: ReadonlyMap<string, PinCopy>;
  openPin?: string | null;
  onOpenPin?: (id: string | null) => void;
  pinsInteractive?: boolean;
  /** Draw the main roads and the railway. An overlay, so it is the chapter's call. */
  transport?: boolean;
  /**
   * The Past's threads to draw, or null when this is not the valley-as-past. When set,
   * the rivers are not drawn as substrate: the Ping is the first thread and arrives with
   * its beat. See threads.ts for why these strokes are not the transport overlay.
   */
  threads?: ReadonlySet<ThreadId> | null;
}) {
  const raw = useValleyField(source.url, source.meta);

  /** Town names a visible pin already carries, so the two never label one place twice. */
  const pinnedNames = useMemo(() => {
    const names = new Set<string>();
    for (const p of pins) {
      const label = pinCopy.get(p.id)?.label;
      if (label) names.add(label);
    }
    return names;
  }, [pins, pinCopy]);

  /**
   * The canopy taken off, once.
   *
   * The Copernicus DEM is a surface model, so it carries buildings and tree cover as
   * 10-40 m of jitter. Memoised on the field alone rather than on the style, because the
   * blur is the expensive part and it is the same blur for all three styles.
   */
  const field = useMemo(
    () => (raw ? smoothField(raw, source.meta.grid.size) : null),
    [raw, source.meta.grid.size],
  );

  const geometry = useMemo(
    () => (field ? valleyGeometry(field, source.meta, style) : null),
    [field, source.meta, style],
  );

  // What the rivers and markers hang on: the same surface the mesh was built from, so
  // they step where it steps.
  const heights = useMemo(
    () => (field ? surfaceHeights(field, source.meta, style) : null),
    [field, source.meta, style],
  );

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry || !heights) return null;

  const features = source.features ?? null;

  return (
    <group>
      <mesh geometry={geometry} raycast={() => null}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      {!threads && features && features.rivers.length > 0 && (
        <Rivers rivers={features.rivers} heights={heights} meta={source.meta} lift={60} />
      )}
      {threads && features && (
        <Threads on={threads} features={features} heights={heights} meta={source.meta} lift={60} />
      )}
      {transport && features && (features.roads?.length || features.rails?.length) ? (
        <Transport
          roads={features.roads ?? []}
          rails={features.rails ?? []}
          heights={heights}
          meta={source.meta}
          lift={70}
        />
      ) : null}
      <CityPatch bounds={sceneBounds} heights={heights} meta={source.meta} lift={90} />
      {labelled && features && features.towns.length > 0 && (
        <Towns towns={features.towns} heights={heights} meta={source.meta} lift={200} hide={pinnedNames} />
      )}
      {/* The 2045 overlay on the valley-as-futures: DOM, so gated like the labels — a valley
          kept mounted behind another view must not leave its pins on the screen. */}
      {labelled && pins.length > 0 && (
        <PinLayer
          pins={pins}
          copy={pinCopy}
          heightAt={(at: Point2) => sampleHeight(heights, source.meta, at)}
          halfFrameM={Math.abs(source.meta.grid.bboxM[2])}
          sizePx={VALLEY_PIN_PX}
          openId={openPin}
          onOpen={onOpenPin ?? (() => {})}
          interactive={pinsInteractive}
        />
      )}
    </group>
  );
}
