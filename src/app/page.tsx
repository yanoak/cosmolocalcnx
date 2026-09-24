'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Diorama } from '@/engine/Diorama';
import { nearestCity, type City } from '@/engine/cities';
import { CENTRE_LABEL, pickLabels, SOUTHEAST_ASIA } from '@/engine/cities';
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
  CHAPTER_VIEWS,
  isAvailable,
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
import type { PinCopy } from '@/engine/PinLayer';
import { firstPin, nearestPin, pinsFor } from '@/engine/pins';
import type { Hotspot } from '@/engine/scene';
import { THREAD_ORDER, THREADS, threadOf, type ThreadId } from '@/engine/threads';
import {
  beatAt,
  mapPoseBetween,
  resolveMapPose,
  ringAt,
  type BeatPosition,
  type MapPose,
} from '@/engine/chapters';
import { halfPopulationRadius, peopleWithin } from '@/engine/region';
import { PresentMap, type MapPick } from '@/engine/PresentMap';
import { aeqdForward, type LatLon } from '@/engine/aeqd';
import { CELLS_META, MAP_URLS } from '@/scenes/map';
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
    meta: asset.meta,
    origin: DOC.origin as [number, number],
    cities: asset.cities.cities,
    // Selected once at module scope: the choice depends only on committed data, so
    // recomputing it per render would be work a phone does for no reason.
    labels: [CENTRE_LABEL, ...pickLabels(asset.cities.cities, asset.meta.projection.radiusKm, { focus: SOUTHEAST_ASIA })],
    world: asset.world,
  };
})();

/**
 * The claim: how far from Wat Ket you go to hold half of humanity.
 *
 * Derived from the committed 12,000 km field's cumulative curve, never typed in, so the
 * number on screen cannot drift from the raster it came from. Bracketed rather than
 * quoted to the kilometre: the field excludes everything beyond 12,000 km of its
 * centre — the Americas — so its own total is not the world's, and the honest answer
 * is a range over plausible world populations. The middle figure drives the ring; the
 * ends are the footnote.
 */
const WORLD_POPULATION = { low: 7.8e9, mid: 8.0e9, high: 8.2e9 } as const;
const CLAIM = (() => {
  const curve = REGION?.world?.meta.curve ?? REGION?.meta.curve ?? null;
  if (!curve) return null;
  return {
    curve,
    km: halfPopulationRadius(curve, WORLD_POPULATION.mid),
    lowKm: halfPopulationRadius(curve, WORLD_POPULATION.low),
    highKm: halfPopulationRadius(curve, WORLD_POPULATION.high),
  };
})();

