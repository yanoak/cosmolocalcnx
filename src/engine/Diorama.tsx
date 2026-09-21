'use client';

import { MapControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { aeqdForward } from './aeqd';
import { Buildings } from './Buildings';
import { isometricFit, type Bounds } from './camera';
import { DebugOverlay } from './DebugOverlay';
import { Ground, GroundAreas } from './Ground';
import { BackdropPlane, type BackdropSource } from './BackdropPlane';
import { ValleyView, type ValleySource } from './ValleyView';
import type { ValleyStyle } from './valley';
import { clampZoom, viewSpec, type ViewId } from './views';
import { ReliefBackdrop, type ReliefSource } from './ReliefBackdrop';
import { BridgeMesh } from './BridgeMesh';
import { RELIEF_HOLD_OUT } from './relief';
import { RegionPlane } from './RegionPlane';
import { easeInOutCubic, tweenZoom } from './tween';
import {
  districtTransform,
  regionScale,
  registerState,
  stageFit,
  stockTint,
  worldMinZoom,
  tToZoom,
  zoomLadder,
  type RegisterId,
} from './registers';
import type { City } from './cities';
import type { RegionMeta } from './region';
import type { BaselineArea, BaselineBuilding, BaselineRoad } from './scene';
import { PALETTE_EXTENDED, UI_TOKENS } from './theme';

export type { Bounds };

interface Size {
  width: number;
  height: number;
}

export interface RegionSource {
  url: string;
  meta: RegionMeta;
  /** The scene's lat/lon origin, so the anchor can be projected onto the circle. */
  origin: [number, number];
  /** Every city over the threshold inside the circle, biggest first. */
  cities: City[];
  /** The subset that carries a permanent label. */
  labels: City[];
  /** The world outside the circle. Absent is valid. */
  world?: { url: string; meta: RegionMeta } | null;
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
 * Moves the camera along the rail over time, for jumps the visitor did not make
 * with their fingers: a register chip, and the on-ramp that plays the whole rail
 * on load.
 *
 * Deliberately NOT `useFrame`. A useFrame callback runs on every frame the scene
 * renders for any reason, and would have to decide each time whether a tween is in
 * progress; a self-terminating rAF that asks for exactly the frames it needs is
 * both simpler and cheaper. The cleanup is not optional — a tween surviving unmount
 * is a leaked rAF that keeps waking the GPU, which over a nine-hour exhibition day
 * is precisely the failure `frameloop="demand"` was chosen to prevent.
 */
function ZoomTween({
  to,
  ladder,
  durationMs = 900,
  onArrive,
}: {
  /** Target position on the rail, or null for "stay where the visitor left it". */
  to: number | null;
  ladder: ReturnType<typeof zoomLadder>;
  durationMs?: number;
  onArrive?: () => void;
}) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as { update?: () => void } | null;
  const raf = useRef<number | null>(null);
  const arrived = useRef(onArrive);
  arrived.current = onArrive;

  useEffect(() => {
    if (to === null) return;

    const destination = tToZoom(to, ladder);
    const from = camera.zoom;

    const settle = () => {
      camera.zoom = destination;
      camera.updateProjectionMatrix();
      controls?.update?.();
      invalidate();
      arrived.current?.();
    };

    // A visitor who has asked for less motion gets the destination, not the
    // journey. The piece still works; it just does not swoop.
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || from === destination || durationMs <= 0) {
      settle();
      return;
    }

    const started = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - started) / durationMs);
      camera.zoom = tweenZoom(from, destination, easeInOutCubic(u));
      camera.updateProjectionMatrix();
      controls?.update?.();
      invalidate();
      if (u < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        raf.current = null;
        arrived.current?.();
      }
    };
    raf.current = requestAnimationFrame(step);

    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [to, ladder, camera, invalidate, controls, durationMs]);

  return null;
}

/**
 * Turns camera zoom into the state of every register, once per frame.
 *
 * Mutates three.js objects DIRECTLY and sets React state only when the active
 * register changes. Setting state per frame would re-render, which invalidates,
 * which renders — the exact loop `frameloop="demand"` exists to avoid, and it would
 * cost the battery budget the whole diorama was designed around.
 *
 * Note what is NOT here: a clock. The crossfade is a pure function of zoom, and
 * every pinch already produces a frame, so the handover costs nothing when nobody
 * is touching the screen.
 */
