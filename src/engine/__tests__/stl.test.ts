import { describe, expect, it } from 'vitest';
import {
  appendSoup,
  emptySoup,
  encodeBinaryStl,
  pushQuad,
  pushTri,
  stlByteLength,
  triangleCount,
  type PrintSoup,
} from '../stl';

type V3 = [number, number, number];

/** A unit cube at the origin, every face wound anticlockwise seen from outside. */
function unitCube(): PrintSoup {
  const soup = emptySoup();
  const c: V3[] = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ];
  pushQuad(soup, c[4], c[5], c[6], c[7], [0, 0, 1]);
  pushQuad(soup, c[0], c[1], c[2], c[3], [0, 0, -1]);
  pushQuad(soup, c[0], c[1], c[5], c[4], [0, -1, 0]);
  pushQuad(soup, c[3], c[2], c[6], c[7], [0, 1, 0]);
  pushQuad(soup, c[0], c[3], c[7], c[4], [-1, 0, 0]);
  pushQuad(soup, c[1], c[2], c[6], c[5], [1, 0, 0]);
  return soup;
}

function facets(buffer: ArrayBuffer): { normal: V3; verts: V3[] }[] {
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  const out: { normal: V3; verts: V3[] }[] = [];
  for (let t = 0; t < count; t++) {
    const at = 84 + t * 50;
    const f = (o: number): V3 => [
      view.getFloat32(at + o, true),
      view.getFloat32(at + o + 4, true),
      view.getFloat32(at + o + 8, true),
    ];
    out.push({ normal: f(0), verts: [f(12), f(24), f(36)] });
  }
  return out;
}

describe('encodeBinaryStl', () => {
  it('writes a unit cube as twelve facets in 84 + 50n bytes', () => {
    const soup = unitCube();
    expect(triangleCount(soup)).toBe(12);

    const buffer = encodeBinaryStl(soup);
    expect(buffer.byteLength).toBe(84 + 12 * 50);
    expect(buffer.byteLength).toBe(stlByteLength(soup));
    expect(new DataView(buffer).getUint32(80, true)).toBe(12);
  });

  it('gives every cube face an axis-aligned outward normal', () => {
    const found = facets(encodeBinaryStl(unitCube())).map((f) =>
      f.normal.map((n) => Math.round(n)).join(','),
    );
    // Two triangles per face, six faces, each normal pointing away from the centre.
    for (const axis of ['1,0,0', '-1,0,0', '0,1,0', '0,-1,0', '0,0,1', '0,0,-1']) {
      expect(found.filter((n) => n === axis)).toHaveLength(2);
    }
  });

  it('takes the normal from the winding, not from the caller', () => {
    const up = emptySoup();
    pushTri(up, [0, 0, 0], [1, 0, 0], [0, 1, 0]);
    const down = emptySoup();
    pushTri(down, [0, 0, 0], [0, 1, 0], [1, 0, 0]);

    expect(facets(encodeBinaryStl(up))[0].normal).toEqual([0, 0, 1]);
    expect(facets(encodeBinaryStl(down))[0].normal).toEqual([0, 0, -1]);
  });

  it('drops a degenerate triangle rather than writing a NaN normal', () => {
    const soup = emptySoup();
    pushTri(soup, [0, 0, 0], [1, 0, 0], [0, 1, 0]);
    pushTri(soup, [5, 5, 0], [5, 5, 0], [5, 5, 0]); // zero area
    pushTri(soup, [0, 0, 0], [1, 0, 0], [2, 0, 0]); // collinear

    const buffer = encodeBinaryStl(soup);
    expect(new DataView(buffer).getUint32(80, true)).toBe(1);
    expect(buffer.byteLength).toBe(84 + 50);
    for (const f of facets(buffer)) {
      for (const n of f.normal) expect(Number.isNaN(n)).toBe(false);
    }
  });

  it('keeps the header to exactly 80 bytes, padded or truncated', () => {
    const short = new Uint8Array(encodeBinaryStl(unitCube(), 'wat-ket'));
    expect(String.fromCharCode(...short.slice(0, 7))).toBe('wat-ket');
    expect(short.slice(7, 80).every((b) => b === 0)).toBe(true);

    const long = encodeBinaryStl(unitCube(), 'x'.repeat(200));
    expect(new DataView(long).getUint32(80, true)).toBe(12);
  });

  it('never lets the header start with "solid", which would fake an ASCII file', () => {
    const bytes = new Uint8Array(encodeBinaryStl(unitCube(), 'solid wat-ket'));
    expect(String.fromCharCode(bytes[0])).not.toBe('s');
    expect(String.fromCharCode(...bytes.slice(0, 13))).toBe('-olid wat-ket');
  });

  it('keeps vertices exactly as given, in order', () => {
    const soup = emptySoup();
    pushTri(soup, [1.5, 2.5, 3.5], [4.5, 5.5, 6.5], [7.5, 8.5, 0.5]);
    expect(facets(encodeBinaryStl(soup))[0].verts).toEqual([
      [1.5, 2.5, 3.5],
      [4.5, 5.5, 6.5],
      [7.5, 8.5, 0.5],
    ]);
  });

  it('encodes an empty soup as a valid zero-triangle file', () => {
    const buffer = encodeBinaryStl(emptySoup());
    expect(buffer.byteLength).toBe(84);
    expect(new DataView(buffer).getUint32(80, true)).toBe(0);
  });
});

describe('appendSoup', () => {
  it('concatenates without losing or reordering vertices', () => {
    const a = emptySoup();
    pushTri(a, [0, 0, 0], [1, 0, 0], [0, 1, 0]);
    const b = emptySoup();
    pushTri(b, [0, 0, 1], [1, 0, 1], [0, 1, 1]);

    appendSoup(a, b);
    expect(triangleCount(a)).toBe(2);
    expect(a.positions.slice(9)).toEqual(b.positions);
  });

  it('survives a soup larger than the argument-list limit', () => {
    // The reason appendSoup chunks: `push(...positions)` throws on arrays this size.
    const big = emptySoup();
    for (let i = 0; i < 40_000; i++) pushTri(big, [i, 0, 0], [i + 1, 0, 0], [i, 1, 0]);

    const into = emptySoup();
    appendSoup(into, big);
    expect(triangleCount(into)).toBe(40_000);
  });
});
