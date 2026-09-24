'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Diorama } from '@/engine/Diorama';
import { isometricFit } from '@/engine/camera';
import { iconFor } from '@/engine/icons';
import {
  A4_LANDSCAPE_300,
  overlaySvg,
  pageProjection,
  type ExportPathGroup,
  type ExportPin,
} from '@/engine/mapexport';
import { placeInFrame } from '@/engine/pins';
import { sceneBoundsMetres, type SceneDocument } from '@/engine/scene';
import { PALETTE, PALETTE_EXTENDED, REGISTERS } from '@/engine/theme';
import { sampleHeight, smoothField, waterwayWeight, STROKE_PX } from '@/engine/valley';
import { surfaceHeights, useValleyField } from '@/engine/ValleyView';
import type { ViewId } from '@/engine/views';
import copyDoc from '@/content/copy.json';
import { BACKDROP_ASSETS } from '@/scenes/backdrop';
import { RELIEF_ASSETS } from '@/scenes/relief';
import { VALLEY_ASSETS } from '@/scenes/valley';
import scene from '@/scenes/wat-ket.json';
import viewerScene from '@/scenes/wat-ket.viewer.json';
import './export.css';

/**
 * The Faiways map, exported: the valley and the city as a raster basemap each, plus an
 * SVG of rivers, roads, rail, icons and labels in named groups, both at the page's
 * exact pixel size so they register. Internal — this directory is in .vercelignore for
 * the same reason /print is: no server, no auth, so the route is absent rather than
 * hidden, and it imports the FULL scene so the city prints as geometry rather than as
 * the screen's 4.8 m backdrop raster. See plans/2026-09-24_faiways-map-export.plan.md.
 */

const DOC = scene as unknown as SceneDocument;
/** The screen's own document — 7,588 near buildings — for the valley map, where the city is a patch. */
const LIGHT = viewerScene as unknown as SceneDocument;
const BOUNDS = sceneBoundsMetres(DOC);
const VALLEY = (() => {
  const ref = DOC.valley;
  const asset = ref ? VALLEY_ASSETS[ref.field] : undefined;
  return asset ? { url: asset.url, meta: asset.meta, features: asset.features } : null;
})();
const RELIEF = (() => {
  const ref = DOC.relief;
  const asset = ref ? RELIEF_ASSETS[ref.field] : undefined;
  return asset ? { url: asset.url, meta: asset.meta } : null;
})();
const BACKDROP = (() => {
  const ref = DOC.backdrop;
  return ref ? (BACKDROP_ASSETS[ref.meta] ?? null) : null;
})();
const FUTURES = [...DOC.hotspots, ...DOC.scenarios.flatMap((s) => s.hotspots)].filter((h) => h.chapter === 'futures');
const COPY = new Map(
  ((copyDoc as unknown as { en: { futures: { hotspots: Array<{ id: string; label?: string }> } } }).en.futures.hotspots).map(
    (c) => [c.id, c.label ?? c.id],
  ),
);
const NO_THREADS = new Set<never>();

type MapId = 'valley' | 'city';

