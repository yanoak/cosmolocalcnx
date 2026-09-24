'use client';

import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { forwardRef, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import {
  decodeField,
  drawAnchor,
  drawCircle,
  fieldToRgba,
  regionTextureLayout,
  type RegionMeta,
} from './region';
import { cellCentreKm, distanceFromCentreKm, type City } from './cities';
import { RegionColumns } from './RegionColumns';
import { POPULATION_RAMP, POPULATION_RAMP_OUTSIDE, REGISTERS, UI_TOKENS } from './theme';

/**
 * The REGION register: a flat plane carrying half of humanity.
 *
 * Named for the plane rather than the register because `region.ts` beside it holds
 * the maths. Two files differing only in casing is fine on macOS and two different
 * files on the Linux box Vercel builds on, which is a build that fails only in CI.
 *
 * FLAT is a September decision, not a permanent one. The committed field is people
 * per cell and December extrudes it into columns; drawing it into a texture in the
 * meantime costs two draw calls, needs no shader, and gets the argument on screen
 * inside the week. Nothing about the data or the schema has to change to extrude it
 * later — see `aggregate` in region.ts.
 *
 * Authored in KILOMETRES. The parent group carries the scale that reconciles that
 * with the district's metres, which is what keeps the 2,500:1 gap out of the scene
 * graph and float32 comfortable at both ends. See `regionScale` in camera.ts.
 */

/** Decode the committed PNG to people per cell, once. */
function useRegionField(url: string, meta: RegionMeta) {
  const [field, setField] = useState<Float32Array | null>(null);

  useEffect(() => {
    let cancelled = false;

    // A canvas is the only way to get pixels back out of a PNG in a browser — and
    // the reason the field is two 8-bit channels rather than one 16-bit one, since
    // this path truncates to 8 bits per channel whatever the file says.
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled) return;
      const { size } = meta.grid;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(image, 0, 0);
      const { data } = ctx.getImageData(0, 0, size, size);
      setField(decodeField(data, size, meta.encoding.max, meta.encoding.gamma));
    };
    image.src = url;

    return () => {
      cancelled = true;
    };
  }, [url, meta]);

  return field;
}

/**
 * Paint a decoded field into a texture, with optional furniture drawn over it.
 *
 * Shared by the circle and the world planes so the two cannot drift in how they
 * upscale, colour-manage or dispose. The only differences between them are the ramp
 * and whether anything is drawn on top.
 */
