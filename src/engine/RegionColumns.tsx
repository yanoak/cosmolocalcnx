'use client';

import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  COLUMN_GRID,
  OUTSIDE_MIX,
  TONE_FACTORS,
  cellOf,
  columnGeometry,
  layoutColumns,
} from './columns';
import { cellCentreKm } from './cities';
import { aggregate, type RegionMeta } from './region';
import { GROUND, POPULATION_RAMP, sampleRamp } from './theme';

/**
 * The population field as instanced columns — the Present chapter's visualisation.
 *
 * One `InstancedMesh`, one column per populated cell, in the circle's kilometre
 * frame; the parent group's scale reconciles that with the district's metres, as it
 * does for the plane. 85,000 instances of a three-face box is about 510k triangles,
 * which the exhibition screen draws and a phone does not — the phone's LOD is
 * `aggregate()` in region.ts, a switch rather than a redesign, and not wired yet.
 *
 * **The growing ring is a shader uniform.** "Desaturate everything outside the
 * circle" while the circle grows would otherwise mean recolouring tens of thousands
 * of instances a frame. One float, compared against the instance's own position in
 * the fragment shader, costs nothing. Materials stay unlit by rule — this is
 * `onBeforeCompile` on `MeshBasicMaterial`, not a lighting change: the top face is
 * exactly the ramp colour, the walls a fixed factor of it.
 *
 * Picking is by instance id from the raycaster, and reports the cell's centre in km
 * so the page's readout works unchanged from the plane's texel lookup.
 */

const geometryTemplate = (() => {
  let cached: THREE.BufferGeometry | null = null;
  return () => {
    if (cached) return cached;
    const g = columnGeometry();
    cached = new THREE.BufferGeometry();
    cached.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
    cached.setAttribute('tone', new THREE.BufferAttribute(g.tone, 1));
    return cached;
  };
})();

interface RingUniforms {
  uRingKm: { value: number };
  uGround: { value: THREE.Color };
  uToneFactors: { value: THREE.Vector3 };
  uOutsideMix: { value: number };
}

/** The unlit material with the ring uniform patched in. Built once per mount. */
function useColumnMaterial(ringKm: number): THREE.MeshBasicMaterial {
  const uniforms = useRef<RingUniforms>({
    uRingKm: { value: ringKm },
    uGround: { value: new THREE.Color(GROUND.ground) },
    uToneFactors: { value: new THREE.Vector3(...TONE_FACTORS) },
    uOutsideMix: { value: OUTSIDE_MIX },
  });

  const material = useMemo(() => {
    // NOT vertexColors: that reads a `color` attribute the shared box does not have,
    // and a missing attribute is zero — every column came out black on 24 Sep 2026.
    // `instanceColor` is picked up on its own (USE_INSTANCING_COLOR) once setColorAt
    // has been called, and is exactly the ramp colour per column.
    const m = new THREE.MeshBasicMaterial({ toneMapped: false });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms.current);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float tone;\nvarying float vTone;\nvarying float vDistKm;',
        )
        .replace(
          '#include <begin_vertex>',
          // The instance's own translation, in the mesh's (kilometre) frame — the
          // fourth column of its matrix. Height does not count toward the ring.
          '#include <begin_vertex>\nvTone = tone;\nvDistKm = length(instanceMatrix[3].xz);',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uRingKm;\nuniform vec3 uGround;\nuniform vec3 uToneFactors;\nuniform float uOutsideMix;\nvarying float vTone;\nvarying float vDistKm;',
        )
        .replace(
          '#include <color_fragment>',
          [
            '#include <color_fragment>',
            'float toneFactor = vTone < 0.5 ? uToneFactors.x : (vTone < 1.5 ? uToneFactors.y : uToneFactors.z);',
            'diffuseColor.rgb *= toneFactor;',
            'if (vDistKm > uRingKm) diffuseColor.rgb = mix(diffuseColor.rgb, uGround, uOutsideMix);',
          ].join('\n'),
        );
    };
    // Any change to the patch must produce a new program.
    m.customProgramCacheKey = () => 'region-columns-ring';
    return m;
  }, []);

  useEffect(() => {
    uniforms.current.uRingKm.value = ringKm;
  }, [ringKm]);

  useEffect(() => () => material.dispose(), [material]);

  return material;
}

export function RegionColumns({
  field,
  meta,
  ringKm,
  interactive = false,
  onPickCell,
}: {
  /** The decoded field, people per cell. */
  field: Float32Array;
  meta: RegionMeta;
  /** The growing circle's radius, km. Columns beyond it recede toward the ground. */
  ringKm: number;
  interactive?: boolean;
  onPickCell?: (km: [number, number]) => void;
}) {
  const radiusKm = meta.projection.radiusKm;

  /**
   * Coarsened to COLUMN_GRID by block-sum — exact, because population is additive —
   * so a column is a hill and not a needle. The plane underneath keeps the full
   * resolution; the columns are the relief on it.
   */
  const { coarse, size, max } = useMemo(() => {
    const factor = Math.max(1, Math.round(meta.grid.size / COLUMN_GRID));
    const { field: coarse, size } = aggregate(field, meta.grid.size, factor);
    let max = 0;
    for (let i = 0; i < coarse.length; i++) if (coarse[i] > max) max = coarse[i];
    return { coarse, size, max };
  }, [field, meta.grid.size]);

  const layout = useMemo(
    () => layoutColumns(coarse, size, radiusKm, max),
    [coarse, size, radiusKm, max],
  );

  const material = useColumnMaterial(ringKm);
  const mesh = useRef<THREE.InstancedMesh>(null);

  /** Transforms and colours, written once per layout. */
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const colour = new THREE.Color();
    for (let k = 0; k < layout.count; k++) {
      position.set(layout.east[k], 0, -layout.north[k]);
      scale.set(layout.cellKm, Math.max(layout.heightKm[k], 1e-3), layout.cellKm);
      matrix.compose(position, quaternion, scale);
      m.setMatrixAt(k, matrix);
      const [r, g, b] = sampleRamp(POPULATION_RAMP, layout.t[k]);
      colour.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
      m.setColorAt(k, colour);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [layout]);

  const pick = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || !onPickCell || e.instanceId === undefined) return;
    e.stopPropagation();
    onPickCell(cellCentreKm(cellOf(layout.cell[e.instanceId], size), radiusKm, size));
  };

  if (layout.count === 0) return null;

  return (
    <instancedMesh
      key={layout.count}
      ref={mesh}
      args={[geometryTemplate(), material, layout.count]}
      // Pickable only while the circle owns the screen; a forest of 85,000 columns
      // would otherwise swallow every tap meant for a building.
      raycast={interactive ? undefined : () => null}
      onClick={pick}
      onPointerMove={pick}
      frustumCulled={false}
    />
  );
}
