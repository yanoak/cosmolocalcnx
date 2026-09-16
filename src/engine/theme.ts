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

/**
 * Layer 1 — the Cosmo Local CNX brand palette, taken verbatim from the brand
 * concept. These are SPECIFIED values, not sampled ones: they are not rounded, not
 * white-balanced and not adjusted, because somebody else owns this system and the
 * exhibition has print and signage that must match the screen exactly.
 *
 * The brand weights them 55% purple, 15% lilac, 10% orange, 10% yellow, 10%
 * neutral. The role table below is where that weighting actually happens — the
 * building stock is the purple family because it is most of the scene, and orange
 * is reserved for the few things that should interrupt.
 */
export const PALETTE = {
  'cosmo.purple': '#2B184C',
  'cosmo.violet': '#6E4FD3',
  'cosmo.lilac': '#B7A7E8',
  'cosmo.orange': '#FF8A00',
  'cosmo.yellow': '#FFC72C',
  'cosmo.white': '#F7F4EE',
} as const satisfies Record<string, Hex>;

/** Secondary and neutral ranges. Used by roles, never referenced directly. */
export const PALETTE_EXTENDED = {
  'cosmo.deepViolet': '#4C2A8A',
  'cosmo.softLilac': '#DCCEF6',
  'cosmo.teal': '#038C84',
  'cosmo.skyBlue': '#6DB3E7',
  'cosmo.coral': '#FF7D6E',
  'cosmo.lime': '#A9D44A',
  'cosmo.charcoal': '#1F1F1F',
  'cosmo.slate': '#555B66',
  'cosmo.coolGray': '#A9AFB8',
  'cosmo.softGray': '#E4E7EB',
  'cosmo.offWhite': '#FCFAF6',
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
  // The inherited stock is most of the scene, so it carries the brand's dominant
  // family. Lilac rather than the full violet: 1,182 buildings at full saturation
  // is a wall, not a neighbourhood.
  'building.stock': ramp(PALETTE['cosmo.lilac']),
  // Orange is the brand's interrupt colour and interventions are the thing that
  // should interrupt. This is the one role a visitor must read without being told.
  'building.intervention': ramp(PALETTE['cosmo.orange']),
  'building.civic': ramp(PALETTE_EXTENDED['cosmo.teal']),
  water: ramp(PALETTE_EXTENDED['cosmo.skyBlue']),
} as const satisfies Record<string, Ramp>;

/** Flat ground surfaces — no ramp, they are only ever seen from above. */
export const GROUND = {
  /** Warm White, straight from the brand. The page behind it is Off White, so the
   *  diorama's ground reads as a surface laid on a page rather than as the page. */
  ground: PALETTE['cosmo.white'],
  road: shiftLightness(PALETTE['cosmo.white'], -0.1, +0.02),
  /** Parks, pitches and gardens. Pulled well off the brand's lime, which at full
   *  strength reads as highlighter rather than grass when laid flat. */
  green: shiftLightness(PALETTE_EXTENDED['cosmo.lime'], +0.16, -0.3),
} as const satisfies Record<string, Hex>;

/**
 * The street hierarchy, as tones on the ground rather than as geometry.
 *
 * Roads are drawn into a canvas texture, so their only visual variable besides
 * width is tone — which is why the hierarchy has to be legible here rather than in
 * a material. Wider and darker for the roads that carry the district's shape.
 */
export const ROAD_TONES = {
  major: shiftLightness(PALETTE['cosmo.white'], -0.2, +0.02),
  secondary: shiftLightness(PALETTE['cosmo.white'], -0.17, +0.02),
  street: shiftLightness(PALETTE['cosmo.white'], -0.14, +0.02),
  service: shiftLightness(PALETTE['cosmo.white'], -0.11, +0.02),
  path: shiftLightness(PALETTE['cosmo.white'], -0.08, +0.02),
} as const satisfies Record<string, Hex>;

export function roadTone(kind: string): Hex {
  return ROAD_TONES[kind as keyof typeof ROAD_TONES] ?? ROAD_TONES.street;
}

