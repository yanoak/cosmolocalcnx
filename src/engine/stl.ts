/**
 * Triangle soup to binary STL.
 *
 * The other end of the pipeline from `merge.ts`: that one assembles geometry for a
 * GPU, this one assembles it for a slicer. Both read the same baseline document, and
 * neither knows about the other.
 *
 * Binary rather than ASCII, and not negotiable — the Wat Ket near set is around
 * 400,000 triangles, which is 20 MB binary and roughly 130 MB as text.
 *
 * ### The format, in full
 *
 * ```
 *   80 bytes   header. Free text, ignored by every reader, MUST NOT start "solid"
 *    4 bytes   uint32   triangle count
 *   per triangle, 50 bytes:
 *   12 bytes   3 × float32   facet normal
 *   36 bytes   9 × float32   three vertices, each x y z
 *    2 bytes   uint16        attribute byte count, always zero
 * ```
 *
 * Little-endian throughout. The "must not start solid" rule is real: an ASCII STL
 * begins with the word `solid`, so a binary file whose header happens to is misread
 * as text by a good half of the tools in the world.
 *
 * Everything here is pure and takes a plain array, so a print can be encoded and
 * checked in a test with no DOM, no GPU and no file system.
 */

/**
 * Positions only, nine floats per triangle, in millimetres.
 *
 * Deliberately not `bridges.ts`'s `TriSoup`, which carries normals and vertex colours
 * because three.js wants them per vertex. STL stores one normal per facet and no
 * colour at all, so carrying either here would be two arrays built to be thrown away.
 */
export interface PrintSoup {
  positions: number[];
}

export function emptySoup(): PrintSoup {
  return { positions: [] };
}

export function triangleCount(soup: PrintSoup): number {
  return Math.floor(soup.positions.length / 9);
}

/** Bytes an encoded soup will occupy, without encoding it. For the UI's estimate. */
export function stlByteLength(soup: PrintSoup): number {
  return 84 + triangleCount(soup) * 50;
}

export function appendSoup(into: PrintSoup, from: PrintSoup): void {
  // Chunked rather than `push(...from.positions)`: spreading a million-element array
  // into an argument list blows the call stack, and this runs on the whole city.
  const CHUNK = 8192;
  for (let i = 0; i < from.positions.length; i += CHUNK) {
    into.positions.push(...from.positions.slice(i, i + CHUNK));
  }
}

/**
 * One triangle, wound so that a-b-c is anticlockwise seen from outside the solid.
 *
 * The normal is computed at encode time from exactly that winding rather than taken
 * from the caller. Slicers disagree about which to trust when they conflict — and a
 * stored normal that contradicts the winding is the most common way a model arrives
 * "needing repair" — so there is only one source of truth here.
 */
export function pushTri(
  soup: PrintSoup,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): void {
  soup.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

/**
 * A quad a-b-c-d as two triangles, wound to agree with `outward`.
 *
 * Same trick as `bridges.ts`: ordering four corners consistently across six kinds of
 * face is fiddly and checking the result against a hint is not.
 */
export function pushQuad(
  soup: PrintSoup,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  d: readonly [number, number, number],
  outward: readonly [number, number, number],
): void {
  const [nx, ny, nz] = cross(a, b, c);
  if (nx * outward[0] + ny * outward[1] + nz * outward[2] >= 0) {
    pushTri(soup, a, b, c);
    pushTri(soup, a, c, d);
  } else {
    pushTri(soup, a, c, b);
    pushTri(soup, a, d, c);
  }
}

function cross(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): [number, number, number] {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const wx = c[0] - a[0];
  const wy = c[1] - a[1];
  const wz = c[2] - a[2];
  return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
}

/** Below this, a facet's two edges are parallel and its normal is noise. */
const DEGENERATE = 1e-12;

/**
 * Encode. Degenerate triangles are dropped rather than written with a NaN normal,
 * which is why the count is written after the loop rather than before it.
 *
 * A sliver from a clipped footprint is common — Sutherland–Hodgman leaves them along
 * the cut edge — and one NaN is enough for a slicer to reject the whole file.
 */
export function encodeBinaryStl(soup: PrintSoup, header = ''): ArrayBuffer {
  const tris = triangleCount(soup);
  const buffer = new ArrayBuffer(84 + tris * 50);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Truncated to 80 and never allowed to start "solid", or a binary file gets read
  // as ASCII. Non-ASCII is dropped rather than encoded: this is a fixed-width field,
  // and a multi-byte character would shift everything after it.
  const text = header.replace(/[^\x20-\x7e]/g, ' ').slice(0, 80);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  if (text.slice(0, 5).toLowerCase() === 'solid') bytes[0] = 0x2d; // '-'

  let at = 84;
  let written = 0;

  for (let t = 0; t < tris; t++) {
    const i = t * 9;
    const p = soup.positions;
    const a = [p[i], p[i + 1], p[i + 2]] as const;
    const b = [p[i + 3], p[i + 4], p[i + 5]] as const;
    const c = [p[i + 6], p[i + 7], p[i + 8]] as const;

    const [nx, ny, nz] = cross(a, b, c);
    const length = Math.hypot(nx, ny, nz);
    if (!(length > DEGENERATE)) continue; // NaN-safe: a NaN fails this too

    view.setFloat32(at, nx / length, true);
    view.setFloat32(at + 4, ny / length, true);
    view.setFloat32(at + 8, nz / length, true);

    for (let v = 0; v < 9; v++) {
      view.setFloat32(at + 12 + v * 4, p[i + v], true);
    }

    view.setUint16(at + 48, 0, true);
    at += 50;
    written++;
  }

  view.setUint32(80, written, true);

  // Dropping a degenerate leaves the tail unused; hand back only what was written.
  return written === tris ? buffer : buffer.slice(0, at);
}
