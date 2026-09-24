/**
 * The printed map is an export of the same scene. This module is the page geometry and
 * the vector overlay for it: given the camera fit the screen uses, where every world
 * point lands on a sheet of paper, and an SVG of rivers, roads, rail, icons and labels
 * in named groups that a layout program opens as layers over the raster basemap.
 *
 * Nothing here is drawn twice: the fit is `isometricFit`, the projection is
 * `projectView`, the pins are the document's hotspots and the words are the doc's. See
 * plans/2026-09-24_faiways-map-export.plan.md and "The newspaper map is an export" in
 * docs/roadmap.md. Pure: numbers and strings, no DOM.
 */

import { projectView, type CameraFit } from './camera';
import type { Point2 } from './extrude';
import { ICON_SIZE, type IconSprite } from './icons';

export interface PageSpec {
  widthPx: number;
  heightPx: number;
  dpi: number;
}

/** Half an A3 sheet: A4 landscape, 297 × 210 mm, at 300 dpi. */
export const A4_LANDSCAPE_300: PageSpec = { widthPx: 3508, heightPx: 2480, dpi: 300 };

export function pxForMm(mm: number, dpi: number): number {
  return (mm / 25.4) * dpi;
}

export function pxForPt(pt: number, dpi: number): number {
  return (pt / 72) * dpi;
}

/** The fit's projection onto a page: pixels per metre and where the target sits. */
export interface PageProjection {
  page: PageSpec;
  /** Pixels per world metre — the orthographic zoom for this page. */
  zoom: number;
  /** The target's screen-metre coordinates, which land at the page's centre. */
  centre: [number, number];
}

export function pageProjection(fit: CameraFit, page: PageSpec): PageProjection {
  // The fit's target is three.js [x, 0, z]; world north is −z.
  const [cx, cy] = projectView(fit.target[0], -fit.target[2], fit.target[1]);
  return { page, zoom: fit.zoom, centre: [cx, cy] };
}

/** A world point — east, north, height in metres — to page pixels, y down. */
export function toPage(p: PageProjection, x: number, y: number, h = 0): [number, number] {
  const [sx, sy] = projectView(x, y, h);
  return [
    (sx - p.centre[0]) * p.zoom + p.page.widthPx / 2,
    p.page.heightPx / 2 - (sy - p.centre[1]) * p.zoom,
  ];
}

export interface ExportPin {
  id: string;
  label: string;
  /** Where it is drawn, in world metres — already clamped to the frame if it had to be. */
  at: Point2;
  /** Surface height at `at`, in scene metres (exaggerated, as the screen has it). */
  h: number;
  sprite: IconSprite | undefined;
  labelSide?: 'above' | 'below';
}

export interface ExportPathGroup {
  id: string;
  colour: string;
  widthPx: number;
  opacity?: number;
  dashed?: boolean;
  /** Each path as world points with height. */
  paths: Array<Array<[number, number, number]>>;
}

export interface OverlayOptions {
  projection: PageProjection;
  groups: ExportPathGroup[];
  pins: ExportPin[];
  /** The icon's long edge on the page, in millimetres. */
  iconMm: number;
  /** Label size in points. */
  labelPt: number;
  labelColour: string;
  labelFont: string;
  /** A basemap image to reference from the SVG's first group, or null for none. */
  basemapHref: string | null;
  title?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const num = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * The overlay: one SVG the size of the page, groups in draw order — basemap, then each
 * path group, then icons, then labels — every element positioned by `toPage`, so it
 * registers with a basemap rendered from the same fit at the same size.
 */
export function overlaySvg(o: OverlayOptions): string {
  const { projection: p, page } = { projection: o.projection, page: o.projection.page };
  const W = page.widthPx;
  const H = page.heightPx;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
  );
  if (o.title) parts.push(`  <title>${esc(o.title)}</title>`);
  parts.push(
    `  <desc>Generated from the cosmolocalcnx scene at ${page.dpi} dpi; ${num(p.zoom * 1000)} px per km. ` +
      `Groups are layers: basemap, paths, icons, labels.</desc>`,
  );

  if (o.basemapHref) {
    parts.push(`  <g id="basemap">`);
    parts.push(`    <image href="${esc(o.basemapHref)}" x="0" y="0" width="${W}" height="${H}"/>`);
    parts.push(`  </g>`);
  }

  for (const g of o.groups) {
    const dash = g.dashed ? ` stroke-dasharray="${num(g.widthPx * 3)} ${num(g.widthPx * 2)}"` : '';
    parts.push(
      `  <g id="${esc(g.id)}" fill="none" stroke="${esc(g.colour)}" stroke-width="${num(g.widthPx)}" ` +
        `stroke-linecap="round" stroke-linejoin="round"` +
        (g.opacity !== undefined && g.opacity < 1 ? ` opacity="${num(g.opacity)}"` : '') +
        dash +
        `>`,
    );
    for (const path of g.paths) {
      if (path.length < 2) continue;
      const pts = path.map(([x, y, h]) => toPage(p, x, y, h).map(num).join(',')).join(' ');
      parts.push(`    <polyline points="${pts}"/>`);
    }
    parts.push(`  </g>`);
  }

  const iconPx = pxForMm(o.iconMm, page.dpi);
  parts.push(`  <g id="icons">`);
  for (const pin of o.pins) {
    if (!pin.sprite) continue;
    const scale = iconPx / ICON_SIZE;
    const w = pin.sprite.width * scale;
    const h = pin.sprite.height * scale;
    const [px, py] = toPage(p, pin.at[0], pin.at[1], pin.h);
    const x = px - w * pin.sprite.anchor[0];
    const y = py - h * pin.sprite.anchor[1];
    parts.push(
      `    <image id="icon-${esc(pin.id)}" href="${esc(pin.sprite.file)}" x="${num(x)}" y="${num(y)}" ` +
        `width="${num(w)}" height="${num(h)}"/>`,
    );
  }
  parts.push(`  </g>`);

  const labelPx = pxForPt(o.labelPt, page.dpi);
  parts.push(
    `  <g id="labels" font-family="${esc(o.labelFont)}" font-size="${num(labelPx)}" font-weight="600" ` +
      `fill="${esc(o.labelColour)}" text-anchor="middle">`,
  );
  for (const pin of o.pins) {
    const [px, py] = toPage(p, pin.at[0], pin.at[1], pin.h);
    const iconH = pin.sprite ? pin.sprite.height * (iconPx / ICON_SIZE) : 0;
    const above = pin.labelSide === 'above';
    const y = above ? py - iconH - labelPx * 0.5 : py + labelPx * 1.15;
    parts.push(`    <text id="label-${esc(pin.id)}" x="${num(px)}" y="${num(y)}">${esc(pin.label)}</text>`);
  }
  parts.push(`  </g>`);
  parts.push(`</svg>`);
  return parts.join('\n') + '\n';
}
