'use client';

import {
  Map as MapLibreMap,
  Marker,
  addProtocol,
  setWorkerUrl,
  type CameraOptions,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type MapMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import { Protocol } from 'pmtiles';
import { useEffect, useRef } from 'react';
import { aeqdInverse, circleAround, type LatLon } from './aeqd';
import type { MapPose } from './chapters';
import type { City } from './cities';
import {
  ANCHOR_SOURCE,
  RING_LAYER,
  RING_SOURCE,
  cellColour,
  cellsLayerId,
  presentStyle,
  ringColour,
  type CellsLevel,
} from './mapstyle';
import { distanceFromCentreKm } from './cities';
import './PresentMap.css';

/**
 * The Present chapter's map: a flat MapLibre map with the basemap in the design tokens,
 * the population cells extruded on it, and the ring that grows out of Wat Ket.
 *
 * **A second renderer, behind the cut.** Since 24 Sep 2026 the circle view is this
 * and not the three.js scene. It mounts when the Present chapter opens and is torn
 * down when it closes — MapLibre's map is cheap to rebuild against a cached PMTiles
 * file, and holding a second WebGL context through the other chapters is exactly the
 * "pay for a world nobody is looking at" the project forbids.
 *
 * The page owns every decision — which pose, what ring radius, whether the visitor
 * may drag — and this component only applies them, the way `CameraRig` does for the
 * diorama. The one mutable thing here is the map itself.
 *
 * Labels are DOM `Marker`s from the city file, as they were `Html` over the canvas:
 * text stays selectable and readable by a screen reader, and no glyph pipeline is
 * needed. See plans/2026-09-24_present-on-maplibre.plan.md.
 */

let protocolRegistered = false;
function registerProtocol() {
  if (protocolRegistered) return;
  // MapLibre resolves its worker relative to its own module, which a bundler has moved;
  // the worker is served from public/ instead — see scripts/copy-maplibre-worker.sh.
  setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
  addProtocol('pmtiles', new Protocol().tile);
  protocolRegistered = true;
}

export interface MapPick {
  lat: number;
  lon: number;
  people: number;
  distKm: number;
}

function cameraOf(pose: MapPose): CameraOptions {
  return {
    center: [pose.centre[1], pose.centre[0]],
    zoom: pose.zoom,
    pitch: pose.pitch,
    bearing: pose.bearing,
  };
}

function ringFeature(origin: LatLon, km: number): FeatureCollection {
  if (!(km > 0)) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: circleAround(origin, km, 256).map(([lat, lon]) => [lon, lat]),
        },
      },
    ],
  };
}

