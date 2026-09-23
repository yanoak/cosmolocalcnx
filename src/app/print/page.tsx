'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  A1_MINI_BED_MM,
  buildModel,
  DEFAULT_PRINT_OPTIONS,
  LAYER_ORDER,
  mmPerMetreFromScale,
  printSummary,
  scaleDenominator,
  stlFilename,
  tileGrid,
  type LayerId,
  type PrintModel,
  type PrintOptions,
  type PrintSource,
} from '@/engine/print';
import { encodeBinaryStl, stlByteLength, triangleCount } from '@/engine/stl';
import { zipStore, type ZipEntry } from '@/engine/zip';
import viewer from '@/scenes/wat-ket.viewer.json';
import { PlanPreview } from './PlanPreview';
import './print.css';

/**
 * The print tool. Internal, and absent from the deployed site.
 *
 * `src/app/print/` is listed in `.vercelignore`, so the Vercel build never receives
 * this directory: `watket.vercel.app/print` is a 404, with no page, no chunk and
 * nothing to read. It works under `npm run dev` and in a locally built export, which
 * is the exhibition laptop — the machine that will actually be driving a printer.
 *
 * An `NEXT_PUBLIC_*` gate was the other option and is weaker: the page, its JavaScript
 * and a 4 MB scene import all still ship, and the gate is one line from being flipped
 * by anyone who opens the bundle. There is no server to hide behind — `output: 'export'`
 * — so absence is the only real form of hidden available.
 *
 * Everything numeric lives in `print.ts`, `stl.ts` and `zip.ts` and is unit-tested.
 * This file is a form over them.
 */

const SCENE_ID = 'wat-ket';

/**
 * The viewer document: the 7,588 buildings within 1,250 m, which is also the largest
 * crop worth printing at any sane scale. The full 68,704-building document is loaded
 * on demand — 19 MB, and only somebody deliberately printing the whole old city wants
 * to wait for it.
 */
const NEAR = (viewer as unknown as { baseline: PrintSource }).baseline;

type SourceId = 'near' | 'full';

