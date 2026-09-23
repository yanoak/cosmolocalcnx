'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { poseBetween, samePose, type CameraPose } from './camera';
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
  onArrive,
}: {
  pose: CameraPose;
  durationMs?: number;
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
  const arrived = useRef(onArrive);
  arrived.current = onArrive;

  useEffect(() => {
    const from = previous.current;
    if (from && samePose(from, pose)) return;
    const first = from === null;
    previous.current = pose;

    const apply = (p: CameraPose) => {
      camera.zoom = p.zoom;
      camera.updateProjectionMatrix();
      if (controls) {
        controls.target.set(p.target[0], p.target[1], p.target[2]);
        controls.update();
      }
      invalidate();
    };

    // A visitor who has asked for less motion gets the destination, not the journey.
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (first || !from || reduced || durationMs <= 0) {
      apply(pose);
      if (!first) arrived.current?.();
      return;
    }

    const started = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - started) / durationMs);
      apply(poseBetween(from, pose, easeInOutCubic(u)));
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
  }, [pose, durationMs, camera, controls, invalidate]);

  return null;
}
