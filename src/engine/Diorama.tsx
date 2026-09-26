'use client';

import { MapControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Buildings } from './Buildings';
import { isometricFit, targetBelow, type Bounds, type CameraPose } from './camera';
import { CameraRig } from './CameraRig';
import { resolvePose, type Beat, type Score, type ViewFits } from './chapters';
import { DebugOverlay } from './DebugOverlay';
import { Ground, GroundAreas } from './Ground';
import { BackdropPlane, type BackdropSource } from './BackdropPlane';
import { ValleyView, type ValleySource } from './ValleyView';
import type { ValleyStyle } from './valley';
import { clampZoom, viewSpec, type ViewId } from './views';
import { ReliefBackdrop, type ReliefSource } from './ReliefBackdrop';
import { BridgeMesh } from './BridgeMesh';
import type { BaselineArea, BaselineBuilding, BaselineRoad, Hotspot } from './scene';
import { PinLayer, type PinCopy } from './PinLayer';
import { pinsFor } from './pins';
import type { ThreadId } from './threads';
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
/**
 * During the stem the page scrolls under a finger on the canvas. OrbitControls sets
 * `touch-action: none` on the canvas when it connects — right for the bowl, where a
 * drag pans — but in the stem the controls are off and that rule still swallowed every
 * vertical swipe that started on the map, so a phone could only scroll on the cards.
 * Yan, 24 Sep 2026. Re-applied whenever `interactive` flips, after the controls have had
 * their say.
 */
function TouchScroll({ interactive }: { interactive: boolean }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const el = gl.domElement;
    const apply = () => {
      el.style.touchAction = interactive ? 'none' : 'pan-y';
    };
    apply();
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  }, [gl, interactive]);
  return null;
}

/**
 * A handle to render one frame NOW, synchronously, for the export page. `frameloop="demand"`
 * schedules frames through requestAnimationFrame, which a hidden tab never runs — so a
 * `toDataURL` there reads back an empty canvas. `advance` draws without waiting for one.
 */
function RenderHandle({ handle }: { handle: React.MutableRefObject<(() => void) | null> }) {
  const advance = useThree((state) => state.advance);
  useEffect(() => {
    handle.current = () => advance(performance.now(), true);
    return () => {
      handle.current = null;
    };
  }, [advance, handle]);
  return null;
}

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

/** How far below the stage's centre an open pin sits, as a fraction of its height. */
const PIN_BELOW_CENTRE = 0.25;
/**
 * How much closer than the overview the camera stands while a pin is open. The same for
 * every pin, so moving between two is still a pure pan; only opening the first and
 * closing the last change the zoom. Yan, 26 Sep 2026.
 */