export default function PrintPage() {
  const [options, setOptions] = useState<PrintOptions>(DEFAULT_PRINT_OPTIONS);
  const [sourceId, setSourceId] = useState<SourceId>('near');
  const [full, setFull] = useState<PrintSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [model, setModel] = useState<PrintModel | null>(null);
  const builtHeading = useRef<HTMLHeadingElement>(null);
  const takeFocus = useRef(false);
  const buildButton = useRef<HTMLButtonElement>(null);

  const source = sourceId === 'full' && full ? full : NEAR;
  const grid = useMemo(() => tileGrid(options), [options]);

  const set = useCallback(<K extends keyof PrintOptions>(key: K, value: PrintOptions[K]) => {
    // Any change invalidates what was built; leaving stale downloads on screen is how
    // the wrong plate gets printed.
    setModel(null);
    setOptions((o) => ({ ...o, [key]: value }));
  }, []);

  /**
   * What the crop would print like, before building it. The median is the number that
   * decides whether this is a city or a card, and it costs one sort.
   */
  const estimate = useMemo(() => {
    const [west, south, east, north] = grid.cropM;
    const heights = source.buildings
      .filter((b) => {
        const [x, y] = b.footprint[0] ?? [NaN, NaN];
        return x >= west && x <= east && y >= south && y <= north;
      })
      .map((b) => b.height * options.exaggeration * options.mmPerMetre)
      .sort((a, b) => a - b);
    return {
      buildings: heights.length,
      medianMm: heights.length ? heights[heights.length >> 1] : 0,
    };
  }, [source, grid, options]);

  const warnings = useMemo(() => {
    const list: string[] = [];
    if (grid.bedWidthMm > A1_MINI_BED_MM || grid.bedHeightMm > A1_MINI_BED_MM) {
      list.push(
        `A tile is ${Math.max(grid.bedWidthMm, grid.bedHeightMm).toFixed(1)} mm on the bed, ` +
          `over the A1 mini's ${A1_MINI_BED_MM} mm.`,
      );
    }
    if (estimate.medianMm < 0.4) {
      list.push(
        `The median building prints at ${estimate.medianMm.toFixed(2)} mm — under a 0.4 mm ` +
          `nozzle. Raise the exaggeration or the scale.`,
      );
    }
    if (options.exaggeration < 1) {
      list.push('Heights are being squashed, not exaggerated.');
    }
    if (grid.tiles.length > 9) {
      list.push(`${grid.tiles.length} plates is a lot of bed time.`);
    }
    if (sourceId === 'near' && Math.max(options.widthM, options.heightM) > 2500) {
      list.push('Past 2,500 m the near-geometry source runs out of buildings — switch source.');
    }
    return list;
  }, [grid, estimate, options, sourceId]);

  const pickSource = useCallback(async (id: SourceId) => {
    setModel(null);
    setSourceId(id);
    if (id !== 'full' || full) return;
    setLoading(true);
    // Only ever fetched on demand: a 19 MB import at module scope would be paid for
    // on every visit to this page, including the ones that print the default crop.
    const doc = await import('@/scenes/wat-ket.json');
    setFull((doc as unknown as { default: { baseline: PrintSource } }).default.baseline);
    setLoading(false);
  }, [full]);

  const build = useCallback(() => {
    setBuilding(true);
    takeFocus.current = true;
    // A frame for the button to repaint before a second of synchronous earcut.
    window.setTimeout(() => {
      setModel(buildModel(source, options));
      setBuilding(false);
    }, 16);
  }, [source, options]);

  /**
   * Focus moves to the stats once there are stats, so the triangle count and the
   * exaggeration are announced before the download buttons that follow them.
   *
   * Keyed on the model rather than scheduled after `setModel`: the heading does not
   * exist until React has committed the new state, and a `setTimeout(…, 0)` raced
   * that commit and focused nothing.
   */
  useEffect(() => {
    if (!model || !takeFocus.current) return;
    takeFocus.current = false;
    builtHeading.current?.focus();
  }, [model]);

  const clear = useCallback(() => {
    setModel(null);
    buildButton.current?.focus();
  }, []);

  const downloadAll = useCallback(() => {
    if (!model) return;
    const files: ZipEntry[] = [{ name: 'README.txt', data: text(printSummary(model, SCENE_ID)) }];
    for (const tile of model.tiles) {
      files.push({
        name: stlFilename(SCENE_ID, tile.tile, 'combined'),
        data: stl(model, tile.combined, tile.tile.key, 'combined'),
      });
      for (const id of LAYER_ORDER) {
        if (triangleCount(tile.layers[id]) === 0) continue;
        files.push({
          name: stlFilename(SCENE_ID, tile.tile, id),
          data: stl(model, tile.layers[id], tile.tile.key, id),
        });
      }
    }
    save(`${SCENE_ID}-print.zip`, zipStore(files), 'application/zip');
  }, [model]);

  const zipBytes = model
    ? model.tiles.reduce(
        (n, t) =>
          n +
          stlByteLength(t.combined) +
          LAYER_ORDER.reduce((m, id) => m + stlByteLength(t.layers[id]), 0),
        0,
      )
    : 0;

  return (
    <main
      className="print"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && model) clear();
      }}
    >
      <div className="print-head">
        <h1>Wat Ket — print</h1>
        <p className="note">
          Internal. Not on the public URL — this route is excluded from the Vercel build.
        </p>
      </div>

      <div className="print-body">
        <PlanPreview source={source} grid={grid} options={options} />

        <form
          className="print-form"
          // The browser's own constraint validation is off, and it has to be: `step`
          // is checked as `(value - min) % step`, in binary floating point, so a 2 mm
          // plate against `min=0.6 step=0.2` is a "step mismatch" — (2 − 0.6) / 0.2 is
          // 7.000000000000001 — and the form silently refuses to submit. Every field
          // here is a free measurement rather than a quantised one; `min` and `step`
          // stay for the spinner arrows, `Num` rejects anything under the minimum, and
          // the warnings list above the button is where real constraints are stated.
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            build();
          }}
        >
          <fieldset>
            <legend>Crop</legend>
            <Num
              label="Centre east"
              unit="m"
              value={options.centre[0]}
              onChange={(v) => set('centre', [v, options.centre[1]])}
            />
            <Num
              label="Centre north"
              unit="m"
              value={options.centre[1]}
              onChange={(v) => set('centre', [options.centre[0], v])}
            />
            <Num label="Width" unit="m" value={options.widthM} min={50} onChange={(v) => set('widthM', v)} />
            <Num label="Depth" unit="m" value={options.heightM} min={50} onChange={(v) => set('heightM', v)} />
            <div className="field">
              <label htmlFor="src">Source</label>
              <select
                id="src"
                value={sourceId}
                onChange={(e) => pickSource(e.target.value as SourceId)}
              >
                <option value="near">Near geometry (7,588)</option>
                <option value="full">Full district (68,704)</option>
              </select>
            </div>
            {loading && <p className="note">Loading the full document, 19 MB…</p>}
          </fieldset>

          <fieldset>
            <legend>Scale</legend>
            <Num
              label="Scale 1:"
              unit=""
              value={Math.round(scaleDenominator(options.mmPerMetre))}
              min={100}
              step={100}
              onChange={(v) => set('mmPerMetre', mmPerMetreFromScale(v))}
            />
            <Num
              label="Exaggeration"
              unit="×"
              value={options.exaggeration}
              min={0.1}
              step={0.5}
              onChange={(v) => set('exaggeration', v)}
            />
            <Num
              label="Max tile"
              unit="mm"
              value={options.maxTileMm}
              min={20}
              step={5}
              onChange={(v) => set('maxTileMm', v)}
            />
            <Num label="Plate" unit="mm" value={options.plateMm} min={0.6} step={0.2} onChange={(v) => set('plateMm', v)} />

            <dl className="derived">
              <dt>Model</dt>
              <dd>
                {grid.totalWidthMm.toFixed(0)} × {grid.totalHeightMm.toFixed(0)} mm
              </dd>
              <dt>Tiles</dt>
              <dd>
                {grid.cols} × {grid.rows}, {grid.bedWidthMm.toFixed(1)} ×{' '}
                {grid.bedHeightMm.toFixed(1)} mm on the bed
              </dd>
              <dt>Buildings</dt>
              <dd>
                {estimate.buildings.toLocaleString()}, median {estimate.medianMm.toFixed(2)} mm
              </dd>
            </dl>
          </fieldset>

          <fieldset>
            <legend>Layers</legend>
            {(['buildings', 'water', 'green', 'roads', 'bridges'] as const).map((id) => (
              <div className="field check" key={id}>
                <input
                  id={`layer-${id}`}
                  type="checkbox"
                  checked={options.layers[id]}
                  onChange={(e) => set('layers', { ...options.layers, [id]: e.target.checked })}
                />
                <label htmlFor={`layer-${id}`}>{id}</label>
              </div>
            ))}
            <Num
              label="Roads from"
              unit="m wide"
              value={options.roadMinWidthM}
              min={0}
              step={0.5}
              onChange={(v) => set('roadMinWidthM', v)}
            />
            <Num label="Raised" unit="mm" value={options.waterMm} min={0.2} step={0.2}
              onChange={(v) => setOptions((o) => ({ ...o, waterMm: v, greenMm: v, roadMm: v }))} />
          </fieldset>

          <fieldset>
            <legend>Interlocks</legend>
            <div className="field check">
              <input
                id="tabs"
                type="checkbox"
                checked={options.tabs !== null}
                onChange={(e) => set('tabs', e.target.checked ? DEFAULT_PRINT_OPTIONS.tabs : null)}
              />
              <label htmlFor="tabs">Tabs east and north, notches west and south</label>
            </div>
            {options.tabs && (
              <>
                <Num
                  label="Tab width"
                  unit="mm"
                  value={options.tabs.widthMm}
                  min={2}
                  onChange={(v) => set('tabs', { ...options.tabs!, widthMm: v })}
                />
                <Num
                  label="Tab depth"
                  unit="mm"
                  value={options.tabs.depthMm}
                  min={1}
                  onChange={(v) => set('tabs', { ...options.tabs!, depthMm: v })}
                />
                <Num
                  label="Clearance"
                  unit="mm"
                  value={options.tabs.clearanceMm}
                  min={0}
                  step={0.05}
                  onChange={(v) => set('tabs', { ...options.tabs!, clearanceMm: v })}
                />
              </>
            )}
          </fieldset>

          {warnings.length > 0 && (
            <ul className="warnings">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <button ref={buildButton} className="build" type="submit" disabled={building || loading}>
            {building ? 'Building…' : 'Build model'}
          </button>
        </form>
      </div>

      <section className="built">
        {!model ? (
          <p className="stats">Nothing built yet. The plan above is live.</p>
        ) : (
          <>
            <h2 ref={builtHeading} tabIndex={-1}>
              Built — {model.triangles.toLocaleString()} triangles, {mb(zipBytes)}
            </h2>
            <p className="stats">
              Tallest solid {model.tallestMm.toFixed(1)} mm · median building{' '}
              {model.medianBuildingMm.toFixed(2)} mm ·{' '}
              {model.belowNozzle.toLocaleString()} under a 0.4 mm nozzle · heights exaggerated{' '}
              {options.exaggeration}×. Escape clears.
            </p>

            {model.tiles.length === 0 || model.triangles === 0 ? (
              <p className="stats">No geometry in this crop.</p>
            ) : (
              <table className="tiles">
                <thead>
                  <tr>
                    <th>Tile</th>
                    <th>Triangles</th>
                    <th>Files</th>
                  </tr>
                </thead>
                <tbody>
                  {model.tiles.map((tile) => (
                    <tr key={tile.tile.key}>
                      <td>{tile.tile.key}</td>
                      <td className="count">{tile.triangles.toLocaleString()}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() =>
                            save(
                              stlFilename(SCENE_ID, tile.tile, 'combined'),
                              stl(model, tile.combined, tile.tile.key, 'combined'),
                              'model/stl',
                            )
                          }
                        >
                          combined
                        </button>
                        {LAYER_ORDER.filter((id) => triangleCount(tile.layers[id]) > 0).map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() =>
                              save(
                                stlFilename(SCENE_ID, tile.tile, id),
                                stl(model, tile.layers[id], tile.tile.key, id),
                                'model/stl',
                              )
                            }
                          >
                            {id}
                          </button>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <button className="download-all" type="button" onClick={downloadAll}>
              Download all as zip ({mb(zipBytes)})
            </button>
          </>
        )}
      </section>
    </main>
  );
}

function Num({
  label,
  unit,
  value,
  onChange,
  min,
  step = 1,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
}) {
  const id = `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <span>
        <input
          id={id}
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(e) => {
            const next = Number(e.target.value);
            // A half-typed number must not rebuild the grid with NaN in it.
            if (Number.isFinite(next) && (min === undefined || next >= min)) onChange(next);
          }}
        />{' '}
        <span className="unit">{unit}</span>
      </span>
    </div>
  );
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** The header carries the scale and the exaggeration into the file itself. */
function stl(
  model: PrintModel,
  soup: Parameters<typeof encodeBinaryStl>[0],
  tileKey: string,
  layer: LayerId | 'combined',
): Uint8Array {
  const header =
    `${SCENE_ID} ${tileKey} ${layer} 1:${Math.round(scaleDenominator(model.options.mmPerMetre))} ` +
    `z*${model.options.exaggeration} mm`;
  return new Uint8Array(encodeBinaryStl(soup, header));
}

function mb(bytes: number): string {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

function save(name: string, data: Uint8Array, type: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