function useFieldTexture(
  field: Float32Array | null,
  meta: RegionMeta,
  stops: readonly string[],
  furniture?: (ctx: CanvasRenderingContext2D, layout: ReturnType<typeof regionTextureLayout>) => void,
): THREE.CanvasTexture | null {
  const radiusKm = meta.projection.radiusKm;

  const texture = useMemo(() => {
    if (!field) return null;

    const { size } = meta.grid;
    const layout = regionTextureLayout(radiusKm);

    // The field at its own resolution, then scaled up smoothly. Hard cells would be
    // an honest picture of the grid and a worse picture of Asia; the information
    // here is the shape of where people are, not the lattice it arrived on.
    const source = document.createElement('canvas');
    source.width = size;
    source.height = size;
    const sourceCtx = source.getContext('2d');
    if (!sourceCtx) return null;
    sourceCtx.putImageData(
      new ImageData(fieldToRgba(field, size, meta.encoding.max, stops), size, size),
      0,
      0,
    );

    const canvas = document.createElement('canvas');
    canvas.width = layout.size;
    canvas.height = layout.size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, layout.size, layout.size);
    furniture?.(ctx, layout);

    const map = new THREE.CanvasTexture(canvas);
    // Authored in sRGB against an unlit material, exactly like the road texture —
    // declare it or every tone lands wrong against its token.
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
    // `furniture` is a fresh closure every render and must not re-bake a 2048px
    // texture; the things it actually depends on are all listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, meta, radiusKm, stops]);

  useEffect(() => () => texture?.dispose(), [texture]);

  return texture;
}

/**
 * The world outside the circle.
 *
 * A second, much larger plane under the first, in the same projection and the same
 * frame — so the circle lands on it exactly where it belongs and the seam falls
 * under the rim stroke that is drawn there anyway.
 *
 * Its own field, because one grid cannot serve both: a single raster covering the
 * planet at the circle's 13 km resolution would be enormous, and one coarse enough
 * to ship would throw away the detail the hero view depends on. Two fields, each
 * at the resolution its job needs.
 */
const WorldPlane = forwardRef<
  THREE.Mesh,
  {
    url: string;
    meta: RegionMeta;
    materialRef?: React.RefObject<THREE.MeshBasicMaterial | null>;
  }
>(function WorldPlane({ url, meta, materialRef }, ref) {
  const field = useRegionField(url, meta);
  const texture = useFieldTexture(field, meta, POPULATION_RAMP_OUTSIDE);
  const radiusKm = meta.projection.radiusKm;

  if (!texture) return null;

  return (
    <mesh
      ref={ref}
      rotation={[-Math.PI / 2, 0, 0]}
      // Under the circle plane by an unambiguous margin.
      position={[0, -0.8, 0]}
      // Context, never a target. The cities file covers the circle only, so a tap
      // out here has nothing to answer with.
      raycast={() => null}
    >
      <planeGeometry args={[radiusKm * 2, radiusKm * 2]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        toneMapped={false}
        transparent
        depthWrite={false}
        opacity={1}
      />
    </mesh>
  );
});

export const RegionPlane = forwardRef<
  THREE.Mesh,
  {
    url: string;
    meta: RegionMeta;
    /** The scene origin's position on the circle, in km east/north of its centre. */
    anchor: [number, number];
    materialRef?: React.RefObject<THREE.MeshBasicMaterial | null>;
    /** Cities that carry a permanent label. Already selected — see cities.ts. */
    labels?: readonly City[];
    /** True only while the region owns the screen, so it never swallows a tap. */
    interactive?: boolean;
    onPickCell?: (km: [number, number]) => void;
    /** The cell to outline, if any. */
    highlight?: [number, number] | null;
    /** The world outside the circle. Absent is valid — the circle alone still works. */
    world?: { url: string; meta: RegionMeta } | null;
    worldMaterialRef?: React.RefObject<THREE.MeshBasicMaterial | null>;
    /** The growing circle's radius, km. Columns beyond it recede; the ring is drawn here. */
    ringKm?: number;
    /** The claim radius, km. Past it the ring changes tone: the argument is made. */
    claimKm?: number;
  }
>(function RegionPlane(
  {
    url,
    meta,
    anchor,
    materialRef,
    labels = [],
    interactive = false,
    onPickCell,
    highlight,
    world,
    worldMaterialRef,
    ringKm = 0,
    claimKm = 0,
  },
  ref,
) {
  const field = useRegionField(url, meta);
  const radiusKm = meta.projection.radiusKm;

  const texture = useFieldTexture(field, meta, POPULATION_RAMP, (ctx, layout) => {
    drawCircle(ctx, layout, UI_TOKENS['ui.text']);
    drawAnchor(ctx, layout, anchor, UI_TOKENS['ui.accent']);
  });

  // A CanvasTexture holds GPU memory until it is told not to.
  useEffect(() => () => texture?.dispose(), [texture]);

  const gridSize = meta.grid.size;

  const highlightCentre = useMemo(
    () => (highlight ? cellCentreKm(highlight, radiusKm, gridSize) : null),
    [highlight, radiusKm, gridSize],
  );
  const cellKm = (2 * radiusKm) / gridSize;

  /**
   * The ring: a flat annulus whose radius follows `ringKm`. Rebuilt per radius, which
   * is a 256-segment ring — cheap enough to do on every scroll tick. Its width is a
   * fixed fraction of the field so it reads the same at every stage of the growth.
   */
  const ringWidth = Math.max(radiusKm / 250, 1);
  const ringTone = ringKm > claimKm * 1.001 ? REGISTERS.page.muted : UI_TOKENS['ui.accent'];

  if (!texture) return null;

  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || !onPickCell) return;
    e.stopPropagation();
    // The plane is centred on the circle and laid flat, so the hit point IS the
    // position in kilometres — no inverse projection needed. Only reached where no
    // column stands, since the columns are raycast first and stop propagation.
    onPickCell([e.point.x, -e.point.z]);
  };

  return (
    <>
    {world && (
      <WorldPlane url={world.url} meta={world.meta} materialRef={worldMaterialRef} />
    )}

    <mesh
      ref={ref}
      rotation={[-Math.PI / 2, 0, 0]}
      // Under the district's ground plane by an unambiguous margin, so nothing
      // z-fights while both registers are resident through the handover.
      position={[0, -0.5, 0]}
      // Pickable ONLY while the region owns the screen. A plane this size would
      // otherwise swallow every tap meant for a building.
      raycast={interactive ? undefined : () => null}
      onClick={pick}
      onPointerMove={pick}
    >
      <planeGeometry args={[radiusKm * 2, radiusKm * 2]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        toneMapped={false}
        transparent
        // The handover crossfades this against the district; writing depth while
        // translucent would punch a hole in whatever is behind it.
        depthWrite={false}
        opacity={1}
      />
    </mesh>

    {field && (
      <RegionColumns
        field={field}
        meta={meta}
        ringKm={ringKm}
        interactive={interactive}
        onPickCell={onPickCell}
      />
    )}

    {ringKm > 0 && (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.3, 0]} raycast={() => null}>
        <ringGeometry args={[Math.max(0, ringKm - ringWidth), ringKm, 256]} />
        <meshBasicMaterial color={ringTone} toneMapped={false} />
      </mesh>
    )}

    {highlightCentre && (
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[highlightCentre[0], 0.4, -highlightCentre[1]]}
        raycast={() => null}
      >
        {/* A ring, not a filled square: the cell's own colour IS the datum, and
            painting over it would hide the thing being asked about. */}
        <ringGeometry args={[cellKm * 0.62, cellKm * 0.78, 4, 1, Math.PI / 4]} />
        <meshBasicMaterial color={UI_TOKENS['ui.accent']} toneMapped={false} />
      </mesh>
    )}

    {labels.map((city) => (
      <Html
        key={`${city.name}-${city.km[0]}-${city.km[1]}`}
        position={[city.km[0], 0.6, -city.km[1]]}
        center={false}
        // Text lives in the DOM over the canvas, never baked into WebGL — the same
        // rule the hotspot copy follows, and what keeps it selectable, translatable
        // and readable by a screen reader.
        className="city-label"
        zIndexRange={[20, 10]}
        style={{ pointerEvents: 'none' }}
      >
        <span
          className={
            distanceFromCentreKm(city) >= radiusKm * 0.93
              ? 'city-label-text is-rim'
              : 'city-label-text'
          }
        >
          {city.name}
        </span>
      </Html>
    ))}
    </>
  );
});
