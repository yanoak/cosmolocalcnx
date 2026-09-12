'use client';

import { MapControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Buildings } from './Buildings';
import { isometricFit, type Bounds } from './camera';
import { DebugOverlay } from './DebugOverlay';
import { Ground, GroundAreas } from './Ground';
import type { BaselineArea, BaselineBuilding, BaselineRoad } from './scene';
import { PALETTE } from './theme';

export type { Bounds };

interface Size {
  width: number;
  height: number;
}

/**
 * Measure the stage ourselves, and mount the canvas only once it has a real size.
 *
 * R3F measures its own parent, and on this layout it loses a race with it: the
 * canvas stays at its 300x150 HTML default and R3F will not start a renderer it
 * believes has zero size — so the viewer opens BLANK, with no error anywhere,
 * roughly one load in two. It survived day one only because a debug toggle or a
 * window resize forces a re-measure, which is exactly what a visitor will never do.
 *
 * Measuring here removes the race rather than hiding it: the canvas is given a
 * definite pixel size, and the same number feeds the camera fit, so there is one
 * source of truth for how big the stage is.
 */
function useMeasuredStage(): [React.RefObject<HTMLDivElement | null>, Size | null] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      setSize((previous) =>
        previous && previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

/**
 * Draw again whenever the page becomes visible.
 *
 * `frameloop="demand"` schedules its frames through requestAnimationFrame, which
 * browsers do not run in a backgrounded tab. So a first frame requested while the
 * page is hidden is simply dropped, and nothing asks for another — the visitor
 * arrives at a blank diorama with no error and no way to recover but to resize the
 * window.
 *
 * That is not a hypothetical on this project. **The primary surface is a QR code**,
 * and a scanned link routinely opens in a background tab that the visitor then
 * switches to. Four lines, and it removes the one failure mode that would look
 * exactly like the installation being broken.
 */
function RedrawOnVisible() {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const redraw = () => invalidate();
    document.addEventListener('visibilitychange', redraw);
    // Back/forward cache restores skip visibilitychange entirely.
    window.addEventListener('pageshow', redraw);
    return () => {
      document.removeEventListener('visibilitychange', redraw);
      window.removeEventListener('pageshow', redraw);
    };
  }, [invalidate]);

  return null;
}

/**
 * A fixed isometric diorama you inspect, not a world you traverse.
 *
 * Orthographic camera on the (1, 1, 1) diagonal. MapControls constrained to pan and
 * zoom, never rotate: touch is the primary input and a visitor who rotates the
 * camera into a wall leaves a broken screen for the next person. See
 * docs/architecture.md.
 */
export function Diorama({
  bounds,
  buildings,
  roads,
  water,
  green,
  selectedId,
  onSelect,
  debug,
  wireframe,
}: {
  bounds: Bounds;
  buildings: BaselineBuilding[];
  roads: BaselineRoad[];
  water: BaselineArea[];
  green: BaselineArea[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  debug: boolean;
  wireframe: boolean;
}) {
  const [stage, size] = useMeasuredStage();
  const ready = !!size && size.width > 0 && size.height > 0;

  /**
   * Memoised on the only two things that may move the camera, and that is
   * load-bearing rather than an optimisation: R3F re-applies the `camera` prop
   * whenever its object identity changes, so an inline literal would re-apply the
   * zoom on EVERY React render and throw away wherever the visitor had panned to.
   */
  const fit = useMemo(
    () => isometricFit(bounds, size ?? { width: 0, height: 0 }),
    [bounds, size],
  );

  const camera = useMemo(
    () => ({ position: fit.position, zoom: fit.zoom, near: fit.near, far: fit.far }),
    [fit],
  );

  return (
    <div ref={stage} className="diorama">
      {ready && (
        <Canvas
          orthographic
          // Nothing in this scene animates: it is a diorama, not a game. Rendering
          // on demand rather than every frame is most of a phone's battery and
          // thermal budget back, and thermal throttling over a long exhibition day
          // is the realistic failure mode.
          frameloop="demand"
          // A definite size, measured above, rather than R3F's own observer.
          style={{ width: size.width, height: size.height }}
          camera={camera}
          // Clicking past every building clears the selection.
          onPointerMissed={() => onSelect(null)}
        >
          <color attach="background" args={[PALETTE['progress.paper']]} />

          <RedrawOnVisible />

          <Ground bounds={bounds} roads={roads} />
          <GroundAreas water={water} green={green} />
          <Buildings
            buildings={buildings}
            selectedId={selectedId}
            onSelect={onSelect}
            wireframe={wireframe}
          />

          {debug && <DebugOverlay bounds={bounds} wireframe={wireframe} />}

          <MapControls
            makeDefault
            enableRotate={false}
            target={fit.target}
            // Relative to the fitted zoom, so the limits mean the same thing on a
            // phone and a projector: out to twice the district, in to a courtyard.
            minZoom={fit.zoom * 0.5}
            maxZoom={fit.zoom * 40}
          />
        </Canvas>
      )}
    </div>
  );
}