/**
 * Population density, as a sequential ramp.
 *
 * Sequential and light-to-dark, not a spectral or heat ramp: the quantity has a
 * natural direction and a rainbow would invent boundaries in it that the data does
 * not have. It starts at the district's own ground tone, so the two registers read
 * as one piece rather than as a map and a diorama that happen to share a screen —
 * the emptiest cell in Asia is exactly the colour of the ground in Wat Ket.
 *
 * The printed A0 in the same room uses a dark heat ramp. That is a different
 * artefact with a different background and the numbers are what have to agree
 * between them, not the colours.
 */
export const POPULATION_RAMP = [
  GROUND.ground,
  PALETTE['cosmo.lilac'],
  PALETTE['cosmo.violet'],
  PALETTE['cosmo.purple'],
  PALETTE['cosmo.orange'],
] as const satisfies readonly Hex[];

/** Blend two colours. `amount` is how far from `a` toward `b`. */
export function mix(a: string, b: string, amount: number): Hex {
  const t = amount < 0 ? 0 : amount > 1 ? 1 : amount;
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

/**
 * The same ramp, for the world OUTSIDE the circle.
 *
 * Every stop blended toward the ground, NOT lightened. Lightening overshoots at the
 * pale end — the lilac came out brighter than the ground itself, so sparse
 * population outside the circle read as a hole punched in the map. Blending toward
 * the ground cannot do that: it is monotone toward "empty" by construction.
 *
 * The same hues at lower contrast rather than a different scale, because the
 * outside is the same quantity measured the same way and separate colours would
 * imply otherwise. It recedes so the circle stays the subject, but a visitor
 * comparing the Ganges plain with the Rhine is comparing like with like.
 *
 * Derived from POPULATION_RAMP rather than written out, so the two cannot drift.
 */
export const POPULATION_RAMP_OUTSIDE = POPULATION_RAMP.map((stop) =>
  mix(stop, GROUND.ground, 0.55),
) as readonly Hex[];

/** Linear interpolation along a ramp. `t` outside [0,1] clamps to an end stop. */
export function sampleRamp(stops: readonly string[], t: number): [number, number, number] {
  if (stops.length === 0) return [0, 0, 0];
  if (stops.length === 1) return toRgb(stops[0]);
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  const scaled = u * (stops.length - 1);
  const lo = Math.min(Math.floor(scaled), stops.length - 2);
  const f = scaled - lo;
  const a = toRgb(stops[lo]);
  const b = toRgb(stops[lo + 1]);
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

/**
 * UI tokens are DERIVED DARKER from the palette, never taken from it. The raw values
 * fail contrast badly as text — the rose reaches 2.6:1 and the yellow 1.1:1 — and the
 * audience reads this standing in a bright mall on their own phone. A test enforces it.
 */
export const UI_TOKENS = {
  /** Cosmo Purple is already a text-weight colour; it needs no derivation. */
  'ui.text': PALETTE['cosmo.purple'],
  'ui.text.muted': PALETTE_EXTENDED['cosmo.slate'],
  /** Orange at full strength is 2.2:1 on Warm White — fine as a surface, illegible
   *  as text. Darkened until it clears 4.5:1, which is why this is derived. */
  'ui.accent': shiftLightness(PALETTE['cosmo.orange'], -0.24),
  'ui.focus': PALETTE['cosmo.violet'],
} as const satisfies Record<string, Hex>;

/** Flattened to CSS custom properties, so the DOM and the canvas read one source. */
export function cssCustomProperties(): string {
  const entries: string[] = [];
  for (const [name, value] of Object.entries({ ...PALETTE, ...PALETTE_EXTENDED })) {
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

/**
 * The scene document names a `kind`; this is the only place kind becomes colour.
 *
 * Unknown kinds fall back to stock rather than throwing: OSM supplies kinds nobody
 * anticipated, and a building in the wrong colour is recoverable where a scene that
 * refuses to render is not.
 */
const KIND_TO_ROLE: Record<string, keyof typeof SURFACE_ROLES> = {
  residential: 'building.stock',
  commercial: 'building.stock',
  retail: 'building.stock',
  industrial: 'building.stock',
  civic: 'building.civic',
  temple: 'building.civic',
  school: 'building.civic',
};

export function roleForKind(kind: string): Ramp {
  return SURFACE_ROLES[KIND_TO_ROLE[kind] ?? 'building.stock'];
}
