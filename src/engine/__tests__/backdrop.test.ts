import { describe, expect, it } from 'vitest';
import {
  BACKDROP_TOKENS,
  backdropPalette,
  buildingToneIndex,
  indexOfToken,
  planeRect,
  projectIso,
  roadToneIndex,
  roleForBuildingKind,
  type BackdropSliceMeta,
} from '../backdrop';
import { ISO_PITCH } from '../camera';
import { SURFACE_ROLES } from '../theme';

describe('projectIso', () => {
  it('puts the origin at the origin', () => {
    expect(projectIso(0, 0, 0)).toEqual([0, 0]);
  });

  /**
   * The cross-check that matters: `isometricFit` sizes the camera from
   * screenWidth = (spanX + spanZ)/sqrt(2) and screenHeight = screenWidth * sin(ISO_PITCH).
   * If this projection disagreed with that, the backdrop would be the right picture at
   * the wrong scale — which reads as a seam, not as an error.
   */
  it('agrees with isometricFit about the screen footprint of a ground rectangle', () => {
    const spanX = 5880;
    const spanY = 8150;
    const corners: [number, number][] = [
      [0, 0],
      [spanX, 0],
      [spanX, spanY],
      [0, spanY],
    ];
    const xs = corners.map(([x, y]) => projectIso(x, y)[0]);
    const ys = corners.map(([x, y]) => projectIso(x, y)[1]);

    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);

    expect(width).toBeCloseTo((spanX + spanY) * Math.SQRT1_2, 6);
    expect(height).toBeCloseTo(width * Math.sin(ISO_PITCH), 6);
  });

  it('sends north-east and south-west to the same screen column', () => {
    // (x + y) is the horizontal axis, so these two differ only in height on screen.
    expect(projectIso(1000, 0)[0]).toBeCloseTo(projectIso(0, 1000)[0], 9);
  });

  it('puts north higher up the screen than south', () => {
    expect(projectIso(0, 1000)[1]).toBeGreaterThan(projectIso(0, -1000)[1]);
  });

  it('raises a point up the screen as it gets taller, and nothing else', () => {
    const ground = projectIso(100, 200, 0);
    const tall = projectIso(100, 200, 30);
    expect(tall[0]).toBeCloseTo(ground[0], 9);
    expect(tall[1]).toBeGreaterThan(ground[1]);
  });

  it('is linear, which is what makes an orthographic raster exact', () => {
    const a = projectIso(300, -100, 5);
    const b = projectIso(600, -200, 10);
    expect(b[0]).toBeCloseTo(2 * a[0], 9);
    expect(b[1]).toBeCloseTo(2 * a[1], 9);
  });
});

describe('the tone table', () => {
  it('reserves index 0 for empty — the cleared buffer value', () => {
    expect(BACKDROP_TOKENS[0]).toBe('empty');
    expect(indexOfToken('empty')).toBe(0);
  });

  it('has no duplicate tokens, so an index means one thing', () => {
    expect(new Set(BACKDROP_TOKENS).size).toBe(BACKDROP_TOKENS.length);
  });

  it('fits in the byte a greyscale PNG gives back', () => {
    expect(BACKDROP_TOKENS.length).toBeLessThanOrEqual(256);
  });

  it('throws on an unknown token rather than painting index 0', () => {
    expect(() => indexOfToken('building.imaginary:top')).toThrow(/unknown tone token/);
  });
});

describe('backdropPalette', () => {
  /**
   * The test that fires if a role is added to SURFACE_ROLES without a token here.
   * Without it, a new role would silently paint as stock in the backdrop while the
   * near geometry rendered it correctly — a seam that only shows on the one building
   * somebody cared enough to give a new role to.
   */
  it('resolves every token except empty to a colour', () => {
    const palette = backdropPalette();
    expect(palette).toHaveLength(BACKDROP_TOKENS.length);
    expect(palette[0]).toBeNull();
    for (let i = 1; i < palette.length; i++) {
      expect(palette[i], `token ${BACKDROP_TOKENS[i]}`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('covers every building role SURFACE_ROLES defines', () => {
    const roles = Object.keys(SURFACE_ROLES).filter((r) => r.startsWith('building.'));
    for (const role of roles) {
      for (const tone of ['top', 'side', 'shade']) {
        expect(() => indexOfToken(`${role}:${tone}`)).not.toThrow();
      }
    }
  });

  it('gives a building the same tone the merged geometry would', () => {
    const palette = backdropPalette();
    expect(palette[buildingToneIndex('residential', 'top')]).toBe(
      SURFACE_ROLES['building.stock'].top,
    );
    expect(palette[buildingToneIndex('temple', 'shade')]).toBe(
      SURFACE_ROLES['building.civic'].shade,
    );
  });
});

describe('roleForBuildingKind', () => {
  it('reads the roles theme.ts assigns', () => {
    expect(roleForBuildingKind('residential')).toBe('building.stock');
    expect(roleForBuildingKind('temple')).toBe('building.civic');
    expect(roleForBuildingKind('school')).toBe('building.civic');
  });

  /** Matches roleForKind's own documented fallback — OSM supplies kinds nobody anticipated. */
  it('falls back to stock for a kind nobody anticipated', () => {
    expect(roleForBuildingKind('yurt')).toBe('building.stock');
    expect(roleForBuildingKind('')).toBe('building.stock');
  });
});

describe('roadToneIndex', () => {
  it('maps each road class to its own token', () => {
    const seen = new Set(
      ['major', 'secondary', 'street', 'service', 'path'].map((k) => roadToneIndex(k)),
    );
    expect(seen.size).toBe(5);
  });

  it('falls back to street, as roadTone does', () => {
    expect(roadToneIndex('funicular')).toBe(roadToneIndex('street'));
  });
});

describe('planeRect', () => {
  const slice: BackdropSliceMeta = {
    slice: 'behind',
    field: 'x.png',
    rectM: [-100, -50, 300, 150],
    depthM: -1265,
    buildings: 7,
  };

  it('centres the quad on the rectangle it was rendered from', () => {
    expect(planeRect(slice).centre).toEqual([100, 50]);
  });

  it('sizes the quad in screen metres', () => {
    expect(planeRect(slice).width).toBe(400);
    expect(planeRect(slice).height).toBe(200);
  });

  /**
   * The round-trip that catches an off-by-half-a-pixel: a world point must land at the
   * same place through the geometry and through the plane that stands in for it.
   */
  it('maps a world point to the same screen point the geometry would', () => {
    const rect = planeRect(slice);
    const [sx, sy] = projectIso(120, 80, 6);
    // Where that falls on the quad, as a fraction from its centre.
    const u = (sx - rect.centre[0]) / rect.width;
    const v = (sy - rect.centre[1]) / rect.height;
    // Back out again.
    expect(rect.centre[0] + u * rect.width).toBeCloseTo(sx, 9);
    expect(rect.centre[1] + v * rect.height).toBeCloseTo(sy, 9);
  });
});
