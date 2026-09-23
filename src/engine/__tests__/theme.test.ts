import { describe, expect, it } from 'vitest';
import {
  GROUND,
  PALETTE,
  SURFACE_ROLES,
  REGISTERS,
  UI_TOKENS,
  cssCustomProperties,
  contrastRatio,
  ramp,
  roleForKind,
  shiftLightness,
} from '@/engine/theme';

const hex = /^#[0-9A-F]{6}$/;

describe('ramp', () => {
  it('derives a lighter top and a darker shade from one base', () => {
    const r = ramp('#FFC72C');
    expect(r.side).toBe('#FFC72C');
    expect(contrastRatio(r.top, '#000000')).toBeGreaterThan(
      contrastRatio(r.side, '#000000'),
    );
    expect(contrastRatio(r.shade, '#000000')).toBeLessThan(
      contrastRatio(r.side, '#000000'),
    );
  });

  it('keeps every tone a valid hex', () => {
    for (const tone of Object.values(ramp('#6E4FD3'))) {
      expect(tone).toMatch(hex);
    }
  });

  it('is deterministic — same input, same output', () => {
    expect(ramp('#B7A7E8')).toEqual(ramp('#B7A7E8'));
  });

  it('does not blow past black or white at the extremes', () => {
    expect(ramp('#FFFFFF').top).toMatch(hex);
    expect(ramp('#000000').shade).toMatch(hex);
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFC72C', '#FFC72C')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#2B184C', '#F7F4EE')).toBeCloseTo(
      contrastRatio('#F7F4EE', '#2B184C'),
      5,
    );
  });
});

describe('UI tokens', () => {
  // The whole reason UI text is derived rather than taken from the palette.
  // Visitors read this standing in a bright mall, on a phone, at arm's length.
  it('every text token clears 4.5:1 on the ground', () => {
    for (const [name, value] of Object.entries(UI_TOKENS)) {
      const r = contrastRatio(value, GROUND.ground);
      expect(r, `${name} (${value}) on ground`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the raw brand accents would NOT pass — which is why the accent is derived', () => {
    // Orange and yellow are surface colours in this palette, never text colours.
    expect(contrastRatio(PALETTE['cosmo.orange'], GROUND.ground)).toBeLessThan(4.5);
    expect(contrastRatio(PALETTE['cosmo.yellow'], GROUND.ground)).toBeLessThan(4.5);
  });
});

describe('surface roles', () => {
  it('every role resolves to a three-tone ramp of valid hex', () => {
    for (const [role, tones] of Object.entries(SURFACE_ROLES)) {
      for (const [tone, value] of Object.entries(tones)) {
        expect(value, `${role}.${tone}`).toMatch(hex);
      }
    }
  });

  it('distinguishes inherited stock from proposed interventions', () => {
    expect(SURFACE_ROLES['building.stock'].side).not.toBe(
      SURFACE_ROLES['building.intervention'].side,
    );
  });
});

describe('shiftLightness', () => {
  it('preserves hue', () => {
    expect(shiftLightness('#FFC72C', 0.1)).toMatch(hex);
    expect(shiftLightness('#FFC72C', 0)).toBe('#FFC72C');
  });
});

describe('roleForKind', () => {
  it('maps inherited stock kinds to the stock ramp', () => {
    expect(roleForKind('residential')).toBe(SURFACE_ROLES['building.stock']);
    expect(roleForKind('commercial')).toBe(SURFACE_ROLES['building.stock']);
  });

  it('gives civic buildings their own colour', () => {
    expect(roleForKind('civic')).toBe(SURFACE_ROLES['building.civic']);
  });

  it('falls back to stock for an unknown kind rather than throwing', () => {
    // OSM will supply kinds nobody anticipated. A building rendering in the wrong
    // colour is recoverable; a scene that fails to render is not.
    expect(roleForKind('yurt')).toBe(SURFACE_ROLES['building.stock']);
  });
});

describe('registers', () => {
  // The printed panels use two registers and the token table used to have one.
  // See plans/2026-09-23_kv-design-system.plan.md.

  it('every register reads its ink on its own ground at body size', () => {
    for (const [name, r] of Object.entries(REGISTERS)) {
      expect(contrastRatio(r.ink, r.ground), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('every register reads its muted text at body size too', () => {
    for (const [name, r] of Object.entries(REGISTERS)) {
      expect(contrastRatio(r.muted, r.ground), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  // The one mistake this plan already made once: the panels set kickers at 80pt on
  // paper, which is not evidence that the colour works on a screen. Raw orange on the
  // light ground is 2.27:1 and fails at EVERY size, not only at body size.
  it('every register reads its kicker at body size', () => {
    for (const [name, r] of Object.entries(REGISTERS)) {
      expect(contrastRatio(r.kicker, r.ground), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the light register does NOT use the raw brand orange — it cannot', () => {
    expect(REGISTERS.page.kicker).not.toBe(PALETTE['cosmo.orange']);
    expect(
      contrastRatio(PALETTE['cosmo.orange'], REGISTERS.page.ground),
    ).toBeLessThan(3);
  });

  // The asymmetry that makes the split worth having: on purple the print value passes
  // outright, so the inverted panel carries the exact colour off the wall. If a palette
  // edit ever breaks that, it should break here.
  it('the inverted register carries the print orange unchanged', () => {
    expect(REGISTERS.invert.kicker).toBe(PALETTE['cosmo.orange']);
    expect(
      contrastRatio(REGISTERS.invert.kicker, REGISTERS.invert.ground),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps every register value a valid hex', () => {
    for (const r of Object.values(REGISTERS)) {
      for (const value of Object.values(r)) expect(value).toMatch(hex);
    }
  });

  it('emits both registers as custom properties', () => {
    const css = cssCustomProperties();
    for (const name of Object.keys(REGISTERS)) {
      for (const slot of ['ground', 'ink', 'kicker', 'muted']) {
        expect(css).toContain(`--register-${name}-${slot}:`);
      }
    }
  });
});
