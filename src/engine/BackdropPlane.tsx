'use client';

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import {
  backdropPalette,
  planeRect,
  type BackdropMeta,
  type BackdropSliceMeta,
} from './backdrop';
import { GROUND_TRACK_TO_VIEW_RAY, screenBasis } from './camera';

/**
 * The far city, hung on planes normal to the view direction.
 *
 * 61,116 of the scene's 68,704 buildings live here rather than in the vertex buffer —
 * 885k of its 997k triangles. What makes that legitimate rather than a cheat is in
 * `lod.ts`: the camera is orthographic and never rotates, so zooming is a 2D scale of
 * the projected image and panning is a 2D translation. The raster is the same picture
 * the geometry would have drawn, and only resolution degrades.
 *
 * TWO planes, not one. A single plane behind the near geometry would hide the 17,560
 * far buildings that stand between the camera and Wat Ket. Each slice is hung just
 * clear of the near set's depth range, so ordinary depth testing does the occlusion
 * and nothing here has to sort anything.
 *
 * Lives inside the district group, like `ReliefBackdrop`, so it shrinks and fades with
 * the district through the handover and needs no register logic of its own.
 *
 * Named BackdropPlane rather than Backdrop because `backdrop.ts` holds the maths, and
 * two files differing only in casing is fine on macOS and two different files on the
 * Linux box Vercel builds on. Fourth time that lesson has been paid for; see
 * ReliefBackdrop.tsx, RegionPlane.tsx and BridgeMesh.tsx.
 */

export interface BackdropSource {
  meta: BackdropMeta;
  /** Slice field name to bundled URL. */
  urls: Record<string, string>;
}

/**
 * The camera basis `camera.ts` fixes, as three.js vectors.
 *
 * Right, up and toward-the-camera axes of the view, derived from the attitude rather
 * than written here — until 24 Sep 2026 they were three literal vectors, the fourth
 * place the diagonal camera was restated. They are constants because the camera never
 * rotates — the single fact this whole module rests on.
 *
 * `GROUND_TRACK_TO_VIEW_RAY`: `lod.ts` measures depth along the camera's ground track,
 * which is the number you can read off a plan; the view ray is steeper by cos(pitch)
 * because the camera is elevated. Only the sign and the ordering actually matter here —
 * an orthographic camera does not care how far away the plane is — but getting it
 * right means the planes sit where the sidecar says they do.
 */
const BASIS = screenBasis();
const RIGHT = new THREE.Vector3(...BASIS.right);
const UP = new THREE.Vector3(...BASIS.up);
const TOWARDS_CAMERA = new THREE.Vector3(...BASIS.towards);

/**
 * Turn the tone-index raster into a colour texture.
 *
 * The PNG stores INDICES, not colours, so that `theme.ts` keeps the palette — the same
 * split `wat-ket.relief.png` uses for its hypsometric ramp, and for the same reason:
 * the brand changed on 16 Sep 2026 and a backdrop with colours baked in would have
 * quietly kept the old one. The cost of that is this function, which is one pass over
 * 2.4 megapixels at load.
 *
 * Index 0 is "nothing here" and becomes transparent, which is what lets the ground
 * plane and its roads show through between the far buildings.
 */
function paletteTexture(image: HTMLImageElement): THREE.DataTexture | null {
  const { naturalWidth: width, naturalHeight: height } = image;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);

  const palette = backdropPalette();
  const colour = new THREE.Color();
  // Index to RGBA, resolved once rather than per pixel.
  const lut = palette.map((hex) => {
    if (!hex) return [0, 0, 0, 0];
    colour.set(hex);
    return [
      Math.round(colour.r * 255),
      Math.round(colour.g * 255),
      Math.round(colour.b * 255),
      255,
    ];
  });

  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    // Greyscale PNG: R, G and B are all the index. Anything outside the table is a
    // corrupt raster, and painting it transparent loses a building rather than the
    // whole exhibition.
    const entry = lut[data[i * 4]] ?? lut[0];
    out[i * 4] = entry[0];
    out[i * 4 + 1] = entry[1];
    out[i * 4 + 2] = entry[2];
    out[i * 4 + 3] = entry[3];
  }

  const texture = new THREE.DataTexture(out, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  // Mipmaps matter here: at district fit a 2,048 px raster is shown at about 1,076 px
  // on a phone, and unfiltered minification of a city of four-pixel buildings shimmers
  // through the whole collapse.
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function useSliceTexture(url: string | undefined): THREE.DataTexture | null {
  const [texture, setTexture] = useState<THREE.DataTexture | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled) return;
      setTexture(paletteTexture(image));
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => () => texture?.dispose(), [texture]);

  return texture;
}

function Slice({ slice, url }: { slice: BackdropSliceMeta; url: string | undefined }) {
  const texture = useSliceTexture(url);

  const { position, quaternion, width, height } = useMemo(() => {
    const rect = planeRect(slice);
    const basis = new THREE.Matrix4().makeBasis(RIGHT, UP, TOWARDS_CAMERA);
    return {
      position: new THREE.Vector3()
        .addScaledVector(RIGHT, rect.centre[0])
        .addScaledVector(UP, rect.centre[1])
        .addScaledVector(TOWARDS_CAMERA, slice.depthM * GROUND_TRACK_TO_VIEW_RAY),
      quaternion: new THREE.Quaternion().setFromRotationMatrix(basis),
      width: rect.width,
      height: rect.height,
    };
  }, [slice]);

  if (!texture) return null;

  return (
    // Not pickable, for the same reason the ground and the relief are not — and
    // because there is nothing behind a raster pixel to select.
    <mesh position={position} quaternion={quaternion} raycast={() => null}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        // The planes sit at true world depths either side of the near set, so ordinary
        // depth TESTING does the occlusion. Depth WRITING is off because a transparent
        // pixel must not stamp the buildings behind it out of the buffer.
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

export function BackdropPlane({ source }: { source: BackdropSource }) {
  return (
    <>
      {source.meta.slices.map((slice) => (
        <Slice key={slice.slice} slice={slice} url={source.urls[slice.field]} />
      ))}
    </>
  );
}
