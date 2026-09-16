'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { buildingGeometry, idForFace, mergeBuildings } from './merge';
import { stockTint } from './registers';
import type { BaselineBuilding } from './scene';
import { UI_TOKENS } from './theme';

const NO_HEROES: ReadonlySet<string> = new Set();

/**
 * Every baseline building, in two meshes.
 *
 * `docs/architecture.md` requires merging, and at 1,182 buildings it is the whole
 * difference between a few dozen draw calls and twelve hundred. Picking survives it:
 * a tap gives a face index, and `idForFace` maps that back to an OSM id, so the
 * selection behaviour is exactly what a mesh-per-building gave.
 *
 * Two meshes rather than one because of semantic zoom: at district scale the
 * buildings that carry content have to read out of the stock, and the cheapest way
 * to say that is a second merge with its own material tint. Two draw calls against
 * a budget of "a few dozen" is not a cost worth optimising away.
 *
 * **Heroes are the buildings a hotspot points at.** That is deliberately not a new
 * schema field — the set of buildings worth emphasising and the set of buildings
 * somebody wrote a panel about are the same set, and keeping them the same set means
 * they cannot drift. Until hotspots are authored the hero set is empty, every
 * building is stock, and `stockTint` switches the effect off entirely.
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
  heroIds = NO_HEROES,
  detail = 0,
  pickable = true,
  stockMaterialRef,
}: {
  buildings: BaselineBuilding[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  wireframe?: boolean;
  heroIds?: ReadonlySet<string>;
  /** 0 at district-fit, 1 at block-fit. From registers.ts. */
  detail?: number;
  /** False through the region handover, so a tap near the marker hits nothing. */
  pickable?: boolean;
  stockMaterialRef?: React.RefObject<THREE.MeshBasicMaterial | null>;
}) {
  const { heroes, stock } = useMemo(() => {
    // One pass, and it keeps document order inside each group so the merge ranges
    // stay in the order idForFace's binary search expects.
    const heroList: BaselineBuilding[] = [];
    const stockList: BaselineBuilding[] = [];
    for (const b of buildings) (heroIds.has(b.id) ? heroList : stockList).push(b);
    return { heroes: mergeBuildings(heroList), stock: mergeBuildings(stockList) };
  }, [buildings, heroIds]);

  const outline = useMemo(() => {
    const selected = buildings.find((b) => b.id === selectedId);
    if (!selected) return null;
    try {
      return new THREE.EdgesGeometry(buildingGeometry(selected));
    } catch {
      return null;
    }
  }, [buildings, selectedId]);

  const tint = stockTint(detail, heroIds.size);

  const layers = [
    { key: 'stock', merged: stock, tint, materialRef: stockMaterialRef },
    { key: 'heroes', merged: heroes, tint: 1, materialRef: undefined },
  ] as const;

  return (
    // Extrusion happens in XY and pushes along +Z, so lay it flat: the shape's
    // +y (north) becomes -z, and the extrusion becomes +y (up). That is the
    // convention in docs/architecture.md, "Coordinates and units".
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {layers.map(({ key, merged, tint: layerTint, materialRef }) =>
        merged.triangles === 0 ? null : (
          <mesh
            key={key}
            geometry={merged.geometry}
            raycast={pickable ? undefined : () => null}
            onClick={(e) => {
              if (!pickable) return;
              const id = idForFace(merged.ranges, e.faceIndex);
              if (!id) return;
              e.stopPropagation();
              onSelect(id);
            }}
          >
            <meshBasicMaterial
              ref={materialRef}
              vertexColors
              // Multiplied into the vertex colours, which is how the stock recedes
              // without a second palette or a shader.
              color={new THREE.Color(layerTint, layerTint, layerTint)}
              wireframe={wireframe}
              toneMapped={false}
            />
          </mesh>
        ),
      )}

      {outline && (
        <lineSegments geometry={outline}>
          <lineBasicMaterial color={UI_TOKENS['ui.text']} toneMapped={false} />
        </lineSegments>
      )}
    </group>
  );
}
