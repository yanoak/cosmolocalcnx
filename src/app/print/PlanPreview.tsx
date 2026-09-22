'use client';

import { useEffect, useRef } from 'react';
import { plateRing, type PrintGrid, type PrintOptions, type PrintSource } from '@/engine/print';
import { drawRoads, metresToPixels, roadTextureLayout } from '@/engine/roads';
import { GROUND, roadTone, SURFACE_ROLES, UI_TOKENS } from '@/engine/theme';

/**
 * The crop, top-down, before anything is built.
 *
 * The whole point of a hidden tool is that nobody watches it being used, so it has to
 * answer "is this the right bit of Wat Ket?" without a four-hour print. It draws the
 * same road polylines through the same `drawRoads` the ground texture uses, so what is
 * on screen here and what ends up on the plate come from one source.
 *
 * Deliberately 2D and deliberately not the diorama: this is a plan, and a plan is what
 * a seam, a tab and a tile boundary are legible on.
 */
export function PlanPreview({
  source,
  grid,
  options,
  maxPx = 1100,
}: {
  source: PrintSource;
  grid: PrintGrid;
  options: PrintOptions;
  maxPx?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    // Reuse the ground texture's layout maths so metres land in pixels the same way
    // they do on the diorama's own canvas — including the north-up y flip, which is
    // the one thing here that is easy to get mirrored and hard to notice.
    const layout = roadTextureLayout(grid.cropM, maxPx);
    canvas.width = layout.width;
    canvas.height = layout.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = GROUND.ground;
    ctx.fillRect(0, 0, layout.width, layout.height);

    const ring = (points: readonly [number, number][]) => {
      ctx.beginPath();
      points.forEach(([x, y], i) => {
        const [px, py] = metresToPixels([x, y], layout);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    };

    if (options.layers.green) {
      ctx.fillStyle = GROUND.green;
      for (const area of source.green) {
        ring(area.footprint);
        ctx.fill();
      }
    }

    if (options.layers.water) {
      ctx.fillStyle = SURFACE_ROLES.water.side;
      for (const area of source.water) {
        ring(area.footprint);
        ctx.fill();
      }
    }

    if (options.layers.roads) {
      // Only the ones that will actually be printed, so the plan is not more generous
      // than the plate.
      drawRoads(
        ctx,
        source.roads.filter((r) => r.width >= options.roadMinWidthM),
        layout,
        roadTone,
      );
    }

    if (options.layers.buildings) {
      ctx.fillStyle = SURFACE_ROLES['building.stock'].top;
      for (const building of source.buildings) {
        ring(building.footprint);
        ctx.fill();
      }
    }

    // Everything outside the crop, veiled — the plan shows its surroundings so the
    // centre can be judged, but only what is inside it gets printed.
    const [west, south, east, north] = grid.cropM;
    const [cx0, cy0] = metresToPixels([west, north], layout);
    const [cx1, cy1] = metresToPixels([east, south], layout);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, layout.width, layout.height);
    ctx.rect(cx0, cy0, cx1 - cx0, cy1 - cy0);
    ctx.fillStyle = color(GROUND.ground, 0.72);
    ctx.fill('evenodd');
    ctx.restore();

    // The seams, and the tabs that cross them.
    ctx.lineWidth = Math.max(1, layout.width / 700);
    ctx.strokeStyle = UI_TOKENS['ui.text'];
    ctx.strokeRect(cx0, cy0, cx1 - cx0, cy1 - cy0);

    const mmToPx = (cx1 - cx0) / grid.totalWidthMm;
    ctx.lineWidth = Math.max(1, layout.width / 1400);

    for (const tile of grid.tiles) {
      const [tw, ts, te, tn] = tile.boundsM;
      const [x0, y0] = metresToPixels([tw, tn], layout);
      const [x1, y1] = metresToPixels([te, ts], layout);
      ctx.strokeStyle = color(UI_TOKENS['ui.text'], 0.45);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

      // The plate outline, tabs and all, in tile-local mm mapped back onto the plan.
      if (options.tabs) {
        const outline = plateRing(tile, options.tabs);
        ctx.strokeStyle = UI_TOKENS['ui.accent'];
        ctx.beginPath();
        outline.forEach(([mx, my], i) => {
          const px = x0 + mx * mmToPx;
          const py = y1 - my * mmToPx;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.stroke();
      }

      ctx.fillStyle = UI_TOKENS['ui.text'];
      ctx.font = `600 ${Math.round(layout.width / 55)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(tile.key, x0 + 8, y0 + Math.round(layout.width / 45));
    }
  }, [source, grid, options, maxPx]);

  return (
    <figure className="plan">
      <canvas ref={ref} role="img" aria-label={planLabel(grid)} />
      <figcaption>{planLabel(grid)}</figcaption>
    </figure>
  );
}

function planLabel(grid: PrintGrid): string {
  const [west, south, east, north] = grid.cropM;
  return (
    `${Math.round(east - west)} × ${Math.round(north - south)} m of Wat Ket, north up, ` +
    `as ${grid.cols} × ${grid.rows} plate${grid.tiles.length > 1 ? 's' : ''} of ` +
    `${grid.tileWidthMm.toFixed(1)} × ${grid.tileHeightMm.toFixed(1)} mm. ` +
    `Orange is the printed outline, tabs included.`
  );
}

/** A token at partial alpha, without hard-coding a colour. */
function color(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
