'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Diorama } from '@/engine/Diorama';
import { cellAt, citiesInCell, nearestCity, type City } from '@/engine/cities';
import { pickLabels } from '@/engine/cities';
import { TokenSwatches } from '@/engine/DebugOverlay';
import { SelectPanel, type Selection } from '@/engine/SelectPanel';
import { step } from '@/engine/ordering';
import {
  sceneBoundsMetres,
  validateScene,
  type BaselineBuilding,
  type SceneDocument,
} from '@/engine/scene';
import { chooseLod, type LodMode } from '@/engine/lod';
import {
  browserStorage,
  loadSettings,
  resolveSettings,
  saveSettings,
} from '@/engine/settings';
import { availableViews, resolveView, VIEW_ORDER, type ViewId } from '@/engine/views';
import { Rail } from '@/engine/Rail';
import type { ValleyStyle } from '@/engine/valley';
import { BACKDROP_ASSETS } from '@/scenes/backdrop';
import { VALLEY_ASSETS } from '@/scenes/valley';
import { REGION_ASSETS } from '@/scenes/regions';
import { RELIEF_ASSETS } from '@/scenes/relief';
import scene from '@/scenes/wat-ket.viewer.json';

/**
 * The VIEWER document, not the full one.
 *
 * `wat-ket.json` holds all 68,704 buildings and is the source of truth — the editor
 * and the generators read it. This is the same scene with the 61,116 buildings that
 * the backdrop raster draws taken out: 4.2 MB against 18.9 MB, which is the byte half
 * of the phone budget. `scripts/render-backdrop.ts` writes it and
 * `backdrop-freshness.test.ts` fails the suite if it drifts from its source.
 */
const DOC = scene as unknown as SceneDocument;

/**
 * The region register's committed field, resolved from the path the document names.
 *
 * Absent is a valid state, not a broken one — a scene with no population field has
 * two registers instead of three. See RegionRef in scene.ts.
 */
const REGION = (() => {
  const ref = DOC.region;
  const asset = ref ? REGION_ASSETS[ref.field] : undefined;
  if (!asset) return null;
  return {
    url: asset.url,
    meta: asset.meta,
    origin: DOC.origin as [number, number],
    cities: asset.cities.cities,
    // Selected once at module scope: the choice depends only on committed data, so
    // recomputing it per render would be work a phone does for no reason.
    labels: pickLabels(asset.cities.cities, asset.meta.projection.radiusKm),
    world: asset.world,
  };
})();

/**
 * The relief backdrop, resolved the same way. Absent is a valid state: a scene with
 * no relief field is a diorama on a bare page, which is what every scene was until
 * 19 Sep 2026. See ReliefRef in scene.ts.
 */
const RELIEF = (() => {
  const ref = DOC.relief;
  const asset = ref ? RELIEF_ASSETS[ref.field] : undefined;
  return asset ? { url: asset.url, meta: asset.meta } : null;
})();

/**
 * The far city, pre-rendered. Absent is a valid state: a scene with no backdrop
 * renders every baseline building as geometry, which is what this did until
 * 21 Sep 2026 and what a scene inside the triangle budget still does.
 */
const BACKDROP = (() => {
  const ref = DOC.backdrop;
  const asset = ref ? BACKDROP_ASSETS[ref.meta] : undefined;
  return asset ?? null;
})();

/**
 * The valley field, resolved the same way. Absent is a valid state: the scene then has
 * two views instead of three.
 */
const VALLEY = (() => {
  const ref = DOC.valley;
  const asset = ref ? VALLEY_ASSETS[ref.field] : undefined;
  return asset ? { url: asset.url, meta: asset.meta, features: asset.features } : null;
})();

/**
 * The buildings a hotspot points at, which the district register emphasises.
 *
 * Deliberately derived rather than stored: the set of buildings worth emphasising
 * and the set somebody wrote a panel about are the same set, and deriving it means
 * they cannot drift. Empty until item 5's content lands, which switches the
 * emphasis off rather than dimming everything.
 */
const HERO_IDS: ReadonlySet<string> = new Set(
  [...DOC.hotspots, ...DOC.scenarios.flatMap((s) => s.hotspots)]
    .map((h) => h.target)
    .filter((t): t is string => typeof t === 'string' && t !== ''),
);

