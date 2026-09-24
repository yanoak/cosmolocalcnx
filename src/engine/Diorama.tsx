'use client';

import { MapControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Buildings } from './Buildings';
import { isometricFit, type Bounds, type CameraPose } from './camera';
import { CameraRig } from './CameraRig';
import { resolvePose, type Beat, type ViewFits } from './chapters';
import { DebugOverlay } from './DebugOverlay';
import { Ground, GroundAreas } from './Ground';
import { BackdropPlane, type BackdropSource } from './BackdropPlane';
import { ValleyView, type ValleySource } from './ValleyView';
import type { ValleyStyle } from './valley';
import { clampZoom, viewSpec, type ViewId } from './views';
import { ReliefBackdrop, type ReliefSource } from './ReliefBackdrop';
import { BridgeMesh } from './BridgeMesh';
import type { BaselineArea, BaselineBuilding, BaselineRoad } from './scene';
import { PALETTE_EXTENDED, UI_TOKENS } from './theme';

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
 * Orthographic camera on the isometric diagonal `camera.ts` fixes. MapControls constrained to pan and
 * zoom, never rotate: touch is the primary input and a visitor who rotates the
 * camera into a wall leaves a broken screen for the next person.
 *
 * Two views live here — the valley and the city — in one frame of district metres.
 * The circle used to be a third, in kilometres under a scaled group; since 24 Sep 2026
 * it is a MapLibre map (`PresentMap.tsx`) behind the cut between views, and nothing
 * here knows about it. Every camera move is a `CameraPose` applied by `CameraRig`;
 * nothing else here touches the camera.
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
  relief = null,
  backdrop = null,
  valley = null,
  reliefStyle = 'hillshade',
  view = 'city',
  heroIds,
  beat = null,
  beatDurationMs = 600,
  interactive = true,
  onArrive,
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
  /** The land around the district, flattened under it. Never under the buildings. */
  relief?: ReliefSource | null;
  /**
   * The far city, pre-rendered. Null renders every baseline building as geometry,
   * which is what this did until 21 Sep 2026 and what a scene inside the triangle
   * budget still does. See BackdropPlane.tsx.
   */
  backdrop?: BackdropSource | null;
  /** The committed 120 km topographic field, or null for a scene without one. */
  valley?: ValleySource | null;
  /** How the valley draws its topography. See ValleyStyle. */
  reliefStyle?: ValleyStyle;
  /**
   * Which of the three worlds is on screen.
   *
   * Discrete since 21 Sep 2026. Exactly one renders; zoom and pan stay inside it and
   * cannot reach another. See views.ts for why the rail went.
   */
  view?: ViewId;
  heroIds?: ReadonlySet<string>;
  /**
   * The stem's current beat, or null in explore. A beat names its view and a pose
   * relative to that view's fit; `view` must agree with `beat.view` — the page sets it
   * from the beat, which is the only way a view is ever chosen during a stem.
   */
  beat?: Beat | null;
  /** How long a move between beats takes. A view switch with no beat is a cut. */
  beatDurationMs?: number;
  /** Pan and zoom by hand. Off during the stem, where the wheel scrolls the story. */
  interactive?: boolean;
  /** After the camera settles on a new pose — not on mount. */
  onArrive?: () => void;
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

  const districtCentre = useMemo<[number, number]>(
    () => [fit.target[0], fit.target[2]],
    [fit],
  );

  const camera = useMemo(
    () => ({ position: fit.position, zoom: fit.zoom, near: fit.near, far: fit.far }),
    [fit],
  );

  /**
   * One camera fit per view: the valley's field and the district. The circle is a
   * MapLibre map since 24 Sep 2026 (`PresentMap.tsx`) and has no fit here; its entry
   * carries the district's numbers so the `ViewFits` record stays complete. What went
   * on 21 Sep is the idea that a visitor travels between views by pinching.
   */
  const specs = useMemo(() => {
    const viewport = size ?? { width: 0, height: 0 };
    const valleyHalfM = valley ? Math.abs(valley.meta.grid.bboxM[2]) : 0;
    const valleyFit = valley
      ? isometricFit([-valleyHalfM, -valleyHalfM, valleyHalfM, valleyHalfM], viewport).zoom
      : fit.zoom;
    return {
      circle: viewSpec('circle', fit.zoom),
      valley: viewSpec('valley', valleyFit),
      city: viewSpec('city', fit.zoom),
    };
  }, [valley, size, fit.zoom]);

  const spec = specs[view];

  /** Every view's fit, as the renderer knows it right now — what a beat's pose is relative to. Both fields sit on the origin. */
  const fits = useMemo<ViewFits>(
    () => ({
      circle: { zoom: clampZoom(specs.circle, specs.circle.fit), target: [0, 0, 0] },
      valley: { zoom: clampZoom(specs.valley, specs.valley.fit), target: [0, 0, 0] },
      city: { zoom: clampZoom(specs.city, specs.city.fit), target: fit.target },
    }),
    [specs, fit.target],
  );

  /**
   * The pose the rig applies. During a stem it is the beat's, resolved against the fits;
   * otherwise the open view's own fit, centred on its world. A view switch is a cut and a
   * beat is a move — the duration is the whole difference.
   */
  const pose = useMemo<CameraPose>(
    () => (beat ? resolvePose(beat, fits) : { view, zoom: fits[view].zoom, target: fits[view].target }),
    [beat, fits, view],
  );

  /**
   * Which views have ever been opened.
   *
   * A view builds its geometry the first time it is asked for and keeps it after. The
   * city is here from the start because it is what the piece is about and what the
   * on-ramp lands on.
   */
  const [visited, setVisited] = useState<Record<ViewId, boolean>>({
    circle: view === 'circle',
    valley: view === 'valley',
    // Not unconditionally true: opening straight onto the valley with `?view=` should
    // not pay for 7,588 extruded buildings and two backdrop rasters nobody is looking
    // at. The on-ramp sets this a beat later in the ordinary case.
    city: view === 'city',
  });
  useEffect(() => {
    setVisited((seen) => (seen[view] ? seen : { ...seen, [view]: true }));
  }, [view]);

  const heroes = heroIds ?? EMPTY_HEROES;

  return (
    <div ref={stage} className="diorama">
      {ready && (
        <Canvas
          orthographic
          // Nothing in this scene animates by itself: it is a diorama, not a game.
          // The register crossfade is a pure function of camera zoom, so it needs no
          // clock — every pinch already produces a frame. Rendering on demand is
          // most of a phone's battery and thermal budget back, and thermal
          // throttling over a long exhibition day is the realistic failure mode.
          frameloop="demand"
          // A definite size, measured above, rather than R3F's own observer.
          style={{ width: size.width, height: size.height }}
          camera={camera}
          // Clicking past every building clears the selection.
          onPointerMissed={() => onSelect(null)}
        >
          <color attach="background" args={[PALETTE_EXTENDED['cosmo.offWhite']]} />

          <RedrawOnVisible />

          {/* Cuts the camera to the open view. Switching is a selection, not a
              journey — a tween here would be the rail coming back through the door. */}
          <CameraRig pose={pose} durationMs={beat ? beatDurationMs : 0} onArrive={onArrive} />

          {/* Built on first visit, then kept. Discrete views mean never paying for a
              world nobody is looking at — and the valley's mesh is 130k triangles and a
              quarter-million-cell blur, which on load stalled the page even while the
              city was the thing on screen. Kept mounted afterwards so going back is
              instant. */}
          {valley && visited.valley && (
            <group visible={view === 'valley'}>
              <ValleyView
                source={valley}
                sceneBounds={bounds}
                style={reliefStyle}
                labelled={view === 'valley'}
              />
            </group>
          )}

          {/* The city. The outer group used to be driven by the handover; with discrete
              views it simply cancels the inner pre-centring, which is what the handover
              did at collapse 0 anyway — so today's framing is untouched. */}
          <group
            visible={view === 'city' && visited.city}
            position={[districtCentre[0], 0, districtCentre[1]]}
          >
            <group position={[-districtCentre[0], 0, -districtCentre[1]]}>
              {relief && <ReliefBackdrop source={relief} scene={bounds} />}
              <Ground bounds={bounds} roads={roads} />
              {/* After the ground, so the far city stands on it, and before the near
                  buildings, so three.js sorts the two transparent planes against
                  geometry that has already written depth. */}
              {backdrop && <BackdropPlane source={backdrop} />}
              <GroundAreas water={water} green={green} />
              <BridgeMesh roads={roads} water={water} />
              <Buildings
                buildings={buildings}
                selectedId={selectedId}
                onSelect={onSelect}
                wireframe={wireframe}
                heroIds={heroes}
                pickable={view === 'city'}
              />
              {debug && <DebugOverlay bounds={bounds} wireframe={wireframe} />}
            </group>
          </group>

          <MapControls
            makeDefault
            enableRotate={false}
            // Off during a stem: the wheel scrolls the story, and a drag would fight
            // the beat's pose. The bowl turns them back on.
            enableZoom={interactive}
            enablePan={interactive}
            target={pose.target}
            // Relative to the fitted zoom, so the limits mean the same thing on a
            // phone and a projector. The outer end used to be twice the district;
            // it is now the whole planet where a world field exists, the circle
            // where only that exists, and twice the district for a scene with
            // neither. Pulling back past the region anchor changes no register —
            // `t` is already clamped at 0 — so this is reach, not a new state.
            // Each view holds its own range. There is no zoom in any view that reaches
            // another one — that is the whole of "discrete", and views.ts owns it.
            minZoom={spec.minZoom}
            maxZoom={spec.maxZoom}
          />
        </Canvas>
      )}
    </div>
  );
}

const EMPTY_HEROES: ReadonlySet<string> = new Set();
