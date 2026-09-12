/**
 * Design tokens. See docs/design-system.md for where the palette comes from and why.
 *
 * Deliberately free of three.js and of the DOM: this is a pure module so it can be
 * unit-tested in node, and so the same tokens can feed CSS custom properties and
 * THREE.Color without either owning them.
 *
 * Nothing outside this file should name a raw colour. Reference a role.
 */

export type Hex = `#${string}`;

/** Layer 1 — raw palette, white-balanced from the 1967 PROGRESS cover. */
export const PALETTE = {
  'progress.green': '#375D51',
  'progress.yellow': '#ECD83B',
  'progress.rose': '#DA627A',
  'progress.blue': '#677FA2',
  'progress.ink': '#446DA7',
  'progress.paper': '#E4E0D6',
} as const satisfies Record<string, Hex>;

// ---------------------------------------------------------------- colour maths

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(rgb: [number, number, number]): Hex {
  const clamp = (c: number) => Math.max(0, Math.min(255, Math.round(c)));
  return `#${rgb.map((c) => clamp(c).toString(16).padStart(2, '0')).join('').toUpperCase()}` as Hex;
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

/** Shift a colour's lightness (and optionally saturation), preserving hue. */
export function shiftLightness(hex: string, dl: number, ds = 0): Hex {
  if (dl === 0 && ds === 0) return hex.toUpperCase() as Hex;
  const [h, s, l] = rgbToHsl(toRgb(hex));
  return toHex(
    hslToRgb([
      h,
      Math.max(0, Math.min(1, s + ds)),
      Math.max(0, Math.min(1, l + dl)),
    ]),
  );
}

/**
 * WCAG relative luminance and contrast ratio. Used to assert that text tokens are
 * readable, rather than trusting that they look fine on a developer's monitor.
 */
function luminance(hex: string): number {
  const channel = (c: number) => {
    const n = c / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = toRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ------------------------------------------------------------------ the ramp

export interface Ramp {
  /** Upward-facing surfaces. */
  top: Hex;
  /** The base colour — the token as authored. */
  side: Hex;
  /** Away-facing surfaces. */
  shade: Hex;
}

/**
 * Form comes from face orientation, not from lights. Materials are unlit, so a
 * token is literally the pixel it produces — which is what keeps the palette
 * adjustable in a predictable way. See docs/design-system.md.
 */
export function ramp(base: string): Ramp {
  return {
    top: shiftLightness(base, +0.1),
    side: base.toUpperCase() as Hex,
    shade: shiftLightness(base, -0.12, +0.04),
  };
}

// ------------------------------------------------------------------ layer 2

/**
 * Surface roles. The scene document names a `kind`; this maps kind to appearance,
 * which is why the theme is not part of the scene document.
 *
 * The stock/intervention split is the semantic work: everything on screen is 2045,
 * so the distinction that matters is the city that was already there against what a
 * scenario proposes.
 */
export const SURFACE_ROLES = {
  'building.stock': ramp(PALETTE['progress.yellow']),
  'building.intervention': ramp(PALETTE['progress.rose']),
  'building.civic': ramp(PALETTE['progress.green']),
  water: ramp(PALETTE['progress.blue']),
} as const satisfies Record<string, Ramp>;

/** Flat ground surfaces — no ramp, they are only ever seen from above. */
export const GROUND = {
  ground: shiftLightness(PALETTE['progress.paper'], -0.06),
  road: shiftLightness(PALETTE['progress.paper'], -0.16, -0.04),
} as const satisfies Record<string, Hex>;

/**
 * UI tokens are DERIVED DARKER from the palette, never taken from it. The raw values
 * fail contrast badly as text — the rose reaches 2.6:1 and the yellow 1.1:1 — and the
 * audience reads this standing in a bright mall on their own phone. A test enforces it.
 */
export const UI_TOKENS = {
  'ui.text': shiftLightness(PALETTE['progress.ink'], -0.26),
  'ui.text.muted': shiftLightness(PALETTE['progress.ink'], -0.14),
  'ui.accent': shiftLightness(PALETTE['progress.rose'], -0.18),
  'ui.focus': shiftLightness(PALETTE['progress.green'], -0.02),
} as const satisfies Record<string, Hex>;

/** Flattened to CSS custom properties, so the DOM and the canvas read one source. */
export function cssCustomProperties(): string {
  const entries: string[] = [];
  for (const [name, value] of Object.entries(PALETTE)) {
    entries.push(`  --${name.replace(/\./g, '-')}: ${value};`);
  }
  for (const [name, value] of Object.entries(UI_TOKENS)) {
    entries.push(`  --${name.replace(/\./g, '-')}: ${value};`);
  }
  for (const [name, value] of Object.entries(GROUND)) {
    entries.push(`  --${name}: ${value};`);
  }
  return `:root {\n${entries.join('\n')}\n}`;
}
