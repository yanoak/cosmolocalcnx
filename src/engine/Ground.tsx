'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { Point2 } from './extrude';
import { GROUND, PALETTE } from './theme';

/** The ground plane. Flat, only ever seen from above, so no ramp. */
export function Ground({ size = 400 }: { size?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[20, -0.02, 0]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial color={GROUND.ground} toneMapped={false} />
    </mesh>
  );
}

/**
 * The Ping, as a flat polygon. Two shapes and about ten lines, and it is the
 * difference between "a dozen boxes" and "an east-bank neighbourhood" — which is
 * the question day one exists to answer.
 */
export function Water({ footprint }: { footprint: Point2[] }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(footprint.map(([x, y]) => new THREE.Vector2(x, y)));
    return new THREE.ShapeGeometry(shape);
  }, [footprint]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} geometry={geometry}>
      <meshBasicMaterial color={PALETTE['progress.blue']} toneMapped={false} />
    </mesh>
  );
}
