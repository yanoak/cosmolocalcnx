'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { footprintToExtrudeArgs, type Point2 } from './extrude';
import { toneForNormal } from './shading';
import { roleForKind, type Ramp } from './theme';

/**
 * One extruded footprint, unlit, with each face taking a ramp tone from its normal.
 *
 * Note on picking: day one selects baseline buildings because there is nothing else
 * in the scene yet. Production picks hotspots and placed objects only — baseline
 * geometry gets merged for the performance budget and stops being individually
 * pickable. Nothing here may assume otherwise.
 */
export function Building({
  id,
  footprint,
  height,
  kind,
  selected,
  onSelect,
  wireframe = false,
}: {
  id: string;
  footprint: Point2[];
  height: number;
  kind: string;
  selected: boolean;
  onSelect: (id: string) => void;
  wireframe?: boolean;
}) {
  const ramp = roleForKind(kind);

  const geometry = useMemo(() => {
    const { points, depth } = footprintToExtrudeArgs(footprint, height);
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.computeVertexNormals();
    applyRampColors(geo, ramp);
    return geo;
  }, [footprint, height, ramp]);

  return (
    <mesh
      // Extrusion happens in XY and pushes along +Z, so lay it flat: the shape's
      // +y (north) becomes -z, and the extrusion becomes +y (up). That is the
      // convention in docs/architecture.md, "Coordinates and units".
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={geometry}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
    >
      <meshBasicMaterial vertexColors wireframe={wireframe} toneMapped={false} />
      {selected && (
        <lineSegments>
          <edgesGeometry args={[geometry]} />
          <lineBasicMaterial color="#1E2F49" linewidth={2} toneMapped={false} />
        </lineSegments>
      )}
    </mesh>
  );
}

/**
 * Writes the three-tone ramp into vertex colours, chosen per face normal.
 *
 * toneMapped={false} on the material and sRGB colour conversion here are what make
 * a rendered face match its token swatch in the DOM. Getting this wrong is the
 * classic half-day; verification step 5 in the plan checks it deliberately.
 */
function applyRampColors(geo: THREE.BufferGeometry, ramp: Ramp): void {
  const normals = geo.getAttribute('normal');
  const colors = new Float32Array(normals.count * 3);
  const cache: Record<string, THREE.Color> = {
    top: new THREE.Color(ramp.top),
    side: new THREE.Color(ramp.side),
    shade: new THREE.Color(ramp.shade),
  };

  for (let i = 0; i < normals.count; i++) {
    const tone = toneForNormal(normals.getX(i), normals.getY(i), normals.getZ(i));
    const c = cache[tone];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
