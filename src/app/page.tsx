'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Diorama } from '@/engine/Diorama';
import { TokenSwatches } from '@/engine/DebugOverlay';
import { SelectPanel, type Selection } from '@/engine/SelectPanel';
import { step } from '@/engine/ordering';
import { sceneBoundsMetres, validateScene, type SceneDocument } from '@/engine/scene';
import scene from '@/scenes/wat-ket.json';

const DOC = scene as unknown as SceneDocument;

/**
 * Day one renders `baseline` alone, which is a DEVELOPMENT view.
 *
 * The viewer ships showing 2045 scenarios and nothing else — there is no "today"
 * state a visitor can select. Do not let this path harden into one. Scenario
 * switching is roadmap item 3. See "Futures only" in docs/architecture.md.
 */
export default function Page() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locale, setLocale] = useState('en');
  const [debug, setDebug] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

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
    },
    [buildings, close],
  );

  return (
    <main className="viewer">
      <div className="topbar">
        <h1>Wat Ket 2045</h1>
        <div className="controls">
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
            />
          </div>
        </div>
        <SelectPanel selection={selection} locale={locale} onClose={close} />
      </div>

      {debug && <TokenSwatches />}

      {/* Two sources, two licences, and both require attribution to be VISIBLE —
          OSM under ODbL, and the Wat Ket tambon boundary under CC BY-IGO. A few
          lines of JSX, easy to forget until someone asks. See the licensing table
          in README.md. */}
      <p className="attribution">
        Building footprints and street data ©{' '}
        <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, ODbL.
        District boundary from{' '}
        <a href="https://data.humdata.org/dataset/cod-ab-tha">
          OCHA Thailand administrative boundaries
        </a>
        , CC BY-IGO.
      </p>
    </main>
  );
}
