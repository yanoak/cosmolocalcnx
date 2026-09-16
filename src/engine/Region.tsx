'use client';

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
import { UI_TOKENS } from './theme';

/**
 * The REGION register: a flat plane carrying half of humanity.
 *
 * FLAT is a September decision, not a permanent one. The committed field is people
 * per cell and December extrudes it into columns; drawing it into a texture in the
 * meantime costs two draw calls, needs no shader, and gets the argument on screen
 * inside the week. Nothing about the data or the schema has to change to extrude it
 * later — see `aggregate` in region.ts.
 *
 * Authored in KILOMETRES. The parent group carries the scale that reconciles that
 * with the district's metres, which is what keeps the 2,500:1 gap out of the scene
 * graph and float32 comfortable at both ends. See registers.ts.
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

export const Region = forwardRef<
  THREE.Mesh,
  {
    url: string;
    meta: RegionMeta;
    /** The scene origin's position on the circle, in km east/north of its centre. */
    anchor: [number, number];
    materialRef?: React.RefObject<THREE.MeshBasicMaterial | null>;
  }
>(function Region({ url, meta, anchor, materialRef }, ref) {
  const field = useRegionField(url, meta);
  const radiusKm = meta.projection.radiusKm;

  const texture = useMemo(() => {
    if (!field) return null;

    const { size } = meta.grid;
    const layout = regionTextureLayout(radiusKm);

    // The field at its own resolution, then scaled up smoothly. 13 km cells drawn
    // hard would be an honest picture of the data and a worse picture of Asia; the
    // information here is the shape of where people are, not the grid it arrived on.
    const source = document.createElement('canvas');
    source.width = size;
    source.height = size;
    const sourceCtx = source.getContext('2d');
    if (!sourceCtx) return null;
    sourceCtx.putImageData(
      new ImageData(fieldToRgba(field, size, meta.encoding.max), size, size),
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

    drawCircle(ctx, layout, UI_TOKENS['ui.text']);
    drawAnchor(ctx, layout, anchor, UI_TOKENS['ui.accent']);

    const map = new THREE.CanvasTexture(canvas);
    // Authored in sRGB against an unlit material, exactly like the road texture —
    // declare it or every tone lands wrong against its token.
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }, [field, meta, radiusKm, anchor]);

  // A CanvasTexture holds GPU memory until it is told not to.
  useEffect(() => () => texture?.dispose(), [texture]);

  if (!texture) return null;

  return (
    <mesh
      ref={ref}
      rotation={[-Math.PI / 2, 0, 0]}
      // Under the district's ground plane by an unambiguous margin, so nothing
      // z-fights while both registers are resident through the handover.
      position={[0, -0.5, 0]}
      // The region is scenery, never a target. Only hotspots and placed objects are
      // pickable, and a plane this size would swallow every tap in the scene.
      raycast={() => null}
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
        opacity={0}
      />
    </mesh>
  );
});