/**
 * Cuts the camera to a view.
 *
 * Switching views is a selection, not a journey: a tween here would be the rail coming
 * back through the door, and the point of three discrete views is that the visitor is
 * told these are different kinds of thing rather than different distances.
 *
 * Runs only when the view actually changes, so it never fights a visitor mid-pinch —
 * the same discipline the camera memo upstream is written for.
 */
function ViewCut({
  view,
  spec,
  target,
  onArrive,
}: {
  view: ViewId;
  spec: ReturnType<typeof viewSpec>;
  target: [number, number, number];
  onArrive?: () => void;
}) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  const invalidate = useThree((s) => s.invalidate);
  const previous = useRef<ViewId | null>(null);

  useEffect(() => {
    if (previous.current === view) return;
    const first = previous.current === null;
    previous.current = view;

    camera.zoom = clampZoom(spec, spec.fit);
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(target[0], target[1], target[2]);
      controls.update();
    }
    invalidate();
    if (!first) onArrive?.();
  }, [view, spec, target, camera, controls, invalidate, onArrive]);

  return null;
}

function RegisterDriver({
  ladder,
  sigma,
  districtCentre,
  anchorStage,
  heroCount,
  refs,
  onChange,
}: {
  ladder: ReturnType<typeof zoomLadder>;
  sigma: number;
  districtCentre: [number, number];
  anchorStage: [number, number];
  heroCount: number;
  refs: {
    region: React.RefObject<THREE.Group | null>;
    district: React.RefObject<THREE.Group | null>;
    regionMaterial: React.RefObject<THREE.MeshBasicMaterial | null>;
    worldMaterial: React.RefObject<THREE.MeshBasicMaterial | null>;
    markerMaterial: React.RefObject<THREE.MeshBasicMaterial | null>;
    stockMaterial: React.RefObject<THREE.MeshBasicMaterial | null>;
  };
  onChange: (next: { active: RegisterId; railed: boolean }) => void;
}) {
  const controls = useThree((s) => s.controls) as { enablePan?: boolean } | null;
  const last = useRef<{ active: RegisterId; railed: boolean } | null>(null);

  useFrame(({ camera }) => {
    const zoom = (camera as THREE.OrthographicCamera).zoom;
    const state = registerState(zoom, ladder);

    const transform = districtTransform(state.collapse, districtCentre, anchorStage, sigma);
    const district = refs.district.current;
    if (district) {
      district.scale.setScalar(transform.scale);
      district.position.set(...transform.position);
      district.visible = state.districtOpacity > 0.001;
    }

    const region = refs.region.current;
    if (region) region.visible = state.regionOpacity > 0.001;

    if (refs.regionMaterial.current) refs.regionMaterial.current.opacity = state.regionOpacity;
    // The world fades with the circle rather than on its own schedule: they are one
    // surface in two resolutions, and fading them apart would show the seam.
    if (refs.worldMaterial.current) refs.worldMaterial.current.opacity = state.regionOpacity;
    if (refs.markerMaterial.current) refs.markerMaterial.current.opacity = state.markerOpacity;

    if (refs.stockMaterial.current) {
      const tint = stockTint(state.detail, heroCount);
      refs.stockMaterial.current.color.setRGB(tint, tint, tint);
    }

    // Pan is meaningless mid-handover — the camera target is being driven along the
    // rail — and a visitor who pans there ends up looking at empty ocean.
    if (controls && typeof controls.enablePan === 'boolean') {
      controls.enablePan = !state.railed;
    }

    if (last.current?.active !== state.active || last.current?.railed !== state.railed) {
      last.current = { active: state.active, railed: state.railed };
      onChange(last.current);
    }
  });

  return null;
}

/**
 * The "you are here" ring, at the scene origin's true place on the circle.
 *
 * A ring rather than a dot: at this scale a filled dot is indistinguishable from a
 * dense city, and the one thing this marker must not be is data. It is a mesh
 * rather than part of the texture so it stays crisp at any zoom, and so it can fade
 * in on its own schedule as the diorama shrinks onto it.
 */
