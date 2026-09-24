import iconsJson from '@/content/icons.json';
import type { ChapterId } from '@/engine/views';

/**
 * The sprite registry: a hotspot's `icon` id resolves to a committed asset here and nowhere
 * else. The assets are generated (see `plans/2026-09-24_pin-icons.plan.md`), keyed out,
 * trimmed and written by `scripts/keep-icons.py`, which also writes the sidecar this file
 * reads — so a sprite's size and ground anchor are measured, never typed.
 *
 * The anchor is where the isometric base meets the map, as a fraction of the image. Every
 * sprite is drawn with that point on the hotspot's position; nothing else about placement
 * is the sprite's business.
 */
export interface IconSprite {
  id: string;
  chapter: ChapterId;
  /** URL path under `public/`. */
  file: string;
  width: number;
  height: number;
  /** Ground point as a fraction of width and height: `[0.5, 1]` is bottom-centre. */
  anchor: [number, number];
}

interface IconsSidecar {
  size: number;
  icons: Array<Omit<IconSprite, 'anchor'> & { anchor: number[] }>;
}

const sidecar = iconsJson as IconsSidecar;

/** The long edge the sprites were written at, in pixels. */
export const ICON_SIZE = sidecar.size;

export const ICONS: ReadonlyMap<string, IconSprite> = new Map(
  sidecar.icons.map((s) => [s.id, { ...s, anchor: [s.anchor[0], s.anchor[1]] as [number, number] }]),
);

export const ICON_IDS: readonly string[] = [...ICONS.keys()];

/** The sprite for an icon id, or undefined — a plain node is drawn instead. */
export function iconFor(id: string | undefined): IconSprite | undefined {
  return id === undefined ? undefined : ICONS.get(id);
}

/**
 * Every icon a set of hotspots names must exist. Returns one message per missing icon,
 * empty when the join is complete — the same shape as `validateScore` and `validateCopyJoin`.
 */
export function validateIconJoin(hotspots: ReadonlyArray<{ id: string; icon?: string }>): string[] {
  const out: string[] = [];
  for (const h of hotspots) {
    if (h.icon !== undefined && !ICONS.has(h.icon)) {
      out.push(`hotspot ${h.id} names icon "${h.icon}", which is not in the registry`);
    }
  }
  return out;
}
