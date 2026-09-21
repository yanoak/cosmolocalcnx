'use client';

import { Html } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { decodeRelief, reliefColour, reliefShade, type ReliefMeta } from './relief';
import { toneForNormal } from './shading';
import { PALETTE_EXTENDED, ramp, UI_TOKENS } from './theme';
import {
  cityPatchExtent,
  hillshade,
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
  type ValleyStyle,
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
  towns: { name: string; population: number; at: [number, number] }[];
}

export interface ValleySource {
  url: string;
  meta: ReliefMeta;
  features?: ValleyFeatures | null;
}

/** How many towns get a label. Beyond this a landscape becomes a table of contents. */
const MAX_LABELS = 7;

function useValleyField(url: string, meta: ReliefMeta) {
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
  style: ValleyStyle = 'terraced',
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
  // One colour for the whole surface: the hillshade style carries form with light, so
  // any hue that is not the water's or the city's will do. Slate is the brand's neutral.
  const base = new THREE.Color(PALETTE_EXTENDED['cosmo.slate']);

  for (let k = 0; k < side * side; k++) {
    if (style === 'hillshade') {
      const shade = hillshade(normals.getX(k), normals.getY(k), normals.getZ(k));
      colours[k * 3] = base.r * shade;
      colours[k * 3 + 1] = base.g * shade;
      colours[k * 3 + 2] = base.b * shade;
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

/**
 * The rivers that drew the basin, hung on the surface.
 *
 * One geometry for all of them — 387 named waterways would otherwise be 387 draw calls
 * against a budget of a few dozen, which is the same arithmetic that made merging
 * mandatory for the buildings.
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
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (const river of rivers) {
      for (let i = 0; i + 1 < river.path.length; i++) {
        for (const p of [river.path[i], river.path[i + 1]]) {
          points.push(p[0], sampleHeight(heights, meta, p) + lift, -p[1]);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
    return g;
  }, [rivers, heights, meta, lift]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={PALETTE_EXTENDED['cosmo.skyBlue']}
        toneMapped={false}
        transparent
        opacity={0.9}
      />
    </lineSegments>
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
}: {
  towns: ValleyFeatures['towns'];
  heights: Float32Array;
  meta: ReliefMeta;
  lift: number;
}) {
  return (
    <>
      {towns.slice(0, MAX_LABELS).map((town) => (
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

export function ValleyView({
  source,
  sceneBounds,
  style = 'terraced',
}: {
  source: ValleySource;
  sceneBounds: [number, number, number, number];
  style?: ValleyStyle;
}) {
  const raw = useValleyField(source.url, source.meta);

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
      {features && features.rivers.length > 0 && (
        <Rivers rivers={features.rivers} heights={heights} meta={source.meta} lift={60} />
      )}
      <CityPatch bounds={sceneBounds} heights={heights} meta={source.meta} lift={90} />
      {features && features.towns.length > 0 && (
        <Towns towns={features.towns} heights={heights} meta={source.meta} lift={200} />
      )}
    </group>
  );
}
