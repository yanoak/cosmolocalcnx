/**
 * A zip container, store-only, no dependency.
 *
 * A tiled print is twenty files — four tiles × (combined + four layers) — and handing
 * somebody twenty download clicks on install day is not a deliverable. This wraps
 * them in one.
 *
 * **Stored, not deflated, and that is the whole reason this is seventy lines rather
 * than a package.** Writing DEFLATE by hand would be daft; pulling in a zip library
 * for one internal route would be the first dependency this project has added that
 * the exhibition does not need. Binary STL compresses about 2:1, so the cost of
 * storing is a file roughly twice the size — on a laptop, over a cable, once.
 *
 * Only what is needed: local header, central directory, end-of-central-directory.
 * No zip64 (a print that exceeded 4 GB would have failed long before), no data
 * descriptors (sizes are known up front), no directory entries.
 *
 * Little-endian throughout, like STL, and pure, so the container's offsets can be
 * checked in a test rather than by unzipping something.
 */

export interface ZipEntry {
  /** Path inside the archive. Forward slashes, no leading slash. */
  name: string;
  data: Uint8Array;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
/** 2.0, which is what "no compression, no encryption" needs and no more. */
const VERSION = 20;

let crcTable: Uint32Array | null = null;

function table(): Uint32Array {
  if (crcTable) return crcTable;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  crcTable = t;
  return t;
}

/** CRC-32/ISO-HDLC, which is the one zip wants. */
export function crc32(data: Uint8Array): number {
  const t = table();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * MS-DOS date and time, which is what a zip header carries.
 *
 * Local time, two-second resolution, and the epoch is 1980 — none of which matters
 * here beyond the files not showing up dated 1980 in a file manager.
 */
function dosStamp(at: Date): { date: number; time: number } {
  const year = Math.max(1980, at.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1),
  };
}

export function zipStore(entries: ZipEntry[], at: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const names = entries.map((e) => encoder.encode(e.name));
  const { date, time } = dosStamp(at);
  const crcs = entries.map((e) => crc32(e.data));

  const localSize = entries.reduce((n, e, i) => n + 30 + names[i].length + e.data.length, 0);
  const centralSize = names.reduce((n, name) => n + 46 + name.length, 0);

  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  let at32 = 0;

  for (const [i, entry] of entries.entries()) {
    offsets.push(at32);
    view.setUint32(at32, LOCAL_SIG, true);
    view.setUint16(at32 + 4, VERSION, true);
    view.setUint16(at32 + 6, 0, true); // flags: none. Names are ASCII here.
    view.setUint16(at32 + 8, 0, true); // method 0 — stored
    view.setUint16(at32 + 10, time, true);
    view.setUint16(at32 + 12, date, true);
    view.setUint32(at32 + 14, crcs[i], true);
    view.setUint32(at32 + 18, entry.data.length, true); // compressed
    view.setUint32(at32 + 22, entry.data.length, true); // uncompressed — the same
    view.setUint16(at32 + 26, names[i].length, true);
    view.setUint16(at32 + 28, 0, true); // no extra field
    out.set(names[i], at32 + 30);
    out.set(entry.data, at32 + 30 + names[i].length);
    at32 += 30 + names[i].length + entry.data.length;
  }

  const centralStart = at32;

  for (const [i, entry] of entries.entries()) {
    view.setUint32(at32, CENTRAL_SIG, true);
    view.setUint16(at32 + 4, VERSION, true); // made by
    view.setUint16(at32 + 6, VERSION, true); // needed to extract
    view.setUint16(at32 + 8, 0, true);
    view.setUint16(at32 + 10, 0, true);
    view.setUint16(at32 + 12, time, true);
    view.setUint16(at32 + 14, date, true);
    view.setUint32(at32 + 16, crcs[i], true);
    view.setUint32(at32 + 20, entry.data.length, true);
    view.setUint32(at32 + 24, entry.data.length, true);
    view.setUint16(at32 + 28, names[i].length, true);
    view.setUint16(at32 + 30, 0, true); // extra
    view.setUint16(at32 + 32, 0, true); // comment
    view.setUint16(at32 + 34, 0, true); // disk number
    view.setUint16(at32 + 36, 0, true); // internal attributes
    view.setUint32(at32 + 38, 0, true); // external attributes
    view.setUint32(at32 + 42, offsets[i], true);
    out.set(names[i], at32 + 46);
    at32 += 46 + names[i].length;
  }

  view.setUint32(at32, EOCD_SIG, true);
  view.setUint16(at32 + 4, 0, true); // this disk
  view.setUint16(at32 + 6, 0, true); // disk with the central directory
  view.setUint16(at32 + 8, entries.length, true);
  view.setUint16(at32 + 10, entries.length, true);
  view.setUint32(at32 + 12, centralSize, true);
  view.setUint32(at32 + 16, centralStart, true);
  view.setUint16(at32 + 20, 0, true); // no archive comment

  return out;
}
