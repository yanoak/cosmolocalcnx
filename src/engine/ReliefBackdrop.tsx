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

/** Build the mesh: positions from the grid, heights from the field, colours from both. */
export function reliefGeometry(field: Float32Array, meta: ReliefMeta, scene: Bounds): THREE.BufferGeometry {
  const { size } = meta.grid;
  const heights = reliefHeights(field, meta, scene);

  const positions = new Float32Array(size * size * 3);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const k = i * size + j;
      const [x, north] = reliefVertexAt(meta, i, j);
      // Scene x/y are east/north; three.js has north as -Z and height as +Y.
      positions[k * 3] = x;
      positions[k * 3 + 1] = heights[k];
      positions[k * 3 + 2] = -north;
    }
  }

  const quads = (size - 1) * (size - 1);
  const index = new Uint32Array(quads * 6);
  let n = 0;
  for (let i = 0; i < size - 1; i++) {
    for (let j = 0; j < size - 1; j++) {
      const a = i * size + j;
      const b = a + 1;
      const c = a + size;
      const d = c + 1;
      // Counter-clockwise seen from above (+Y), so the top face is the front face.
      index[n++] = a; index[n++] = c; index[n++] = b;
      index[n++] = b; index[n++] = c; index[n++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();

  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const colours = new Float32Array(size * size * 3);
  for (let k = 0; k < size * size; k++) {
    const [r, g, b] = reliefColour(heights[k]);
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
