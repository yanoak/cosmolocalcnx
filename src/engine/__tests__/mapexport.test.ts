import { describe, expect, it } from 'vitest';
import { isometricFit } from '@/engine/camera';
import { A4_LANDSCAPE_300, overlaySvg, pageProjection, pxForMm, pxForPt, toPage } from '@/engine/mapexport';

const H = 60000;
const fit = isometricFit([-H, -H, H, H], { width: A4_LANDSCAPE_300.widthPx, height: A4_LANDSCAPE_300.heightPx });
const p = pageProjection(fit, A4_LANDSCAPE_300);

describe('the page', () => {
  it('is half an A3 at 300 dpi, and converts millimetres and points', () => {
    expect(A4_LANDSCAPE_300.widthPx).toBe(3508);
    expect(A4_LANDSCAPE_300.heightPx).toBe(2480);
    expect(pxForMm(25.4, 300)).toBeCloseTo(300, 9);
    expect(pxForPt(72, 300)).toBeCloseTo(300, 9);
  });

  it('puts the fit\'s target at the centre of the page', () => {
    const [x, y] = toPage(p, 0, 0);
    expect(x).toBeCloseTo(A4_LANDSCAPE_300.widthPx / 2, 6);
    expect(y).toBeCloseTo(A4_LANDSCAPE_300.heightPx / 2, 6);
  });

  it('sends north up the page and south down it, in the fixed attitude — exactly as projectView says', () => {
    const [cx, cy] = toPage(p, 0, 0);
    const [nx, ny] = toPage(p, 0, 10000);
    const [ex, ey] = toPage(p, 10000, 0);
    // On the diagonal north runs up-right and east down-right; the page agrees with the
    // screen by construction, and this pins the y-flip rather than the compass.
    expect(ny).toBeLessThan(cy);
    expect(nx).toBeGreaterThan(cx);
    expect(ex).toBeGreaterThan(cx);
    expect(ey).toBeGreaterThan(cy);
    expect(nx).toBeCloseTo(ex, 6); // north-east is straight up the page
  });

  it('keeps the whole field on the page', () => {
    for (const [x, y] of [[-H, -H], [H, -H], [H, H], [-H, H]] as const) {
      const [px, py] = toPage(p, x, y);
      expect(px).toBeGreaterThanOrEqual(0);
      expect(px).toBeLessThanOrEqual(A4_LANDSCAPE_300.widthPx);
      expect(py).toBeGreaterThanOrEqual(0);
      expect(py).toBeLessThanOrEqual(A4_LANDSCAPE_300.heightPx);
    }
  });
});

describe('overlaySvg', () => {
  const sprite = { id: 'kae', chapter: 'futures' as const, file: '/icons/kae.webp', width: 900, height: 1024, anchor: [0.5, 1] as [number, number] };
  const svg = overlaySvg({
    projection: p,
    groups: [{ id: 'water', colour: '#6DB3E7', widthPx: 6, paths: [[[0, 0, 0], [1000, 1000, 0]]] }],
    pins: [
      { id: 'kae', label: 'KAE, Wiang Kum Kam', at: [-150, -4930], h: 0, sprite },
      { id: 'x', label: 'Fish & chips <north>', at: [0, 0], h: 0, sprite: undefined, labelSide: 'above' },
    ],
    iconMm: 14,
    labelPt: 8,
    labelColour: '#1F1F1F',
    labelFont: 'IBM Plex Sans Thai',
    basemapHref: 'valley-basemap.png',
  });

  it('is one page-sized SVG with the groups in draw order', () => {
    expect(svg).toMatch(/^<svg [^>]*width="3508" height="2480"/);
    const order = ['id="basemap"', 'id="water"', 'id="icons"', 'id="labels"'].map((s) => svg.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('places an icon on its ground anchor at the pin, at the asked size', () => {
    const m = svg.match(/<image id="icon-kae"[^>]*x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/);
    expect(m).not.toBeNull();
    const [, x, y, w, h] = m!.map(Number);
    const [px, py] = toPage(p, -150, -4930);
    expect(x + w / 2).toBeCloseTo(px, 1);
    expect(y + h).toBeCloseTo(py, 1);
    expect(h).toBeCloseTo(pxForMm(14, 300), 1);
  });

  it('writes every label as live text, escaped, above or below as asked', () => {
    expect(svg).toContain('>KAE, Wiang Kum Kam</text>');
    expect(svg).toContain('>Fish &amp; chips &lt;north&gt;</text>');
    const [, cy] = toPage(p, 0, 0);
    const above = Number(svg.match(/<text id="label-x" x="[^"]+" y="([^"]+)"/)![1]);
    expect(above).toBeLessThan(cy);
  });
});