const PIN_ZOOM = 1.5;

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
  hotspots = NO_HOTSPOTS,
  pinCopy = NO_PIN_COPY,
  openPin = null,
  onOpenPin,
  bowl,
  warm = NO_WARM,
  valleyTransport = false,
  valleyThreads = null,
  dpr,
  exportable = false,
  renderHandle,
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
  /**
   * The open chapter's hotspots — the pins. Each names its view; the ones in the city
   * mount here, the ones in the valley go to `ValleyView` for the surface height. During
   * a stem only the beat's own pins show; in the bowl all of them. See pins.ts.
   */
  hotspots?: readonly Hotspot[];
  pinCopy?: ReadonlyMap<string, PinCopy>;
  openPin?: string | null;
  onOpenPin?: (id: string | null) => void;
  /** Where the chapter's bowl opens, if not on the terminal beat's framing. See `Score.bowl`. */
  bowl?: Score['bowl'];
  /**
   * Views to have BUILT now, shown or not — the open chapter's, so a stem that cuts from
   * the city to the valley finds the valley ready instead of building 130k triangles on
   * the scroll. "A view builds on first visit" still holds; this is the visit.
   */
  warm?: readonly ViewId[];
  /** The valley's roads and railway: an overlay the Futures shows and the Past does not. */
  valleyTransport?: boolean;
  /** The Past's threads to draw, or null outside the Past. See threads.ts. */
  valleyThreads?: ReadonlySet<ThreadId> | null;
  /** Device pixel ratio override — the print export wants exactly one buffer pixel per CSS pixel. */
  dpr?: number;
  /** Keep the drawing buffer after a frame, so the canvas can be read back for a PNG. Export only. */
  exportable?: boolean;
  /** Filled with a function that renders one frame synchronously. Export only. */
  renderHandle?: React.MutableRefObject<(() => void) | null>;
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
  /**
   * The bowl HOLDS the terminal beat's framing. A release that cut back out to the view's
   * fit would throw away the frame the stem had just composed — the eight valley pins,
   * spread — for the whole field with them piled up again. A view change resets to that
   * view's fit, since a held pose belongs to the view it was made in.
   */
  const held = useRef<CameraPose | null>(null);
  /** The bowl's overview in this view: the chapter's own framing, else the held beat, else the fit. */
  const overview = useMemo<CameraPose>(() => {
    if (beat) {
      const p = resolvePose(beat, fits);
      held.current = p;
      return p;
    }
    if (bowl && bowl.view === view) {
      return {
        view,
        zoom: clampZoom(specs[view], fits[view].zoom * (bowl.zoom ?? 1)),
        target: bowl.target ?? fits[view].target,
      };
    }
    if (held.current && held.current.view === view) return held.current;
    return { view, zoom: fits[view].zoom, target: fits[view].target };
  }, [beat, bowl, fits, specs, view]);

  /**
   * Where the open pin stands, reported by the pin layer. In the bowl the camera pans to
   * it, a little closer in (PIN_ZOOM); closing it pans back out to the overview. Keyboard
   * or tap, the same.
   */
  const [pinAt, setPinAt] = useState<[number, number, number] | null>(null);
  const onOpenAt = useCallback((at: [number, number, number] | null) => {
    setPinAt((was) =>
      was === at || (was && at && was[0] === at[0] && was[1] === at[1] && was[2] === at[2]) ? was : at,
    );
  }, []);
  const pose = useMemo<CameraPose>(() => {
    if (beat || !openPin || !pinAt) return overview;
    // Below centre, not on it: the card opens above the icon and needs the room, clear
    // of the button at the top of the stage. Yan, 26 Sep 2026.
    const zoom = clampZoom(specs[view], overview.zoom * PIN_ZOOM);
    const down = (size?.height ?? 0) * PIN_BELOW_CENTRE;
    return { view, zoom, target: targetBelow(pinAt, down, zoom) };
  }, [beat, openPin, pinAt, overview, specs, view, size?.height]);

  /** Bumped each time the camera settles, so an open card re-measures its fit there. */
  const [settle, setSettle] = useState(0);
  const arrive = useCallback(() => {
    setSettle((n) => n + 1);
    onArrive?.();
  }, [onArrive]);

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
    setVisited((seen) => {
      const wanted = [view, ...warm].filter((v) => !seen[v]);
      if (wanted.length === 0) return seen;
      const next = { ...seen };
      for (const v of wanted) next[v] = true;
      return next;
    });
  }, [view, warm]);

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
          dpr={dpr}
          gl={exportable ? { preserveDrawingBuffer: true } : undefined}
          camera={camera}
          // Clicking past every building clears the selection, and closes a pin. The
          // fiber listens on the div around the canvas, which is also where drei mounts
          // the pins' DOM — so a tap on a pin or its card arrives here as a "miss" too,
          // and has to be told apart by its target. (Stopping propagation on the pin
          // instead would also stop React's own click, which listens further up.)
          onPointerMissed={(e) => {
            const target = e.target as Element | null;
            if (target?.closest?.('.pin')) return;
            onSelect(null);
            onOpenPin?.(null);
          }}
        >
          <color attach="background" args={[PALETTE_EXTENDED['cosmo.offWhite']]} />

          <RedrawOnVisible />
          <TouchScroll interactive={interactive} />
          {renderHandle && <RenderHandle handle={renderHandle} />}

          {/* Cuts the camera to the open view. Switching is a selection, not a
              journey — a tween here would be the rail coming back through the door. */}
          <CameraRig
            pose={pose}
            durationMs={beat ? beatDurationMs : 0}
            // In the bowl every move within a view is a pan, timed by its length.
            pan={!beat}
            onArrive={arrive}
          />

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
                pins={pinsFor(hotspots, 'valley', beat)}
                pinCopy={pinCopy}
                openPin={openPin}
                onOpenPin={onOpenPin}
                pinsInteractive={interactive}
                transport={valleyTransport}
                threads={valleyThreads}
                onOpenAt={view === 'valley' ? onOpenAt : undefined}
                settle={settle}
              />
            </group>
          )}

          {/* The city's pins, in world metres — the city group's two offsets cancel, so
              the frame is the same. DOM, so mounted only while the city is the view. */}
          {view === 'city' && visited.city && (
            <PinLayer
              pins={pinsFor(hotspots, 'city', beat)}
              copy={pinCopy}
              heightAt={() => 0}
              sizePx={CITY_PIN_PX}
              openId={openPin}
              onOpen={onOpenPin ?? (() => {})}
              interactive={interactive}
              onOpenAt={onOpenAt}
              settle={settle}
            />
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

const NO_HOTSPOTS: readonly Hotspot[] = [];
const NO_WARM: readonly ViewId[] = [];
/** City pins at full size; the valley's eight are drawn at 72 in ValleyView, since they share one field. */
const CITY_PIN_PX = 88;
const NO_PIN_COPY: ReadonlyMap<string, PinCopy> = new Map();
const EMPTY_HEROES: ReadonlySet<string> = new Set();
