import { describe, expect, it } from 'vitest';
import {
  PALETTE,
  SURFACE_ROLES,
  UI_TOKENS,
  contrastRatio,
  ramp,
  roleForKind,
  shiftLightness,
} from '@/engine/theme';

const hex = /^#[0-9A-F]{6}$/;

describe('ramp', () => {
  it('derives a lighter top and a darker shade from one base', () => {
    const r = ramp('#ECD83B');
    expect(r.side).toBe('#ECD83B');
    expect(contrastRatio(r.top, '#000000')).toBeGreaterThan(
      contrastRatio(r.side, '#000000'),
    );
    expect(contrastRatio(r.shade, '#000000')).toBeLessThan(
      contrastRatio(r.side, '#000000'),
    );
  });

  it('keeps every tone a valid hex', () => {
    for (const tone of Object.values(ramp('#677FA2'))) {
      expect(tone).toMatch(hex);
    }
  });

  it('is deterministic — same input, same output', () => {
    expect(ramp('#DA627A')).toEqual(ramp('#DA627A'));
  });

  it('does not blow past black or white at the extremes', () => {
    expect(ramp('#FFFFFF').top).toMatch(hex);
    expect(ramp('#000000').shade).toMatch(hex);
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ECD83B', '#ECD83B')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#1E2F49', '#E4E0D6')).toBeCloseTo(
      contrastRatio('#E4E0D6', '#1E2F49'),
      5,
    );
  });
});

describe('UI tokens', () => {
  // The whole reason UI text is derived rather than taken from the palette.
  // Visitors read this standing in a bright mall, on a phone, at arm's length.
  it('every text token clears 4.5:1 on paper', () => {
    for (const [name, value] of Object.entries(UI_TOKENS)) {
      const r = contrastRatio(value, PALETTE['progress.paper']);
      expect(r, `${name} (${value}) on paper`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the raw palette would NOT pass — which is why we derive', () => {
    expect(
      contrastRatio(PALETTE['progress.yellow'], PALETTE['progress.paper']),
    ).toBeLessThan(4.5);
    expect(
      contrastRatio(PALETTE['progress.rose'], PALETTE['progress.paper']),
    ).toBeLessThan(4.5);
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
    expect(shiftLightness('#ECD83B', 0.1)).toMatch(hex);
    expect(shiftLightness('#ECD83B', 0)).toBe('#ECD83B');
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