/** `#past` → `past`; anything else → null. Chapters are the only things the hash names. */
function chapterInHash(hash: string): ChapterId | null {
  const id = hash.replace(/^#/, '');
  return (CHAPTER_ORDER as readonly string[]).includes(id) ? (id as ChapterId) : null;
}

/** "about 3,400 km" — rounded to the nearest hundred, which is all the bracket supports. */
const roundKm = (km: number) => Math.round(km / 100) * 100;

/**
 * Where the Present map sits: Wat Ket in the middle, the claim's circle fitting the
 * stage, tilted a little so the cells stand up. The camera holds here through the whole
 * stem — only the ring moves — and a beat's `mapPose`, if it ever has one, is filled from
 * this. Zoom is MapLibre's own scale: 4 is where a 0.125° cell is a pixel and a half and
 * a 3,400 km ring is about 700 px across. Pitch and bearing in degrees.
 */
const ORIGIN = DOC.origin as LatLon;
const MAP_HOME: MapPose = { zoom: 4, pitch: 40, bearing: 0, centre: ORIGIN };

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
  const topbar = useRef<HTMLDivElement>(null);

  /**
   * How tall the bar is, as a CSS variable on the viewer. In the stem the bar and the
   * stage are both sticky in the same scroll container, so the stage has to stick
   * BELOW the bar or it slides under it and loses its top strip — the ring readout,
   * the top of the map, a pin near the north edge. The bar's height depends on its
   * content and the viewport, so it is measured rather than assumed.
   */
  useLayoutEffect(() => {
    const bar = topbar.current;
    const host = viewer.current;
    if (!bar || !host) return;
    const set = () => host.style.setProperty('--topbar-h', `${Math.round(bar.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  const score = SCORES[chapter];
  const beat = score.beats[position.index] ?? score.beats[0];
  const beatCopy = useMemo<BeatCopy[]>(() => {
    const byLocale = copyDoc as unknown as Record<string, Record<string, { beats?: BeatCopy[] }>>;
    return (byLocale[locale] ?? byLocale.en)?.[chapter]?.beats ?? [];
  }, [locale, chapter]);

  /**
   * The chapter's pins: the document's hotspots that carry this tense, and the words the
   * doc has for them, by id. Hotspots are overlay and overlay carries the tense, so
   * filtering on chapter is what keeps a 2045 pin off the valley-as-past.
   */
  const chapterHotspots = useMemo<Hotspot[]>(
    () => [...DOC.hotspots, ...DOC.scenarios.flatMap((s) => s.hotspots)].filter((h) => h.chapter === chapter),
    [chapter],
  );
  const pinCopy = useMemo<ReadonlyMap<string, PinCopy>>(() => {
    const byLocale = copyDoc as unknown as Record<string, Record<string, { hotspots?: PinCopy[] }>>;
    const list = (byLocale[locale] ?? byLocale.en)?.[chapter]?.hotspots ?? [];
    return new Map(list.map((c) => [c.id, c]));
  }, [locale, chapter]);
  /** The views this chapter can show here: what the Diorama keeps warm and what the explore pair offers. */
  const chapterViews = useMemo(
    () => CHAPTER_VIEWS[chapter].filter((v) => isAvailable(v, HAS_VIEWS)),
    [chapter],
  );
  /**
   * The Past's threads on screen. In the stem, the beat's own `layers` — cumulative, one
   * arriving per card; in the bowl, whatever the toggles say, all five to begin with.
   * Null outside the Past, so the valley-as-futures never sees them. See threads.ts.
   */
  const [threadsOn, setThreadsOn] = useState<ReadonlySet<ThreadId>>(() => new Set(THREAD_ORDER));
  const toggleThread = useCallback((id: string) => {
    setThreadsOn((on) => {
      const next = new Set(on);
      if (next.has(id as ThreadId)) next.delete(id as ThreadId);
      else next.add(id as ThreadId);
      return next;
    });
  }, []);
  const valleyThreads = useMemo<ReadonlySet<ThreadId> | null>(() => {
    if (chapter !== 'past') return null;
    if (mode === 'stem') return new Set((beat.layers ?? []) as ThreadId[]);
    return threadsOn;
  }, [chapter, mode, beat, threadsOn]);
  /** In the Past's bowl a toggle takes its pins with it: no railway, no station. */
  const visibleHotspots = useMemo<Hotspot[]>(() => {
    if (chapter !== 'past' || mode !== 'explore') return chapterHotspots;
    return chapterHotspots.filter((h) => {
      const t = threadOf(h.id);
      return t === null || threadsOn.has(t);
    });
  }, [chapter, mode, chapterHotspots, threadsOn]);
  /** The pin whose popup is open. One at a time; the stem, a view change and a chapter change all close it. */
  const [openPin, setOpenPin] = useState<string | null>(null);

  // The beat names the view. This is the ONLY place a view is chosen during a stem.
  useEffect(() => {
    if (mode === 'stem') setView(resolveView(beat.view, HAS_VIEWS));
  }, [mode, beat]);

  // The bowl opens on a button under the terminal card, never on scroll position — a
  // visitor who reaches the end of the stem stays on the last words until they press it.
  // See Scrolly.tsx. Nothing closes the bowl but a control either.
  const openExplore = useCallback(() => setMode('explore'), []);

  /** Back to the first card: re-enter the stem and put the scroll at its top. */
  const reread = useCallback(() => {
    setMode('stem');
    setOpenPin(null);
    setPosition({ index: 0, t: 0 });
    requestAnimationFrame(() => viewer.current?.scrollTo({ top: 0 }));
  }, []);

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
  const [view, setView] = useState<ViewId>(() => resolveView(defaultView(resolveChapter(null, HAS_VIEWS), HAS_VIEWS), HAS_VIEWS));

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

    // The chapter is in the hash — `#past`, `#present`, `#futures` — so a refresh lands
    // where the visitor was, and a link can point at a chapter. It wins over `?view=`,
    // because it is the more recent thing the URL says. Added 24 Sep 2026.
    const fromHash = chapterInHash(window.location.hash);
    if (fromHash) {
      setChapter(resolveChapter(fromHash, HAS_VIEWS));
      setView(resolveView(defaultView(fromHash, HAS_VIEWS), HAS_VIEWS));
    }
  }, []);

  /**
   * Keep the hash on the chapter, without a scroll or a history entry per switch.
   *
   * It never overwrites a hash that names a chapter until the visitor has switched one
   * themselves: on load the hash is the input, and in development React runs effects
   * twice, so a writer that fired on mount would clobber `#present` with the initial
   * `#past` before the second read. `navigated` is set by `goToChapter` alone.
   */
  const navigated = useRef(false);
  useEffect(() => {
    const inUrl = chapterInHash(window.location.hash);
    if (inUrl === chapter) return;
    if (inUrl && !navigated.current) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${chapter}`);
  }, [chapter]);

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
   * What the visitor is pointing at on the map: a cell, with the nearest named city if
   * one is close. A cell rather than a city, because the question a bright patch
   * prompts is "what is that?" and the honest answer is sometimes two cities.
   */
  const [mapPick, setMapPick] = useState<MapPick | null>(null);
  /** True once the map has drawn its first full frame — the pre-warm has landed. */
  const [mapReady, setMapReady] = useState(false);
  const pickedCities: City[] = useMemo(() => {
    if (!REGION || !mapPick) return [];
    const km = aeqdForward([mapPick.lat, mapPick.lon], ORIGIN);
    const near = nearestCity(REGION.cities, km, 60);
    return near ? [near.city] : [];
  }, [mapPick]);

  /** Chapter first, view from it. The only way the number keys and the rail move. */
  const goToChapter = useCallback((next: ChapterId) => {
    const c = resolveChapter(next, HAS_VIEWS);
    navigated.current = true;
    setChapter(c);
    setMode('stem');
    setOpenPin(null);
    setPosition({ index: 0, t: 0 });
    viewer.current?.scrollTo({ top: 0 });
    setView(resolveView(defaultView(c, HAS_VIEWS), HAS_VIEWS));
    if (defaultView(c, HAS_VIEWS) !== 'circle') setMapPick(null);
  }, []);

  /**
   * A chapter always opens at the top of its stem. `goToChapter` scrolls to 0 at once,
   * but that runs before the new chapter's track is on screen — coming from the bowl the
   * viewer is not even a scroll container yet — so the browser could carry an old
   * position into the new stem. Yan saw exactly that on 24 Sep 2026: the rail landed
   * wherever the chapter had last been scrolled to. This runs after the commit.
   */
  useLayoutEffect(() => {
    if (mode !== 'stem') return;
    const el = viewer.current;
    if (!el) return;
    el.scrollTo({ top: 0 });
    setPosition({ index: 0, t: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter]);

  /** Back and forward, or a hash typed into the bar, move the chapter too. */
  useEffect(() => {
    const onHash = () => {
      const c = chapterInHash(window.location.hash);
      if (c) goToChapter(c);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [goToChapter]);

  /**
   * The map's camera during the Present stem. A ring beat interpolates toward the next
   * beat's pose as it plays, exactly as `poseBetween` does for the diorama; a beat
   * without a ring eases to its own pose. In the bowl the last pose is HELD — pushing a
   * new object would snap the map out from under a visitor's hands.
   */
  const nextBeat = score.beats[position.index + 1] ?? null;
  const heldMapPose = useRef<MapPose>(MAP_HOME);
  const mapPose = useMemo<MapPose>(() => {
    if (mode !== 'stem' || chapter !== 'present') return heldMapPose.current;
    const here = resolveMapPose(beat, MAP_HOME);
    const p =
      beat.ring && nextBeat
        ? mapPoseBetween(here, resolveMapPose(nextBeat, MAP_HOME), position.t)
        : here;
    heldMapPose.current = p;
    return p;
  }, [mode, chapter, beat, nextBeat, position.t]);
  const mapContinuous = mode === 'stem' && !!(beat.ring && nextBeat);
  const mapRingKm = CLAIM
    ? (mode === 'stem' ? ringAt(beat, position.t, CLAIM.km) : null) ?? CLAIM.km
    : 0;

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
          // The keyboard's shortcut past the stem: land on the last card and open the bowl.
          scrollToBeat(score.beats.length - 1, false);
          openExplore();
          return;
        }
      }
      // In a chapter with pins, the arrows walk the pins rather than the buildings:
      // nearest in that screen direction, from the open one or from the one nearest
      // the origin. Screen directions, in projectView's frame — y is positive UP.
      const visiblePins = pinsFor(chapterHotspots, view, null);
      if (visiblePins.length > 0) {
        const dirs: Record<string, [number, number]> = {
          ArrowRight: [1, 0],
          ArrowLeft: [-1, 0],
          ArrowUp: [0, 1],
          ArrowDown: [0, -1],
        };
        const dir = dirs[e.key];
        if (dir) {
          e.preventDefault();
          const from = openPin ? visiblePins.find((p) => p.id === openPin) : undefined;
          const next = from ? nearestPin(from, dir, visiblePins) : firstPin(visiblePins);
          if (next) setOpenPin(next.id);
          return;
        }
        if (e.key === 'Escape' && openPin) {
          setOpenPin(null);
          stage.current?.focus();
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
    [buildings, chapterHotspots, close, goToChapter, mode, openExplore, openPin, position.index, score, scrollToBeat, view],
  );

  return (
    <main
      ref={viewer}
      className={mode === 'stem' ? 'viewer is-stem' : 'viewer'}
      onScroll={onScroll}
    >
      <div className="topbar" ref={topbar}>
        <ViewHeader chapter={chapter} view={view} />
        <div className="controls">
          {pending && <span className="lod-status">loading full geometry…</span>}
          {chapter === 'present' && !mapReady && <span className="lod-status">loading the map…</span>}
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
            {/* Two renderers, one stage, BOTH mounted for the whole visit and shown one at a
                time. The diorama's valley and city are expensive to rebuild; the map's first
                load is the worker tessellating a hundred thousand extruded cells, which took
                long enough to see. So the map mounts at page load, hidden, and is warm by the
                time anyone reaches Present — Yan's call, 24 Sep 2026, over the plan's
                tear-it-down-on-leave. A second WebGL context all the time is the cost, and
                the exhibition screen can afford it. */}
            <div className={chapter === 'present' ? 'renderer is-hidden' : 'renderer'}>
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
              relief={RELIEF}
              backdrop={backdrop}
              heroIds={HERO_IDS}
              view={view}
              valley={VALLEY}
              reliefStyle={relief}
              beat={mode === 'stem' ? beat : null}
              interactive={mode === 'explore'}
              hotspots={visibleHotspots}
              pinCopy={pinCopy}
              openPin={openPin}
              onOpenPin={setOpenPin}
              warm={chapterViews}
              valleyTransport={chapter === 'futures'}
              valleyThreads={valleyThreads}
            />
            </div>
            {REGION && CLAIM && (
              <div className={chapter === 'present' ? 'renderer' : 'renderer is-hidden'}>
                <PresentMap
                  basemapUrl={MAP_URLS.basemap}
                  cellsUrl={MAP_URLS.cells}
                  levels={CELLS_META.levels}
                  origin={ORIGIN}
                  claimKm={CLAIM.km}
                  ringKm={mapRingKm}
                  pose={mapPose}
                  continuous={mapContinuous}
                  interactive={chapter === 'present' && mode === 'explore'}
                  labels={REGION.labels}
                  onPick={setMapPick}
                  onReady={() => setMapReady(true)}
                />
                {/* The cell under the pointer, beside it: a place, its people, its distance.
                    Yan, 24 Sep 2026 — it sat in the caption and nobody looked down there.
                    Flips to the pointer's left past the middle so it never leaves the box. */}
                {mode === 'explore' && mapPick && (
                  <div
                    className={mapPick.point[0] > (stage.current?.clientWidth ?? 0) / 2 ? 'cell-tip is-left' : 'cell-tip'}
                    style={{ left: mapPick.point[0], top: mapPick.point[1] }}
                    role="status"
                  >
                    <strong>
                      {pickedCities.length > 0
                        ? `${pickedCities[0].name}, ${pickedCities[0].country}`
                        : 'This cell'}
                    </strong>
                    <span>
                      {mapPick.people.toLocaleString()} people · {mapPick.distKm.toLocaleString()} km from Wat Ket
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {mode === 'stem' && chapter === 'present' && CLAIM && beat.ring && (() => {
          const km = ringAt(beat, position.t, CLAIM.km) ?? 0;
          const people = peopleWithin(CLAIM.curve, km);
          const share = people / WORLD_POPULATION.mid;
          return (
            <p className="ring-readout" aria-live="off">
              <span className="ring-readout-km">{Math.round(km).toLocaleString()} km</span>
              <span className="ring-readout-people">{(people / 1e9).toFixed(2)} bn</span>
              <span className="ring-readout-share">{(share * 100).toFixed(0)}% of everyone</span>
            </p>
          );
        })()}
        {mode === 'explore' && (
        <div className="view-caption" aria-live="polite">
          {view === 'circle' ? (
            <p>
              <strong>
                Half of everyone alive lives within about{' '}
                {CLAIM ? roundKm(CLAIM.km).toLocaleString() : '3,400'} km of here.
              </strong>{' '}
              <span>
                {CLAIM
                  ? `${Math.round(CLAIM.lowKm).toLocaleString()}–${Math.round(CLAIM.highKm).toLocaleString()} km for a world of 7.8–8.2 billion; the field stops 12,000 km out.`
                  : ''}
              </span>
            </p>
          ) : view === 'valley' ? (
            chapter === 'futures' ? (
              // The valley-as-futures: a place and a date, like the city's caption. The
              // method line belongs to the Past, where the relief is the subject.
              <p>Ping Valley, 2045.</p>
            ) : (
              <p>
                <strong>The valley the city grew in.</strong>{' '}
                <span>
                  120 km across, from Doi Inthanon to the Ping. Heights are exaggerated
                  four times, so the ground reads as ground.
                </span>
              </p>
            )
          ) : (
            <p>Wat Ket, 2045.</p>
          )}
        </div>
        )}
        {mode === 'explore' && (
          <Explore
            next={CHAPTERS[CHAPTERS.indexOf(chapter) + 1] ?? null}
            nextLabel={CHAPTER_TENSE[CHAPTERS[CHAPTERS.indexOf(chapter) + 1] ?? chapter]}
            onReread={reread}
            onNext={goToChapter}
            layers={chapter === 'past' ? THREAD_ORDER.map((id) => ({ id, label: THREADS[id].label })) : undefined}
            active={threadsOn}
            onToggle={toggleThread}
            views={chapterViews}
            view={view}
            onView={(v) => {
              setOpenPin(null);
              setView(resolveView(v, HAS_VIEWS));
            }}
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
            Map tiles from <a href="https://protomaps.com/">Protomaps</a> ©{' '}
            <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, ODbL.
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

      {mode === 'stem' && (
        <Scrolly
          beats={score.beats}
          copy={beatCopy}
          current={position.index}
          exploreLabel={`Explore the ${CHAPTER_TENSE[chapter]}`}
          onExplore={openExplore}
        />
      )}

      {debug && <TokenSwatches />}

    </main>
  );
}
