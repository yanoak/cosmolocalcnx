'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeAreas } from './merge';
import { drawRoads, roadTextureLayout } from './roads';
import type { BaselineArea, BaselineRoad } from './scene';
import { GROUND, SURFACE_ROLES, roadTone } from './theme';

export type Bounds = [number, number, number, number];

/**
 * The ground, with the street network drawn into its texture.
 *
 * Roads are a canvas texture rather than geometry — see docs/architecture.md. 513
 * polylines buffered into ribbons would cost more triangles than every building in
 * Wat Ket put together, and at this scale it would look no better.
 */
export function Ground({ bounds, roads }: { bounds: Bounds; roads: BaselineRoad[] }) {
  const texture = useMemo(() => {
    const layout = roadTextureLayout(bounds);
    const canvas = document.createElement('canvas');
    canvas.width = layout.width;
    canvas.height = layout.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = GROUND.ground;
    ctx.fillRect(0, 0, layout.width, layout.height);
    drawRoads(ctx, roads, layout, roadTone);

    const map = new THREE.CanvasTexture(canvas);
    // The texture is authored in sRGB and the material is unlit, so it must be
    // declared as such or every road comes out the wrong tone against its token.
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return { map, layout };
  }, [bounds, roads]);

  // A CanvasTexture holds GPU memory until it is told not to.
  useEffect(() => () => texture?.map.dispose(), [texture]);

  if (!texture) return null;

  const [pw, ps, pe, pn] = texture.layout.bounds;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[(pw + pe) / 2, -0.02, -(ps + pn) / 2]}
      // Baseline ground is not pickable: only hotspots and placed objects are, and
      // a full-scene plane that swallows taps is the classic way to break that.
      raycast={() => null}
    >
      <planeGeometry args={[pe - pw, pn - ps]} />
      <meshBasicMaterial map={texture.map} toneMapped={false} />
    </mesh>
  );
}

/**
 * Water and green, each merged into a single flat geometry.
 *
 * The Ping runs off both ends of the scene and is one 592-point multipolygon, which
 * is why water clips by overlap rather than by centroid in the import — cutting the
 * river to the boundary would leave the diorama's edge looking bombed.
 */
export function GroundAreas({ water, green }: { water: BaselineArea[]; green: BaselineArea[] }) {
  const layers = useMemo(
    () => [
      // Green first, so a pond inside a park reads as water rather than being
      // painted over by it.
      { key: 'green', merged: mergeAreas(green, GROUND.green), y: -0.015 },
      { key: 'water', merged: mergeAreas(water, SURFACE_ROLES.water.side), y: -0.01 },
    ],
    [water, green],
  );

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {layers.map(({ key, merged, y }) =>
        merged.triangles === 0 ? null : (
          // Laid out in the buildings' XY convention, so `y` here is the scene's
          // vertical axis after the group rotation.
          <mesh key={key} geometry={merged.geometry} position={[0, 0, -y]} raycast={() => null}>
            <meshBasicMaterial vertexColors toneMapped={false} />
          </mesh>
        ),
      )}
    </group>
  );
}