export function PresentMap({
  basemapUrl,
  cellsUrl,
  levels,
  origin,
  claimKm,
  ringKm,
  pose,
  continuous,
  durationMs = 600,
  interactive,
  labels,
  onPick,
}: {
  /** `pmtiles://…` URLs. */
  basemapUrl: string;
  cellsUrl: string;
  /** The cells pyramid's levels, from the sidecar. */
  levels: readonly CellsLevel[];
  /** The scene origin — Wat Ket — as [lat, lon]. */
  origin: LatLon;
  claimKm: number;
  ringKm: number;
  pose: MapPose;
  /** True while a ring beat plays: the pose is applied as a cut every tick, not eased. */
  continuous: boolean;
  durationMs?: number;
  interactive: boolean;
  /** Cities that carry a permanent label. */
  labels: readonly City[];
  onPick?: (pick: MapPick) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const loaded = useRef(false);
  const latest = useRef({ ringKm, pose, continuous, interactive, claimKm });
  latest.current = { ringKm, pose, continuous, interactive, claimKm };
  const pickHandler = useRef(onPick);
  pickHandler.current = onPick;

  /** The map, once. */
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    registerProtocol();

    const m = new MapLibreMap({
      container: el,
      style: presentStyle(basemapUrl, cellsUrl, latest.current.claimKm, levels),
      ...cameraOf(latest.current.pose),
      maxPitch: 85,
      // Yan's call, 24 Sep 2026: no further out than 3 — the circle stays the subject
      // rather than a patch on a world map, and the 0.25° cells are the coarsest the
      // field is ever seen at. (The archive itself starts at 2.) The basemap stops at 6
      // and both overzoom cleanly to 9.
      minZoom: 3,
      maxZoom: 9,
      attributionControl: false,
      interactive: true,
      // Development only: keeps the drawn frame readable, so a script can sample the
      // canvas's pixels and say what rendered — the check a backgrounded tab cannot make
      // by eye. Costs a buffer copy per frame, which production does not pay.
      canvasContextAttributes: { preserveDrawingBuffer: process.env.NODE_ENV !== 'production' },
      // Nothing here is a game either: the map redraws on its own events only.
      fadeDuration: 0,
    });
    map.current = m;

    // MapLibre swallows style and source errors into an event; surface them, and in
    // development leave a handle on the window so the map can be asked questions.
    m.on('error', (e) => console.error('[PresentMap]', e.error ?? e));
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __presentMap?: MapLibreMap }).__presentMap = m;
    }

    const markers: Marker[] = [];

    m.on('style.load', () => {
      (m.getSource(ANCHOR_SOURCE) as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [origin[1], origin[0]] } },
        ],
      });
      loaded.current = true;
      applyRing(m, origin, latest.current.ringKm, latest.current.claimKm, levels);
      applyInteraction(m, latest.current.interactive);

      for (const city of labels) {
        const [lat, lon] = aeqdInverse(city.km, origin);
        const span = document.createElement('span');
        span.className =
          distanceFromCentreKm(city) >= latest.current.claimKm * 0.93
            ? 'city-label-text is-rim'
            : 'city-label-text';
        span.textContent = city.name;
        const wrap = document.createElement('div');
        wrap.className = 'city-label';
        wrap.appendChild(span);
        markers.push(new Marker({ element: wrap, anchor: 'left' }).setLngLat([lon, lat]).addTo(m));
      }
    });

    const pick = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      if (!latest.current.interactive) return;
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as { p?: number; d?: number };
      pickHandler.current?.({
        lat: e.lngLat.lat,
        lon: e.lngLat.lng,
        people: Number(p.p ?? 0),
        distKm: Number(p.d ?? 0),
      });
    };
    for (const level of levels) {
      m.on('mousemove', cellsLayerId(level), pick);
      m.on('click', cellsLayerId(level), pick);
    }

    const observer = new ResizeObserver(() => m.resize());
    observer.observe(el);

    return () => {
      observer.disconnect();
      for (const marker of markers) marker.remove();
      m.remove();
      map.current = null;
      loaded.current = false;
    };
    // The URLs, the origin and the labels are fixed for the life of the chapter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemapUrl, cellsUrl, origin, labels, levels]);

  /** The camera: a cut per scroll tick during a ring beat, an ease otherwise. */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (continuous) m.jumpTo(cameraOf(pose));
    else m.easeTo({ ...cameraOf(pose), duration: durationMs });
  }, [pose, continuous, durationMs]);

  /** The ring, and the cells' colour against it. */
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded.current) return;
    applyRing(m, origin, ringKm, claimKm, levels);
  }, [ringKm, claimKm, origin, levels]);

  /** Hands on or off. */
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded.current) return;
    applyInteraction(m, interactive);
  }, [interactive]);

  return <div ref={container} className="present-map" />;
}

function applyRing(
  m: MapLibreMap,
  origin: LatLon,
  ringKm: number,
  claimKm: number,
  levels: readonly CellsLevel[],
) {
  (m.getSource(RING_SOURCE) as GeoJSONSource | undefined)?.setData(
    ringFeature(origin, ringKm),
  );
  if (m.getLayer(RING_LAYER)) m.setPaintProperty(RING_LAYER, 'line-color', ringColour(ringKm, claimKm));
  const colour = cellColour(ringKm);
  for (const level of levels) {
    const id = cellsLayerId(level);
    if (m.getLayer(id)) m.setPaintProperty(id, 'fill-extrusion-color', colour);
  }
}

/**
 * During the stem the wheel scrolls the story and a drag would fight the beat's
 * pose, so every handler is off; the bowl turns them on. Rotation stays off: the
 * globe already turns under the camera, and a visitor who spins it leaves a broken
 * screen for the next person — the same rule the diorama keeps.
 */
function applyInteraction(m: MapLibreMap, on: boolean) {
  const handlers = [m.dragPan, m.scrollZoom, m.touchZoomRotate, m.doubleClickZoom, m.keyboard, m.touchPitch];
  for (const h of handlers) (on ? h.enable() : h.disable());
  m.dragRotate.disable();
  if (on) m.touchZoomRotate.disableRotation();
  m.getCanvas().style.cursor = on ? 'grab' : 'default';
}
