'use client';

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { Bounds } from './Ground';
import {
  decodeRelief,
  reliefColour,
  reliefHeights,
  reliefShade,
  reliefVertexAt,
  type ReliefMeta,
} from './relief';

/**
 * The relief backdrop: one unlit, vertex-coloured mesh of the land around the
 * district, flattened under the scene rectangle.
 *
 * Lives inside the district group, so it shrinks and fades with the district in
 * the handover and needs no register logic of its own. At district-fit it fills
 * the frame beyond the rectangle; at the ladder's region anchor the whole box is
 * in view just before the circle takes over.
 *
 * Not `terrain`. Nothing in the baseline sits on this — see relief.ts.
 *
 * Named ReliefBackdrop rather than Relief because `relief.ts` holds the maths, and
 * two files differing only in casing is fine on macOS and two different files on
 * the Linux box Vercel builds on. Same lesson as RegionPlane.tsx.
 */

export interface ReliefSource {
  url: string;
  meta: ReliefMeta;
}

function useReliefField(url: string, meta: ReliefMeta) {
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
 * How many of the field's cells to skip when building the mesh.
 *
 * The committed field is 256 x 256, which is 130,050 triangles — and once the far city
 * became a raster on 21 Sep 2026 that made the RELIEF the largest single object in the
 * scene, bigger than every building in Wat Ket put together. Measured on the static
 * export: 255,330 triangles total, against a budget of 100-150k.
 *
 * At 2 this is 32,258 triangles, a 98k saving for cells of 375 m instead of 187.5 m
 * across a backdrop that spans 48 km and is only ever seen from district-fit outwards.
 * The field itself is untouched — this is a draw-time decision, like the flattening
 * under the scene rectangle, so raising it needs no refetch of the DEM.
 */
const RELIEF_STRIDE = 2;

/** Build the mesh: positions from the grid, heights from the field, colours from both. */
export function reliefGeometry(
  field: Float32Array,
  meta: ReliefMeta,
  scene: Bounds,
  stride: number = RELIEF_STRIDE,
): THREE.BufferGeometry {
  const { size } = meta.grid;
  const heights = reliefHeights(field, meta, scene);

  // Vertices per side after decimating. The last one snaps to the field's edge so the
  // backdrop keeps its full extent rather than losing a cell off the north and east.
  const side = Math.floor((size - 1) / stride) + 1;
  const rowOf = (a: number) => (a === side - 1 ? size - 1 : a * stride);

  const positions = new Float32Array(side * side * 3);
  const sampled = new Float32Array(side * side);
  for (let a = 0; a < side; a++) {
    for (let b = 0; b < side; b++) {
      const i = rowOf(a);
      const j = rowOf(b);
      const k = a * side + b;
      const [x, north] = reliefVertexAt(meta, i, j);
      // Scene x/y are east/north; three.js has north as -Z and height as +Y.
      positions[k * 3] = x;
      positions[k * 3 + 1] = heights[i * size + j];
      positions[k * 3 + 2] = -north;
      sampled[k] = heights[i * size + j];
    }
  }

  const quads = (side - 1) * (side - 1);
  const index = new Uint32Array(quads * 6);
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

export function ReliefBackdrop({ source, scene }: { source: ReliefSource; scene: Bounds }) {
  const field = useReliefField(source.url, source.meta);

  const geometry = useMemo(
    () => (field ? reliefGeometry(field, source.meta, scene) : null),
    [field, source.meta, scene],
  );

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;

  return (
    // Backdrop is not pickable, for the same reason the ground is not.
    <mesh geometry={geometry} raycast={() => null}>
      <meshBasicMaterial vertexColors toneMapped={false} />
    </mesh>
  );
}