/** Which of the three worlds this scene actually has. The city is always one of them. */
const HAS_VIEWS = { circle: REGION !== null, valley: VALLEY !== null };
const VIEWS = availableViews(HAS_VIEWS);

/**
 * There is no 2026 here, and there is no `era`.
 *
 * Both were cut on 23 Sep 2026 when space was locked to time period. This view IS the
 * future view, so 2045 is a property of the view rather than a state the file holds:
 * the on-ramp that descended through a 2026 Wat Ket, the hold before the futures took
 * over, and the idle reset back to it are all gone. `baseline` is the geometry 2045 is
 * built from and is never shown as itself.
 *
 * See "a view owns a tense" in CLAUDE.md.
 */

/**
 * Three worlds, named for what they are rather than for a zoom level.
 *
 * "Asia" became "The circle" because the view is not a continent — it is a claim with a
 * boundary, and the caption underneath states the claim.
 */
const VIEW_LABELS: Record<ViewId, string> = {
  circle: 'The circle',
  valley: 'The valley',
  city: 'Wat Ket',
};
export default function Page() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locale, setLocale] = useState('en');
  const [debug, setDebug] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  /**
   * How the valley's topography is drawn. Pinned by `?relief=` so the exhibition
   * machine can be set once and so the three can be compared side by side.
   */
  const [relief, setRelief] = useState<ValleyStyle>('hillshade');
  /**
   * Whether the far city is a raster or real geometry.
   *
   * `near` is the default and is what the phone gets: 7,588 buildings and a
   * pre-rendered backdrop for the other 61,116. `full` is for the exhibition laptop
   * and the projector, which have no phone budget to keep and are the surfaces where
   * somebody actually stands and zooms in. See
   * plans/2026-09-23_full-geometry-option.plan.md.
   */
  const [lod, setLod] = useState<LodMode>('near');
  const [fullBuildings, setFullBuildings] = useState<BaselineBuilding[] | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const hasRegion = REGION !== null;
  const [view, setView] = useState<ViewId>(resolveView(hasRegion ? 'circle' : 'city', HAS_VIEWS));

  /**
   * `?view=`, `?relief=` and `?lod=` — deep links into a view, a topography style and
   * a level of detail.
   *
   * Not a debug hatch: the exhibition machine opens on a fixed view, and a QR code that
   * lands somebody on the valley rather than on the circle is a real thing to want. It
   * also means a view can be looked at without clicking, which is what made it possible
   * to compare the relief styles at all.
   *
   * `?lod=full` is the one that changes what is rendered rather than what is shown:
   * the laptop and the projector draw every building as geometry and skip the raster
   * entirely. It is set once on the machine that runs the installation.
   */
  useEffect(() => {
    // Stored settings first, then the URL over the top of them. `resolveSettings` is
    // pure and tested, including the case that matters most: an ABSENT parameter must
    // leave a stored value alone rather than reset it, or visiting `/` at all would
    // wipe the machine's configuration.
    const params = new URLSearchParams(window.location.search);
    const settings = resolveSettings(loadSettings(browserStorage()), params);

    setRelief(settings.relief);
    setLod(settings.lod);
    setLocale(settings.locale);

    if (settings.view) {
      setView(resolveView(settings.view, HAS_VIEWS));
    }
  }, []);

  /**
   * The full document, fetched only when somebody asks for it.
   *
   * NEVER a static import: `wat-ket.json` is 19 MB and a top-level import would put it
   * in the shared chunk, so every phone would pay for it and the whole reason the
   * viewer document exists would be gone. `await import()` gives it its own chunk that
   * is requested once, cached, and never touched on a default load.
   */
  useEffect(() => {
    if (lod !== 'full' || fullBuildings) return;
    let cancelled = false;
    void (async () => {
      const doc = await import('@/scenes/wat-ket.json');
      if (cancelled) return;
      const full = doc as unknown as { default: SceneDocument };
      setFullBuildings(full.default.baseline.buildings);
    })();
    return () => {
      cancelled = true;
    };
  }, [lod, fullBuildings]);

  /**
   * What the visitor is pointing at on the circle.
   *
   * A cell rather than a city, because the question a bright patch prompts is
   * "what is that?" and the honest answer is sometimes two cities — Dhaka and
   * Narayanganj share a 13 km cell, as do Shenzhen and Dongguan. Naming only the
   * largest would misreport the patch.
   */
  const [pickedCell, setPickedCell] = useState<[number, number] | null>(null);
  const [pickedKm, setPickedKm] = useState<[number, number] | null>(null);

  const onPickCell = useCallback((km: [number, number]) => {
    if (!REGION) return;
    const cell = cellAt(km, REGION.meta.projection.radiusKm, REGION.meta.grid.size);
    setPickedKm(km);
    setPickedCell(cell);
  }, []);

  const pickedCities: City[] = useMemo(() => {
    if (!REGION || !pickedCell) return [];
    const { radiusKm } = REGION.meta.projection;
    const found = citiesInCell(REGION.cities, pickedCell, radiusKm, REGION.meta.grid.size);
    if (found.length > 0) return found;
    // A near miss still answers. A tap that silently does nothing reads as broken.
    const near = pickedKm ? nearestCity(REGION.cities, pickedKm, 120) : null;
    return near ? [near.city] : [];
  }, [pickedCell, pickedKm]);

  const goToView = useCallback((next: ViewId) => {
    setView(resolveView(next, HAS_VIEWS));
    if (next !== 'circle') {
      setPickedCell(null);
      setPickedKm(null);
    }
  }, []);

  /**
   * Already only the near buildings — the split happened in the generator, not here.
   * 112k triangles against the 997k the full document would extrude, which is what
   * puts this inside the budget in `docs/architecture.md` for the first time since
   * the scene took in the old city.
   */
  /**
   * Near or full, and the backdrop that goes with it.
   *
   * The raster is dropped only once the geometry has ARRIVED, never when it is asked
   * for — otherwise there is a hole where the far city was for as long as a 19 MB
   * fetch takes. `chooseLod` is pure and tested for exactly that.
   */
  const { buildings, backdrop, pending } = chooseLod(
    lod,
    DOC.baseline.buildings,
    fullBuildings,
    BACKDROP,
  );
  const bounds = useMemo(() => sceneBoundsMetres(DOC), []);

  // Surfaces a bad hand-edit immediately rather than rendering something wrong.
  const problems = useMemo(() => validateScene(DOC), []);

  const selection: Selection | null = useMemo(() => {
    const b = buildings.find((x) => x.id === selectedId);
    return b ? { id: b.id, kind: b.kind, height: b.height } : null;
  }, [buildings, selectedId]);

  const close = useCallback(() => {
    setSelectedId(null);
    stage.current?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const arrows: Record<string, [1 | -1, 'horizontal' | 'vertical']> = {
        ArrowRight: [1, 'horizontal'],
        ArrowLeft: [-1, 'horizontal'],
        ArrowDown: [1, 'vertical'],
        ArrowUp: [-1, 'vertical'],
      };
      const move = arrows[e.key];
      if (move) {
        e.preventDefault();
        setSelectedId((id) => step(buildings, id, move[1], move[0]));
        return;
      }
      if (e.key === 'Escape') close();
      if (e.key.toLowerCase() === 'd') setDebug((v) => !v);
      if (e.key.toLowerCase() === 'w') setWireframe((v) => !v);
      // Reachable only from a keyboard, which is the laptop-and-projector surface that
      // can afford a million triangles. A visitor on a phone cannot trigger the fetch.
      //
      // It SAVES what it toggled to, so what somebody judged on the machine is what the
      // machine keeps. A toggle that forgets is worse than no toggle: it would look
      // configured and come back wrong after a restart.
      if (e.key.toLowerCase() === 'f') {
        setLod((m) => {
          const next: LodMode = m === 'full' ? 'near' : 'full';
          const storage = browserStorage();
          saveSettings(storage, { ...loadSettings(storage), lod: next });
          return next;
        });
      }
      if (e.key === '1' && hasRegion) goToView('circle');
      if (e.key === '2' && VALLEY) goToView('valley');
      if (e.key === '3') goToView('city');
    },
    [buildings, close, hasRegion, goToView],
  );

  return (
    <main className="viewer">
      <div className="topbar">
        <h1>Wat Ket 2045</h1>
        <div className="controls">
          {pending && <span className="lod-status">loading full geometry…</span>}
          {VIEWS.length > 1 && (
            <Rail
              views={VIEWS}
              current={view}
              labels={VIEW_LABELS}
              onSelect={goToView}
              shortcutFor={(id) => VIEW_ORDER.indexOf(id) + 1}
            />
          )}
          <button
            type="button"
            aria-pressed={locale === 'th'}
            onClick={() => setLocale((l) => (l === 'en' ? 'th' : 'en'))}
          >
            {locale === 'en' ? 'EN' : 'TH'}
          </button>
          <button type="button" aria-pressed={debug} onClick={() => setDebug((v) => !v)}>
            debug
          </button>
        </div>
      </div>

      {problems.length > 0 && (
        <div className="panel" role="alert">
          <strong>Scene document is invalid</strong>
          <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <div className="stage">
        <div
          ref={stage}
          className="canvas-wrap"
          tabIndex={0}
          role="application"
          aria-label="Wat Ket diorama. Arrow keys move between buildings, Enter opens details, Escape closes."
          onKeyDown={onKeyDown}
        >
          <div className="canvas-fill">
            <Diorama
              bounds={bounds}
              buildings={buildings}
              roads={DOC.baseline.roads}
              water={DOC.baseline.water}
              green={DOC.baseline.green}
              selectedId={selectedId}
              onSelect={setSelectedId}
              debug={debug}
              wireframe={wireframe}
              region={REGION}
              relief={RELIEF}
              backdrop={backdrop}
              heroIds={HERO_IDS}
              view={view}
              valley={VALLEY}
              reliefStyle={relief}
              onPickCell={onPickCell}
              highlight={pickedCell}
            />
          </div>
        </div>
        <div className="register-caption" aria-live="polite">
          {view === 'circle' ? (
            pickedCities.length > 0 ? (
              <p className="city-readout">
                <strong>{pickedCities.map((c) => c.name).join(' · ')}</strong>{' '}
                <span>
                  {pickedCities
                    .reduce((total, c) => total + c.population, 0)
                    .toLocaleString()}{' '}
                  people ·{' '}
                  {Math.round(Math.hypot(...(pickedKm ?? [0, 0]))).toLocaleString()} km from
                  the centre
                </span>
              </p>
            ) : (
              <p>
                <strong>4.09 billion people live inside this circle. 4.10 billion live
                everywhere else.</strong>{' '}
                <span>
                  Wat Ket is 280 km from its centre — 8% of the way to the rim.
                </span>
              </p>
            )
          ) : view === 'valley' ? (
            <p>
              <strong>The valley the city grew in.</strong>{' '}
              <span>
                120 km across, from Doi Inthanon to the Ping. Heights are exaggerated
                four times, so the ground reads as ground.
              </span>
            </p>
          ) : (
            <p>Wat Ket, 2045.</p>
          )}
        </div>

        <SelectPanel selection={selection} locale={locale} onClose={close} />
      </div>

      {debug && <TokenSwatches />}

      {/* Four sources whose licences require attribution to be VISIBLE — OSM under
          ODbL, the Wat Ket tambon boundary under CC BY-IGO, and the region
          register's population field and city names under CC BY 4.0. A few lines of
          JSX, easy to forget until someone asks. See the table in README.md. */}
      <p className="attribution">
        Building footprints and street data ©{' '}
        <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, ODbL.
        Further footprints from <a href="https://overturemaps.org/">Overture Maps</a>, ODbL,
        incorporating{' '}
        <a href="https://sites.research.google/open-buildings/">Google Open Buildings</a> and{' '}
        <a href="https://github.com/microsoft/GlobalMLBuildingFootprints">
          Microsoft Building Footprints
        </a>
        . Building heights from{' '}
        <a href="https://sites.research.google/gr/open-buildings/temporal/">
          Google Open Buildings 2.5D Temporal
        </a>
        , CC BY 4.0. Relief from the{' '}
        <a href="https://registry.opendata.aws/copernicus-dem/">Copernicus DEM</a>: © DLR e.V.
        2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the
        European Union and ESA; all rights reserved. District boundary from{' '}
        <a href="https://data.humdata.org/dataset/cod-ab-tha">
          OCHA Thailand administrative boundaries
        </a>
        , CC BY-IGO. Population from{' '}
        <a href="https://human-settlement.emergency.copernicus.eu/">
          GHS-POP, European Commission JRC
        </a>
        , CC BY 4.0. City names from <a href="https://www.geonames.org/">GeoNames</a>, CC BY
        4.0.
      </p>
    </main>
  );
}