export default function ExportPage() {
  // `?map=city` opens on the inset — one map per page load keeps each download the first
  // of its page, clear of Chrome's multiple-downloads prompt.
  const [map, setMap] = useState<MapId>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('map') === 'city' ? 'city' : 'valley',
  );
  const [dpi, setDpi] = useState(A4_LANDSCAPE_300.dpi);
  const [iconMm, setIconMm] = useState(14);
  const [labelPt, setLabelPt] = useState(8);
  const [transport, setTransport] = useState(true);
  const sheet = useRef<HTMLDivElement>(null);
  const renderNow = useRef<(() => void) | null>(null);

  const page = useMemo(
    () => ({ widthPx: Math.round((297 / 25.4) * dpi), heightPx: Math.round((210 / 25.4) * dpi), dpi }),
    [dpi],
  );

  // The same fit the screen would use for a viewport of the page's size.
  const view: ViewId = map;
  const half = VALLEY ? Math.abs(VALLEY.meta.grid.bboxM[2]) : 60000;
  const fit = useMemo(
    () => isometricFit(map === 'valley' ? [-half, -half, half, half] : BOUNDS, { width: page.widthPx, height: page.heightPx }),
    [map, half, page],
  );
  const projection = useMemo(() => pageProjection(fit, page), [fit, page]);

  // Terrain heights, so the valley's pins and lines sit on the surface as they do on screen.
  const raw = useValleyField(VALLEY?.url ?? '', VALLEY!.meta);
  const heights = useMemo(() => {
    if (!raw || !VALLEY) return null;
    return surfaceHeights(smoothField(raw, VALLEY.meta.grid.size), VALLEY.meta, 'hillshade');
  }, [raw]);
  const hAt = useCallback(
    (x: number, y: number) => (map === 'valley' && heights && VALLEY ? sampleHeight(heights, VALLEY.meta, [x, y]) : 0),
    [map, heights],
  );

  const pins = useMemo<ExportPin[]>(() => {
    return FUTURES.filter((h) => h.view === view && h.at).map((h) => {
      const placed = map === 'valley' ? placeInFrame(h.at!, half) : { at: h.at!, clamped: false, distanceKm: 0, compass: '' };
      const name = COPY.get(h.id) ?? h.id;
      return {
        id: h.id,
        label: placed.clamped ? `${name} · ${placed.distanceKm} km ${placed.compass}` : name,
        at: placed.at,
        h: hAt(placed.at[0], placed.at[1]),
        sprite: iconFor(h.icon),
        labelSide: h.labelSide,
      };
    });
  }, [view, map, half, hAt]);

  const groups = useMemo<ExportPathGroup[]>(() => {
    if (map !== 'valley' || !VALLEY?.features) return [];
    const f = VALLEY.features;
    const lift = (path: [number, number][]) => path.map(([x, y]) => [x, y, hAt(x, y)] as [number, number, number]);
    const k = page.dpi / 96; // screen px → page px, so the print's weights match the screen's
    const out: ExportPathGroup[] = [
      { id: 'water-ping', colour: PALETTE_EXTENDED['cosmo.skyBlue'], widthPx: STROKE_PX.main * k, paths: f.rivers.filter((r) => waterwayWeight(r.name) === 'main').map((r) => lift(r.path)) },
      { id: 'water-rivers', colour: PALETTE_EXTENDED['cosmo.skyBlue'], widthPx: STROKE_PX.named * k, paths: f.rivers.filter((r) => waterwayWeight(r.name) === 'named').map((r) => lift(r.path)) },
    ];
    if (transport) {
      out.push(
        { id: 'roads-primary', colour: PALETTE['cosmo.violet'], widthPx: STROKE_PX.primary * k, opacity: 0.32, paths: (f.roads ?? []).filter((r) => r.kind === 'primary').map((r) => lift(r.path)) },
        { id: 'roads-trunk', colour: PALETTE['cosmo.violet'], widthPx: STROKE_PX.motorway * k, opacity: 0.45, paths: (f.roads ?? []).filter((r) => r.kind !== 'primary').map((r) => lift(r.path)) },
        { id: 'rail', colour: PALETTE_EXTENDED['cosmo.deepViolet'], widthPx: STROKE_PX.rail * k, opacity: 0.6, dashed: true, paths: (f.rails ?? []).map((r) => lift(r.path)) },
      );
    }
    return out;
  }, [map, transport, hAt, page.dpi]);

  const svg = useMemo(
    () =>
      overlaySvg({
        projection,
        groups,
        pins,
        iconMm,
        labelPt,
        labelColour: REGISTERS.page.ink,
        labelFont: 'IBM Plex Sans Thai, IBM Plex Sans, sans-serif',
        basemapHref: `${map}-basemap.png`,
        title: `Faiways — ${map === 'valley' ? 'Ping Valley' : 'Wat Ket'}, 2045`,
      }),
    [projection, groups, pins, iconMm, labelPt, map],
  );

  // The sheet is laid out at its true pixel size and the page scrolls: a CSS transform to
  // shrink it for looking at made the renderer measure a scaled stage and draw a small
  // canvas. Zoom the browser out to see the whole sheet.

  const download = (name: string, href: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.click();
  };
  const downloadBasemap = () => {
    const canvas = sheet.current?.querySelector('canvas');
    if (!canvas) return;
    // A frame right now, whatever the tab's visibility: see RenderHandle in Diorama.
    renderNow.current?.();
    download(`${map}-basemap.png`, canvas.toDataURL('image/png'));
  };
  const downloadSvg = () => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    download(`${map}-overlay.svg`, url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="export">
      <div className="export-head">
        <h1>Faiways map export</h1>
        <label>
          Map{' '}
          <select value={map} onChange={(e) => setMap(e.target.value as MapId)}>
            <option value="valley">Ping Valley</option>
            <option value="city">Wat Ket (inset)</option>
          </select>
        </label>
        <label>
          dpi <input type="number" min={72} max={600} step={1} value={dpi} onChange={(e) => setDpi(Number(e.target.value) || 300)} />
        </label>
        <label>
          icon mm <input type="number" min={4} max={60} step={1} value={iconMm} onChange={(e) => setIconMm(Number(e.target.value) || 14)} />
        </label>
        <label>
          label pt <input type="number" min={4} max={24} step={0.5} value={labelPt} onChange={(e) => setLabelPt(Number(e.target.value) || 8)} />
        </label>
        {map === 'valley' && (
          <label>
            <input type="checkbox" checked={transport} onChange={(e) => setTransport(e.target.checked)} /> roads and rail
          </label>
        )}
        <button type="button" className="button--invite" onClick={downloadBasemap}>
          Download basemap PNG
        </button>
        <button type="button" className="button--invite" onClick={downloadSvg} disabled={map === 'valley' && !heights}>
          Download overlay SVG
        </button>
        <p className="export-note">
          A4 landscape, {page.widthPx} × {page.heightPx} px. The SVG&apos;s first group references{' '}
          <code>{map}-basemap.png</code> beside it; groups are layers. Icons are the 1024 px sprites under{' '}
          <code>/icons/</code>.
        </p>
      </div>

      <div className="export-sheet-wrap">
        <div
          ref={sheet}
          className="export-sheet"
          style={{ width: page.widthPx, height: page.heightPx }}
        >
          <Diorama
            bounds={BOUNDS}
            // All 68,704 for the city map, where they are the picture; the screen's 7,588
            // for the valley, where merging the lot would freeze the page for nothing.
            buildings={map === 'city' ? DOC.baseline.buildings : LIGHT.baseline.buildings}
            roads={DOC.baseline.roads}
            water={DOC.baseline.water}
            green={DOC.baseline.green}
            selectedId={null}
            onSelect={() => {}}
            debug={false}
            wireframe={false}
            relief={RELIEF}
            backdrop={map === 'city' ? null : BACKDROP}
            valley={VALLEY}
            view={view}
            interactive={false}
            valleyTransport={false}
            valleyThreads={map === 'valley' ? NO_THREADS : null}
            dpr={1}
            exportable
            renderHandle={renderNow}
          />
          {/* The overlay, live, so what is on screen is what the files will be. */}
          <div className="export-overlay" dangerouslySetInnerHTML={{ __html: svg.replace(/<g id="basemap">[\s\S]*?<\/g>\n/, '') }} />
        </div>
      </div>
    </div>
  );
}
