'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Diorama } from '@/engine/Diorama';
import { cellAt, citiesInCell, nearestCity, type City } from '@/engine/cities';
import type { RegisterId } from '@/engine/registers';
import { pickLabels } from '@/engine/cities';
import { TokenSwatches } from '@/engine/DebugOverlay';
import { SelectPanel, type Selection } from '@/engine/SelectPanel';
import { step } from '@/engine/ordering';
import { sceneBoundsMetres, validateScene, type SceneDocument } from '@/engine/scene';
import { BACKDROP_ASSETS } from '@/scenes/backdrop';
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

/** Where each register chip sits on the rail. registers.ts pins these exactly. */
const RAIL: Record<RegisterId, number> = { region: 0, district: 0.5, block: 1 };

/**
 * 2026 is an ON-RAMP, not a state you can select.
 *
 * The piece opens on the circle, descends to Wat Ket as it is now, and hands over
 * to the 2045 futures. The present does the job it was cut for doing — establishing
 * what is actually there — but the comparison control still holds only futures, so
 * the piece asks "which of these?" rather than "is this an improvement?".
 *
 * This is NOT the time slider cut on 12 Sep 2026. There are two discrete states and
 * one one-way transition between them; edits carry no date, no scene state is ever
 * partially applied, and scene.ts's FORBIDDEN_EDIT_FIELDS guard is untouched.
 * `era === 'now'` is literally "apply zero edits", which is what this file has
 * rendered since day one. Going back to 2026 happens only on an idle reset, never
 * by zooming out — that would make the rail a scrub, which IS the cut feature.
 *
 * Until roadmap item 3 lands there is one scenario with an empty edit list, so the
 * two eras render identically and only the caption changes. The machinery is here
 * so that item 3 is a rendering change and not an architectural one.
 */
type Era = 'now' | 'futures';

/** How long the diorama sits in 2026 before the futures take over. */
const ON_RAMP_HOLD_MS = 1100;

const REGISTER_LABELS: Record<RegisterId, string> = {
  region: 'Asia',
  district: 'Wat Ket',
  block: 'Street',
};
export default function Page() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locale, setLocale] = useState('en');
  const [debug, setDebug] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  const hasRegion = REGION !== null;
  const [active, setActive] = useState<RegisterId>(hasRegion ? 'region' : 'district');
  const [goTo, setGoTo] = useState<number | null>(null);
  const [era, setEra] = useState<Era>(hasRegion ? 'now' : 'futures');

  /**
   * The on-ramp. Also the attract loop's return path (roadmap item 6) — they are
   * the same journey, which is most of why this was affordable.
   */
  useEffect(() => {
    if (!hasRegion) return;
    const descend = window.setTimeout(() => setGoTo(RAIL.district), 700);
    return () => window.clearTimeout(descend);
  }, [hasRegion]);

  const onArrive = useCallback(() => {
    setGoTo(null);
    // A beat in 2026 before the futures take over, so the present registers as a
    // place rather than as a loading state.
    window.setTimeout(() => setEra((e) => (e === 'now' ? 'futures' : e)), ON_RAMP_HOLD_MS);
  }, []);

  /** Any deliberate input takes control: the visitor is driving, not watching. */
  const takeControl = useCallback(() => {
    setGoTo(null);
    setEra('futures');
  }, []);

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

  const jumpTo = useCallback((register: RegisterId) => {
    setEra('futures');
    setGoTo(RAIL[register]);
    if (register !== 'region') {
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
  const buildings = DOC.baseline.buildings;
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
      if (e.key === '1' && hasRegion) jumpTo('region');
      if (e.key === '2') jumpTo('district');
      if (e.key === '3') jumpTo('block');
    },
    [buildings, close, hasRegion, jumpTo],
  );

  return (
    <main className="viewer">
      <div className="topbar">
        <h1>Wat Ket 2045</h1>
        <div className="controls">
          {hasRegion && (
            <div className="registers" role="group" aria-label="Scale">
              {(['region', 'district', 'block'] as const).map((id, i) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active === id}
                  aria-keyshortcuts={String(i + 1)}
                  onClick={() => jumpTo(id)}
                >
                  {REGISTER_LABELS[id]}
                </button>
              ))}
            </div>
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
          onPointerDown={takeControl}
          onWheel={takeControl}
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
              backdrop={BACKDROP}
              heroIds={HERO_IDS}
              openAt={hasRegion ? 'region' : 'district'}
              goTo={goTo}
              onArrive={onArrive}
              onRegisterChange={setActive}
              onPickCell={onPickCell}
              highlight={pickedCell}
            />
          </div>
        </div>
        <div className="register-caption" aria-live="polite">
          {active === 'region' ? (
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
          ) : (
            <p>{era === 'now' ? 'Wat Ket, 2026.' : 'Wat Ket, 2045.'}</p>
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
