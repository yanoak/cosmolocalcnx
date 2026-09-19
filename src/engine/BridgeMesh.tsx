'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { bridgesSoup } from './bridges';
import type { BaselineArea, BaselineRoad } from './scene';

/**
 * Every bridge in the baseline, as one unlit merged mesh.
 *
 * Generated, not placed: `bridges.ts` reads the roads that carry OSM's `bridge`
 * flag, keeps those that cross water, and builds deck, ramps, parapets and piers
 * in scene metres. A few dozen bridges come to a few thousand triangles, so this
 * is one draw call and never a budget question.
 *
 * Not pickable, like the ground: the bridge is furniture, and a tap through it
 * should hit what is under it.
 *
 * Named BridgeMesh rather than Bridges because `bridges.ts` holds the generator,
 * and two files differing only in casing is one file on macOS and two on the
 * Linux box Vercel builds on. Same lesson as RegionPlane.tsx and ReliefBackdrop.tsx.
 */
export function BridgeMesh({ roads, water }: { roads: BaselineRoad[]; water: BaselineArea[] }) {
  const geometry = useMemo(() => {
    const soup = bridgesSoup(roads, water);
    if (soup.positions.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(soup.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(soup.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(soup.colors, 3));
    g.computeBoundingSphere();
    return g;
  }, [roads, water]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshBasicMaterial vertexColors toneMapped={false} />
    </mesh>
  );
}
