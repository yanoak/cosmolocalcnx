'use client';

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { decodeRelief, reliefColour, reliefShade, type ReliefMeta } from './relief';
import { UI_TOKENS } from './theme';
import {
  cityPatchExtent,
  valleyHeights,
  valleyRowOf,
  valleySide,
  valleyVertexAt,
  VALLEY_STRIDE,
} from './valley';

/**
 * The valley view: the basin Chiang Mai grew in, 120 km across.
 *
 * The middle of the three views added 21 Sep 2026. Unlike `ReliefBackdrop`, which draws
 * the land AROUND the city and flattens it underneath, this draws the topography as the
 * subject — nothing is flattened, nothing is feathered, and the mountains are the point.
 *
 * Still not `terrain`. This is its own view with its own field, and no building, road or
 * water polygon is anywhere near it. The city appears as an outlined patch, which is a
 * rectangle drawn on a surface, not a diorama draped over one.
 *
 * Named ValleyView rather than Valley because `valley.ts` holds the maths — the casing
 * trap that has now been paid for five times in this repo.
 */

export interface ValleySource {
  url: string;
  meta: ReliefMeta;
}

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
 * The topographic mesh.
 *
 * Same construction as the relief backdrop's — a decimated grid, vertex colours from the
 * hypsometric ramp in `theme.ts`, shaded by the surface normal so form reads without a
 * light. What differs is `valleyHeights`: no flattening, and a stated vertical
 * exaggeration, because a true-scale 120 km basin holding 1.4 km of relief renders as a
 * flat sheet.
 */
export function valleyGeometry(
  field: Float32Array,
  meta: ReliefMeta,
  stride: number = VALLEY_STRIDE,
): THREE.BufferGeometry {
  const { size } = meta.grid;
  const heights = valleyHeights(field, meta);
  const side = valleySide(size, stride);

  const positions = new Float32Array(side * side * 3);
  const sampled = new Float32Array(side * side);

  for (let a = 0; a < side; a++) {
    for (let b = 0; b < side; b++) {
      const i = valleyRowOf(a, size, stride);
      const j = valleyRowOf(b, size, stride);
      const k = a * side + b;
      const [x, north] = valleyVertexAt(meta, i, j);
      // Scene x/y are east/north; three.js has north as -Z and height as +Y.
      positions[k * 3] = x;
      positions[k * 3 + 1] = heights[i * size + j];
      positions[k * 3 + 2] = -north;
      // Colour from the TRUE height above the plain, not the exaggerated one, so the
      // hypsometric ramp keeps meaning metres.
      sampled[k] = field[i * size + j] - meta.base;
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
  geometry.computeVertexNormals();

  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const colours = new Float32Array(side * side * 3);
  for (let k = 0; k < side * side; k++) {
    const [r, g, b] = reliefColour(sampled[k]);
    const shade = reliefShade(normals.getY(k));
    colours[k * 3] = (r / 255) * shade;
    colours[k * 3 + 1] = (g / 255) * shade;
    colours[k * 3 + 2] = (b / 255) * shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The city, outlined on the valley floor.
 *
 * A patch rather than a dot: at 120 km across the scene rectangle is about 5% of the
 * frame, and that ratio is itself part of what the view says. Drawn slightly above the
 * surface so it does not z-fight with the terrain it sits on.
 */
function CityPatch({
  bounds,
  lift,
}: {
  bounds: [number, number, number, number];
  lift: number;
}) {
  const geometry = useMemo(() => {
    const { centre, width, depth } = cityPatchExtent(bounds);
    const [cx, cy] = centre;
    const hw = width / 2;
    const hd = depth / 2;
    const ring = new Float32Array([
      cx - hw, lift, -(cy - hd),
      cx + hw, lift, -(cy - hd),
      cx + hw, lift, -(cy + hd),
      cx - hw, lift, -(cy + hd),
      cx - hw, lift, -(cy - hd),
    ]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(ring, 3));
    return g;
  }, [bounds, lift]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <line>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color={UI_TOKENS['ui.text']} toneMapped={false} />
    </line>
  );
}

export function ValleyView({
  source,
  sceneBounds,
}: {
  source: ValleySource;
  sceneBounds: [number, number, number, number];
}) {
  const field = useValleyField(source.url, source.meta);

  const geometry = useMemo(
    () => (field ? valleyGeometry(field, source.meta) : null),
    [field, source.meta],
  );

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;

  return (
    <group>
      {/* Not pickable yet — town labels are the next task, and they will be DOM over the
          canvas like every other piece of copy in this project. */}
      <mesh geometry={geometry} raycast={() => null}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      {/* Lifted clear of the exaggerated surface rather than of the true one. */}
      <CityPatch bounds={sceneBounds} lift={40} />
    </group>
  );
}
