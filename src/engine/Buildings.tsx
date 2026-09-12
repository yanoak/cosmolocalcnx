'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { buildingGeometry, idForFace, mergeBuildings } from './merge';
import type { BaselineBuilding } from './scene';
import { UI_TOKENS } from './theme';

/**
 * Every baseline building, in one mesh.
 *
 * `docs/architecture.md` requires merging, and at 1,182 buildings it is the whole
 * difference between a few dozen draw calls and twelve hundred. Picking survives it:
 * a tap gives a face index, and `idForFace` maps that back to an OSM id, so the
 * selection behaviour is exactly what a mesh-per-building gave.
 *
 * The architecture note that baseline buildings stop being pickable in production
 * still stands as a *permission*, not a requirement — if picking ever costs
 * something, it can go. It currently costs one array and a binary search.
 */
export function Buildings({
  buildings,
  selectedId,
  onSelect,
  wireframe = false,
}: {
  buildings: BaselineBuilding[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  wireframe?: boolean;
}) {
  const merged = useMemo(() => mergeBuildings(buildings), [buildings]);

  const outline = useMemo(() => {
    const selected = buildings.find((b) => b.id === selectedId);
    if (!selected) return null;
    try {
      return new THREE.EdgesGeometry(buildingGeometry(selected));
    } catch {
      return null;
    }
  }, [buildings, selectedId]);

  return (
    // Extrusion happens in XY and pushes along +Z, so lay it flat: the shape's
    // +y (north) becomes -z, and the extrusion becomes +y (up). That is the
    // convention in docs/architecture.md, "Coordinates and units".
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh
        geometry={merged.geometry}
        onClick={(e) => {
          const id = idForFace(merged.ranges, e.faceIndex);
          if (!id) return;
          e.stopPropagation();
          onSelect(id);
        }}
      >
        <meshBasicMaterial vertexColors wireframe={wireframe} toneMapped={false} />
      </mesh>

      {outline && (
        <lineSegments geometry={outline}>
          <lineBasicMaterial color={UI_TOKENS['ui.text']} toneMapped={false} />
        </lineSegments>
      )}
    </group>
  );
}
