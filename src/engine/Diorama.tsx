'use client';

import { MapControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Building } from './Building';
import { DebugOverlay } from './DebugOverlay';
import { Ground, Water } from './Ground';
import type { BaselineBuilding } from './scene';
import type { Point2 } from './extrude';

/**
 * A fixed isometric diorama you inspect, not a world you traverse.
 *
 * Orthographic camera on the (1, 1, 1) diagonal — 45 degrees around Y, ~35.264
 * degrees down. MapControls constrained to pan and zoom, never rotate: touch is the
 * primary input and a visitor who rotates the camera into a wall leaves a broken
 * screen for the next person. See docs/architecture.md.
 */
export function Diorama({
  buildings,
  water,
  selectedId,
  onSelect,
  debug,
  wireframe,
}: {
  buildings: BaselineBuilding[];
  water: { id: string; footprint: Point2[] }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  debug: boolean;
  wireframe: boolean;
}) {
  return (
    <Canvas
      orthographic
      // Nothing in this scene animates: it is a diorama, not a game. Rendering on
      // demand rather than every frame is most of a phone's battery and thermal
      // budget back, and thermal throttling over a long exhibition day is the
      // realistic failure mode. R3F re-renders on React commits and on control
      // changes, which is every case that matters here.
      frameloop="demand"
      camera={{ position: [220, 200, 200], zoom: 3.2, near: -2000, far: 4000 }}
      // Clicking past every building clears the selection.
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#E4E0D6']} />

      <Ground />
      {water.map((w) => (
        <Water key={w.id} footprint={w.footprint} />
      ))}

      {buildings.map((b) => (
        <Building
          key={b.id}
          id={b.id}
          footprint={b.footprint}
          height={b.height}
          kind={b.kind}
          selected={b.id === selectedId}
          onSelect={onSelect}
          wireframe={wireframe}
        />
      ))}

      {debug && <DebugOverlay wireframe={wireframe} />}

      <MapControls
        makeDefault
        enableRotate={false}
        target={[20, 0, 0]}
        minZoom={1}
        maxZoom={20}
      />
    </Canvas>
  );
}

