'use client';

import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import type * as THREE from 'three';
import { moveDuration, panDuration, poseBetween, samePose, standFor, targetOf, type CameraPose } from './camera';
import { easeInOutCubic } from './tween';

/**
 * The only thing in the piece that touches the camera.
 *
 * Hand it a pose and it goes there: a cut when `durationMs` is 0 (a view switch is a
 * selection, not a journey — a tween there would be the rail coming back through the
 * door), or a tween otherwise (a chapter beat, the attract loop). Replaces `ViewCut`
 * and the rail-era `ZoomTween`, which were two implementations of this.
 *
 * Deliberately NOT `useFrame`. A useFrame callback runs on every frame the scene
 * renders for any reason and would have to decide each time whether a tween is in
 * progress; a self-terminating rAF that asks for exactly the frames it needs is
 * simpler and cheaper. The cleanup is not optional — a tween surviving unmount is a
 * leaked rAF that keeps waking the GPU, which over a nine-hour exhibition day is
 * precisely the failure `frameloop="demand"` was chosen to prevent.
 *
 * Runs only when the pose actually changes, so it never fights a visitor mid-pinch.
 */
export function CameraRig({
  pose,
  durationMs = 0,
  pan = false,
  onArrive,
}: {
  pose: CameraPose;
  durationMs?: number;
  /**
   * When true, a move within the view is timed by how far it pans rather than by
   * `durationMs`. The bowl's pin-to-pin moves. See `panDuration`.
   */
  pan?: boolean;
  /** After the camera settles on a NEW pose — not on mount. */
  onArrive?: () => void;
}) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null;
  const invalidate = useThree((s) => s.invalidate);
  const previous = useRef<CameraPose | null>(null);
  const raf = useRef<number | null>(null);
  /**
   * How far the camera stands from its target — read once, from where the fit put it,
   * and then held. It only matters to near/far, which have room to spare; what matters
   * is that the DIRECTION is the attitude's for every target, see `standFor`.
   */
  const distance = useRef<number | null>(null);
  const arrived = useRef(onArrive);
  arrived.current = onArrive;

  // A LAYOUT effect, not a passive one. The controls receive `pose.target` as a prop in
  // the same commit, and MapControls calls update() — a lookAt — on every frame. A
  // passive effect can run after a frame has drawn, and that frame shows the camera
  // turned toward the new target from its old position: a one-frame tilt, seen as a
  // flash whenever a pin closed and the target jumped back to the overview. Found
  // 26 Sep 2026. A layout effect runs in the commit, before any frame can.
  useLayoutEffect(() => {
    const from = previous.current;
    if (from && samePose(from, pose)) return;
    const first = from === null;
    previous.current = pose;

    const apply = (p: CameraPose) => {
      camera.zoom = p.zoom;
      camera.updateProjectionMatrix();
      // The camera moves WITH its target, along the attitude. Left to OrbitControls,
      // a target change keeps the camera still and re-derives the orbit — which is a
      // rotation, and the one thing this camera must never do.
      if (distance.current === null) {
        const t = controls ? controls.target : { x: 0, y: 0, z: 0 };
        distance.current = Math.hypot(camera.position.x - t.x, camera.position.y - t.y, camera.position.z - t.z) || 1;
      }
      const [x, y, z] = standFor(p.target, distance.current);
      camera.position.set(x, y, z);
      if (controls) {
        controls.target.set(p.target[0], p.target[1], p.target[2]);
        controls.update();
      } else {
        camera.lookAt(p.target[0], p.target[1], p.target[2]);
      }
      invalidate();
    };

    // A visitor who has asked for less motion gets the destination, not the journey.
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Start from where the camera IS, not from the last pose it was handed: in the bowl
    // a visitor may have panned and zoomed since, and a move that began by snapping
    // back to the old pose would be a jump. The target is read off the camera's
    // position, since the controls' own target already holds the new pose's by now.
    const start: CameraPose | null =
      from && distance.current !== null
        ? {
            view: from.view,
            zoom: camera.zoom,
            target: targetOf([camera.position.x, camera.position.y, camera.position.z], distance.current),
          }
        : from;

    // Across views there is no journey to draw: the cut happens even mid-stem.
    const ms = !start ? 0 : pan ? panDuration(start, pose) : moveDuration(start, pose, durationMs);
    if (first || !start || reduced || ms <= 0) {
      apply(pose);
      if (!first) arrived.current?.();
      return;
    }

    const started = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - started) / ms);
      apply(poseBetween(start, pose, easeInOutCubic(u)));
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
  }, [pose, durationMs, pan, camera, controls, invalidate]);

  return null;
}
