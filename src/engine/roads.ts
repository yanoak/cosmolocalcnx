/**
 * Roads as a ground-plane canvas texture.
 *
 * Not a stylistic choice — `docs/architecture.md` requires it. 513 street polylines
 * buffered into ribbons would cost more triangles than every building in Wat Ket put
 * together, and at an isometric diorama's scale it would look the same or worse.
 *
 * The layout maths is here and pure so it can be tested; the drawing takes any
 * `CanvasRenderingContext2D`-shaped thing, so it can be tested too without a DOM.
 */

import type { Point2 } from './extrude';
import type { BaselineRoad } from './scene';

/**
 * Longest edge of the generated texture, in pixels.
 *
 * 2048 over the scene's 2.7 km long axis is about 1.3 m per pixel, which puts a
 * residential street at ~4 px and a footpath at ~1.5. Going to 4096 would quadruple
 * a phone's texture memory for detail that an orthographic diorama never shows.
 */
export const ROAD_TEXTURE_MAX_PX = 2048;

/** Enough padding that a wide road on the boundary is not sliced in half. */
const EDGE_PADDING_M = 10;

export interface TextureLayout {
  width: number;
  height: number;
  /** Metres per pixel. Equal on both axes — the texture is never stretched. */
  metresPerPixel: number;
  /** `[west, south, east, north]` in local metres, padded. */
  bounds: [number, number, number, number];
}

export function roadTextureLayout(
  [west, south, east, north]: [number, number, number, number],
  maxPx: number = ROAD_TEXTURE_MAX_PX,
): TextureLayout {
  const bounds: [number, number, number, number] = [
    west - EDGE_PADDING_M,
    south - EDGE_PADDING_M,
    east + EDGE_PADDING_M,
    north + EDGE_PADDING_M,
  ];

  const spanX = Math.max(1, bounds[2] - bounds[0]);
  const spanY = Math.max(1, bounds[3] - bounds[1]);
  const metresPerPixel = Math.max(spanX, spanY) / maxPx;

  return {
    width: Math.max(1, Math.round(spanX / metresPerPixel)),
    height: Math.max(1, Math.round(spanY / metresPerPixel)),
    metresPerPixel,
    bounds,
  };
}

/**
 * Local metres to texture pixels.
 *
 * The y flip is the whole reason this is a named function rather than two lines
 * inline: local metres run north-positive and canvas pixels run down-positive, and
 * getting it wrong produces a street grid that is a perfect mirror of the real one
 * — which is exactly the kind of wrong an audience who knows these streets spots
 * and a developer who does not never will.
 */
export function metresToPixels([x, y]: Point2, layout: TextureLayout): Point2 {
  const [west, south, , north] = layout.bounds;
  return [
    (x - west) / layout.metresPerPixel,
    (north - y) / layout.metresPerPixel,
  ];
}

/** The minimum this module will draw, so a footpath never vanishes entirely. */
const MIN_STROKE_PX = 1.25;

/** Just enough of a 2D context to draw roads with — and to fake in a test. */
export interface StrokeContext {
  lineCap: string;
  lineJoin: string;
  lineWidth: number;
  /** The DOM's own union, so a real CanvasRenderingContext2D is assignable — a
   *  mutable property is invariant, and narrowing this to `string` rejects one. */
  strokeStyle: string | CanvasGradient | CanvasPattern;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
}

/**
 * Draws widest-first so that where a soi meets a main road, the main road's tone
 * wins at the junction rather than being nibbled by every side street.
 */
export function drawRoads(
  ctx: StrokeContext,
  roads: BaselineRoad[],
  layout: TextureLayout,
  tone: (kind: string) => string,
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const ordered = [...roads].sort((a, b) => b.width - a.width);

  for (const road of ordered) {
    if (road.path.length < 2) continue;

    ctx.lineWidth = Math.max(MIN_STROKE_PX, road.width / layout.metresPerPixel);
    ctx.strokeStyle = tone(road.kind);
    ctx.beginPath();

    road.path.forEach((point, i) => {
      const [px, py] = metresToPixels(point, layout);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });

    ctx.stroke();
  }
}
