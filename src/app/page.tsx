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
import {
  resolveView,
  VIEW_ORDER,
  CHAPTER_ORDER,
  CHAPTER_TENSE,
  availableChapters,
  chaptersOf,
  defaultView,
  resolveChapter,
  type ChapterId,
  type ViewId,
} from '@/engine/views';
import { Rail } from '@/engine/Rail';
import { Scrolly, type BeatCopy } from '@/engine/Scrolly';
import { Explore } from '@/engine/Explore';
import { beatAt, releasedAt, type BeatPosition } from '@/engine/chapters';
import { SCORES } from '@/content/scores';
import copyDoc from '@/content/copy.json';
import { ViewHeader } from '@/engine/ViewHeader';
import { Credits } from '@/engine/Credits';
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
const CHAPTERS = availableChapters(HAS_VIEWS);

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
  // Opens on the earliest view it has. `resolveView` falls through to the city when the
  // valley field is absent, so a scene with no DEM still opens on something.
  // The chapter is the visitor's position in the argument; the view is what is on screen.
  // They are separate state because Futures uses two views, so `view` alone cannot say
  // which chapter is open. Opens on the earliest chapter the scene has.
  const [chapter, setChapter] = useState<ChapterId>(resolveChapter(null, HAS_VIEWS));

  /**
   * A chapter is a tilted martini glass: an authored stem, then a bowl. `mode` is which
   * half the visitor is in. The stem's scroll position picks a beat, the beat names the
   * view and the camera; the terminal beat releases into explore, and from there only a
   * control moves the visitor on — never a beat.
   */
  const [mode, setMode] = useState<'stem' | 'explore'>('stem');
  const [position, setPosition] = useState<BeatPosition>({ index: 0, t: 0 });
  const viewer = useRef<HTMLElement>(null);
  const score = SCORES[chapter];
  const beat = score.beats[position.index] ?? score.beats[0];
  const beatCopy = useMemo<BeatCopy[]>(() => {
    const byLocale = copyDoc as unknown as Record<string, Record<string, { beats?: BeatCopy[] }>>;
    return (byLocale[locale] ?? byLocale.en)?.[chapter]?.beats ?? [];
  }, [locale, chapter]);

  // The beat names the view. This is the ONLY place a view is chosen during a stem.
  useEffect(() => {
    if (mode === 'stem') setView(resolveView(beat.view, HAS_VIEWS));
  }, [mode, beat]);

  // The terminal beat, fully played, opens the bowl. Nothing closes it but a control.
  useEffect(() => {
    if (mode === 'stem' && releasedAt(score, position)) setMode('explore');
  }, [mode, score, position]);

  /** Scroll progress over the track → beat and 0–1 within it. See Scrolly.css for the geometry. */
  const onScroll = useCallback(() => {
    const el = viewer.current;
    if (!el || mode !== 'stem') return;
    const n = score.beats.length;
    const max = Math.max(1, (n - 1) * el.clientHeight);
    setPosition(beatAt(el.scrollTop / max, n));
  }, [mode, score]);

  const scrollToBeat = useCallback((index: number, smooth = true) => {
    const el = viewer.current;
    if (!el) return;
    el.scrollTo({ top: Math.max(0, index) * el.clientHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  const [view, setView] = useState<ViewId>(() => resolveView(defaultView(resolveChapter(null, HAS_VIEWS)), HAS_VIEWS));

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
      // A stored or deep-linked VIEW picks the first chapter that uses it — valley means
      // Past here, not Futures. A `?chapter=` parameter is the honest fix and is a later
      // addition; this keeps existing links working.
      const v = resolveView(settings.view, HAS_VIEWS);
      setView(v);
      setChapter(resolveChapter(chaptersOf(v)[0] ?? null, HAS_VIEWS));
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

  /** Chapter first, view from it. The only way the number keys and the rail move. */
  const goToChapter = useCallback((next: ChapterId) => {
    const c = resolveChapter(next, HAS_VIEWS);
    setChapter(c);
    setMode('stem');
    setPosition({ index: 0, t: 0 });
    viewer.current?.scrollTo({ top: 0 });
    setView(resolveView(defaultView(c), HAS_VIEWS));
    if (defaultView(c) !== 'circle') {
      setPickedCell(null);
      setPickedKm(null);
    }
  }, []);

  /** A view change inside the current chapter — what a Futures beat will do to reach the valley. */
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
      // In the stem the keys drive the story, not the buildings.
      if (mode === 'stem') {
        if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          scrollToBeat(position.index + 1);
          e.preventDefault();
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          scrollToBeat(position.index - 1);
          e.preventDefault();
          return;
        }
        if (e.key === 'Escape') {
          scrollToBeat(score.beats.length - 1, false);
          setMode('explore');
          return;
        }
      }
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
      // Number keys are chapters, in CHAPTER_ORDER. Until 24 Sep 2026 these were hardcoded
      // to the old scale order while the rail labelled them temporally — pressing 1 went to
      // the circle and the rail said 1 was the valley.
      const n = Number(e.key);
      if (n >= 1 && n <= CHAPTER_ORDER.length) goToChapter(CHAPTER_ORDER[n - 1]);
    },
    [buildings, close, goToChapter, mode, position.index, score, scrollToBeat],
  );

  return (
    <main
      ref={viewer}
      className={mode === 'stem' ? 'viewer is-stem' : 'viewer'}
      onScroll={onScroll}
    >
      <div className="topbar">
        <ViewHeader chapter={chapter} view={view} />
        <div className="controls">
          {pending && <span className="lod-status">loading full geometry…</span>}
          {CHAPTERS.length > 1 && (
            <Rail
              stops={CHAPTERS}
              current={chapter}
              labels={CHAPTER_TENSE}
              onSelect={goToChapter}
              shortcutFor={(id) => CHAPTER_ORDER.indexOf(id) + 1}
            />
          )}
          {/* `EN`/`TH` and `debug` sat here until 24 Sep 2026. The locale is still
              state — `/settings` and `?locale=` set it — and the button returns when
              there is Thai copy to switch to. Debug stays on `d`. Neither belonged in a
              bar that stands beside the printed panels. */}
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
              beat={mode === 'stem' ? beat : null}
              interactive={mode === 'explore'}
            />
          </div>
        </div>
        {mode === 'explore' && (
        <div className="view-caption" aria-live="polite">
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
        )}
        {mode === 'explore' && (
          <Explore
            next={CHAPTERS[CHAPTERS.indexOf(chapter) + 1] ?? null}
            nextLabel={CHAPTER_TENSE[CHAPTERS[CHAPTERS.indexOf(chapter) + 1] ?? chapter]}
            onStory={() => {
              setMode('stem');
              requestAnimationFrame(() => scrollToBeat(score.beats.length - 1, false));
            }}
            onNext={goToChapter}
          />
        )}

        <SelectPanel selection={selection} locale={locale} onClose={close} />

        {/* Seven sources whose licences require attribution to be VISIBLE — OSM and
            Overture under ODbL, the tambon boundary under CC BY-IGO, the heights, the
            population field and the city names under CC BY 4.0, the DEM under its fixed
            notice. Behind an `i` since 24 Sep 2026, which is still visible: it opens
            on tap. See the table in README.md. */}
        <Credits>
          <p>
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
        </Credits>
      </div>

      {mode === 'stem' && <Scrolly beats={score.beats} copy={beatCopy} current={position.index} />}

      {debug && <TokenSwatches />}

    </main>
  );
}
