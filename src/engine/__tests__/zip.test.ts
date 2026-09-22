import { describe, expect, it } from 'vitest';
import { crc32, zipStore, type ZipEntry } from '../zip';

const text = (s: string) => new TextEncoder().encode(s);

/** Reads the container back the way an unzipper would: EOCD first, then the index. */
function readArchive(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);

  const count = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralStart = view.getUint32(eocd + 16, true);
  expect(centralStart + centralSize).toBe(eocd);

  const files: { name: string; crc: number; size: number; data: Uint8Array }[] = [];
  let at = centralStart;
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));

    // Follow the pointer into the local header and confirm it agrees.
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    expect(view.getUint16(offset + 8, true)).toBe(0); // stored
    expect(view.getUint32(offset + 14, true)).toBe(crc);
    const localNameLength = view.getUint16(offset + 26, true);
    const extra = view.getUint16(offset + 28, true);
    const start = offset + 30 + localNameLength + extra;

    files.push({ name, crc, size, data: zip.subarray(start, start + size) });
    at += 46 + nameLength;
  }
  return files;
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    // CRC-32/ISO-HDLC's published check: "123456789" is 0xCBF43926.
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for empty input and unsigned for everything else', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(text('a'))).toBe(0xe8b7be43);
    expect(crc32(new Uint8Array([0xff, 0xff, 0xff, 0xff]))).toBeGreaterThanOrEqual(0);
  });
});

describe('zipStore', () => {
  const entries: ZipEntry[] = [
    { name: 'r1c1_combined.stl', data: text('first file') },
    { name: 'r1c2_buildings.stl', data: new Uint8Array([0, 1, 2, 250, 251, 255]) },
    { name: 'README.txt', data: text('scale 1:7143\n') },
  ];

  it('round-trips every entry with its name, size and payload intact', () => {
    const files = readArchive(zipStore(entries));
    expect(files.map((f) => f.name)).toEqual(entries.map((e) => e.name));
    for (const [i, file] of files.entries()) {
      expect(file.size).toBe(entries[i].data.length);
      expect([...file.data]).toEqual([...entries[i].data]);
    }
  });

  it('records a CRC that matches each payload', () => {
    for (const file of readArchive(zipStore(entries))) {
      expect(file.crc).toBe(crc32(file.data));
    }
  });

  it('puts the central directory exactly after the last local record', () => {
    const zip = zipStore(entries);
    const local = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(zip.length - 22 + 16, true)).toBe(local);
  });

  it('writes a valid empty archive', () => {
    const zip = zipStore([]);
    expect(zip.length).toBe(22);
    expect(readArchive(zip)).toEqual([]);
  });

  it('stamps a DOS date that survives the 1980 epoch', () => {
    const zip = zipStore([entries[0]], new Date(2026, 8, 22, 14, 30, 8));
    const view = new DataView(zip.buffer);
    const date = view.getUint16(12, true);
    expect(date >> 9).toBe(2026 - 1980);
    expect((date >> 5) & 0xf).toBe(9);
    expect(date & 0x1f).toBe(22);
  });
});