function AnchorMarker({
  at,
  radiusKm,
  materialRef,
}: {
  at: [number, number];
  radiusKm: number;
  materialRef: React.RefObject<THREE.MeshBasicMaterial | null>;
}) {
  // Sized against the circle, so it reads the same whatever radius a scene uses.
  const outer = radiusKm / 70;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[at[0], 0.5, -at[1]]}
      raycast={() => null}
    >
      <ringGeometry args={[outer * 0.62, outer, 32]} />
      <meshBasicMaterial
        ref={materialRef}
        color={UI_TOKENS['ui.accent']}
        toneMapped={false}
        transparent
        depthWrite={false}
        opacity={1}
      />
    </mesh>
  );
}

/**
 * A fixed isometric diorama you inspect, not a world you traverse.
 *
 * Orthographic camera on the (1, 1, 1) diagonal. MapControls constrained to pan and
 * zoom, never rotate: touch is the primary input and a visitor who rotates the
 * camera into a wall leaves a broken screen for the next person.
 *
 * Since semantic zoom, ONE camera serves two coordinate frames — district metres
 * and region kilometres — because an orthographic camera's zoom is pixels per stage
 * unit, so a group with a scale is exactly equivalent to a second camera and keeps
 * MapControls, depth and picking all bound to one thing. See registers.ts and
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
  region,
  relief = null,
  backdrop = null,
  valley = null,
  reliefStyle = 'terraced',
  view = 'city',
  heroIds,
  openAt = 'district',
  goTo = null,
  onArrive,
  onRegisterChange,
  onPickCell,
  highlight = null,
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
  region?: RegionSource | null;
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
  /** Where the rail starts on mount. The on-ramp opens at the circle. */
  openAt?: RegisterId;
  /** Rail position to travel to, or null to leave the visitor where they are. */
  goTo?: number | null;
  onArrive?: () => void;
  onRegisterChange?: (active: RegisterId) => void;
  /** A position on the circle, in km, that the visitor pointed at. */
  onPickCell?: (km: [number, number]) => void;
  highlight?: [number, number] | null;
}) {
  const [stage, size] = useMeasuredStage();
  const ready = !!size && size.width > 0 && size.height > 0;

  const [registers, setRegisters] = useState<{ active: RegisterId; railed: boolean }>({
    active: openAt,
    railed: false,
  });

  const report = useCallback(
    (next: { active: RegisterId; railed: boolean }) => {
      setRegisters(next);
      onRegisterChange?.(next.active);
    },
    [onRegisterChange],
  );

  const regionGroup = useRef<THREE.Group>(null);
  const districtGroup = useRef<THREE.Group>(null);
  const regionMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const worldMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const markerMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const stockMaterial = useRef<THREE.MeshBasicMaterial>(null);

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

  const radiusKm = region?.meta.projection.radiusKm ?? 0;

  /** Stage units per kilometre — the one constant absorbing the 2,500:1 scale gap. */
  const k = useMemo(
    () => (region ? regionScale(bounds, radiusKm) : 1),
    [region, bounds, radiusKm],
  );

  const ladder = useMemo(
    () => zoomLadder(fit.zoom, { hasRegion: !!region, backdropOut: relief ? RELIEF_HOLD_OUT : undefined }),
    [fit.zoom, region, relief],
  );

  /** The scene origin's place on the circle, in stage units. North flips to -Z. */
  const anchorStage = useMemo<[number, number]>(() => {
    if (!region) return [0, 0];
    const [east, north] = aeqdForward(region.origin, region.meta.projection.centre);
    return [east * k, -north * k];
  }, [region, k]);

  const districtCentre = useMemo<[number, number]>(
    () => [fit.target[0], fit.target[2]],
    [fit],
  );

  /**
   * Memoised on the geometry alone, deliberately. `openAt` is read once on mount
   * and must not re-enter this: R3F re-applies the camera prop whenever its
   * identity changes, so letting it change would snap the visitor back to the top
   * of the rail mid-gesture.
   */
  const openAtRef = useRef(openAt);
  /** The outermost thing in the scene — the world if there is one, else the circle. */
  const outerRadiusKm = region?.world?.meta.projection.radiusKm ?? radiusKm;

  const camera = useMemo(() => {
    const staged = stageFit(bounds, outerRadiusKm * k, fit);
    const ladderForOpen = zoomLadder(fit.zoom, {
      hasRegion: !!region,
      backdropOut: relief ? RELIEF_HOLD_OUT : undefined,
    });
    return {
      position: staged.position,
      zoom:
        openAtRef.current === 'region' && region ? ladderForOpen.region : staged.zoom,
      near: staged.near,
      far: staged.far,
    };
  }, [bounds, outerRadiusKm, k, fit, region, relief]);

  /**
   * One camera fit per view.
   *
   * The circle's fit still comes through the old ladder, because `regionScale` and
   * `stageFit` are what absorb the 2,500:1 gap between kilometres and district metres
   * and that arithmetic is unchanged — what went is the idea that a visitor travels
   * across it by pinching.
   */
  const specs = useMemo(() => {
    const valleyHalfM = valley ? Math.abs(valley.meta.grid.bboxM[2]) : 0;
    const valleyFit = valley
      ? isometricFit([-valleyHalfM, -valleyHalfM, valleyHalfM, valleyHalfM], size ?? { width: 0, height: 0 }).zoom
      : fit.zoom;
    return {
      circle: viewSpec('circle', ladder.region),
      valley: viewSpec('valley', valleyFit),
      city: viewSpec('city', fit.zoom),
    };
  }, [valley, size, fit.zoom, ladder.region]);

  const spec = specs[view];

  /** Where each world is centred, in world units. Both fields sit on the origin. */
  const viewTarget = useMemo<[number, number, number]>(
    () => (view === 'city' ? fit.target : [0, 0, 0]),
    [view, fit.target],
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
    city: true,
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

          {/* Cuts the camera to the new view. Switching is a selection, not a
              journey — a tween here would be the rail coming back through the door. */}
          <ViewCut view={view} spec={spec} target={viewTarget} onArrive={onArrive} />

          {region && (
            <>
              <group ref={regionGroup} scale={k} visible={view === 'circle'}>
                <RegionPlane
                  url={region.url}
                  meta={region.meta}
                  anchor={aeqdForward(region.origin, region.meta.projection.centre)}
                  materialRef={regionMaterial}
                  labels={view === 'circle' ? region.labels : EMPTY_LABELS}
                  interactive={view === 'circle'}
                  onPickCell={onPickCell}
                  highlight={highlight}
                  world={region.world ?? null}
                  worldMaterialRef={worldMaterial}
                />
                <AnchorMarker
                  at={[anchorStage[0] / k, -anchorStage[1] / k]}
                  radiusKm={radiusKm}
                  materialRef={markerMaterial}
                />
              </group>

              {/* RegisterDriver is gone with the rail. It drove the crossfade, the
                  district's collapse onto the circle and the stock tint, all per frame;
                  with discrete views the first two do not exist and the third is a
                  no-op until hotspots are authored. See views.ts. */}
            </>
          )}

          {/* Built on first visit, then kept. Discrete views mean never paying for a
              world nobody is looking at — and the valley's mesh is 130k triangles and a
              quarter-million-cell blur, which on load stalled the page even while the
              city was the thing on screen. Kept mounted afterwards so going back is
              instant. */}
          {valley && visited.valley && (
            <group visible={view === 'valley'}>
              <ValleyView source={valley} sceneBounds={bounds} style={reliefStyle} />
            </group>
          )}

          {/* The city. The outer group used to be driven by the handover; with discrete
              views it simply cancels the inner pre-centring, which is what the handover
              did at collapse 0 anyway — so today's framing is untouched. */}
          <group
            ref={districtGroup}
            visible={view === 'city'}
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
                stockMaterialRef={stockMaterial}
              />
              {debug && <DebugOverlay bounds={bounds} wireframe={wireframe} />}
            </group>
          </group>

          <MapControls
            makeDefault
            enableRotate={false}
            target={viewTarget}
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
const EMPTY_LABELS: City[] = [];
