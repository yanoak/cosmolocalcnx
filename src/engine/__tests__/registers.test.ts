import { describe, expect, it } from 'vitest';
import { isometricFit, type Bounds, type Viewport } from '../camera';
import {
  DEFAULT_REGION_OUT,
  districtTransform,
  regionScale,
  registerState,
  smoothstep,
  stageFit,
  tToZoom,
  zoomLadder,
  zoomToT,
} from '../registers';

/** The committed extent — scripts/fetch-osm.ts DEFAULT_EXTENT. */
const WAT_KET: Bounds = [-500, -1600, 1000, 1100];

const PHONE: Viewport = { width: 390, height: 844 };
const LAPTOP: Viewport = { width: 1440, height: 900 };
const PROJECTOR: Viewport = { width: 2560, height: 1080 };

const VALERIEPIERIS_RADIUS_KM = 3437;

function ladderFor(viewport: Viewport, hasRegion = true) {
  return zoomLadder(isometricFit(WAT_KET, viewport).zoom, { hasRegion });
}

describe('zoomToT / tToZoom', () => {
  it('pins the district anchor at exactly 0.5, not approximately', () => {
    const ladder = ladderFor(LAPTOP);
    expect(zoomToT(ladder.district, ladder)).toBe(0.5);
    expect(tToZoom(0.5, ladder)).toBe(ladder.district);
  });

  it('pins the outer and inner ends at 0 and 1', () => {
    const ladder = ladderFor(LAPTOP);
    expect(zoomToT(ladder.region, ladder)).toBeCloseTo(0, 12);
    expect(zoomToT(ladder.block, ladder)).toBeCloseTo(1, 12);
  });

  it('is monotone across the whole ladder', () => {
    const ladder = ladderFor(LAPTOP);
    let previous = -1;
    for (let i = 0; i <= 200; i++) {
      const zoom = ladder.region * (ladder.block / ladder.region) ** (i / 200);
      const t = zoomToT(zoom, ladder);
      expect(t).toBeGreaterThanOrEqual(previous);
      previous = t;
    }
  });

  it('clamps rather than running off either end', () => {
    const ladder = ladderFor(LAPTOP);
    expect(zoomToT(ladder.region / 1000, ladder)).toBe(0);
    expect(zoomToT(ladder.block * 1000, ladder)).toBe(1);
    expect(zoomToT(0, ladder)).toBe(0);
  });

  it('round-trips t through zoom and back', () => {
    const ladder = ladderFor(LAPTOP);
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      expect(zoomToT(tToZoom(t, ladder), ladder)).toBeCloseTo(t, 12);
    }
  });

  it('never divides by zero on a degenerate ladder', () => {
    const flat = { region: 5, district: 5, block: 5, hasRegion: true };
    expect(Number.isFinite(zoomToT(5, flat))).toBe(true);
    expect(Number.isFinite(zoomToT(1, flat))).toBe(true);
  });
});

describe('regionScale', () => {
  /**
   * The property that would hold on a laptop and break silently at the venue.
   *
   * A square region and a rectangular district have the same constraining screen
   * axis under an isometric orthographic camera, so the ratio of their fits is
   * exactly regionOut on every aspect ratio.
   */
  it('sits the circle at exactly regionOut times the district, on every surface', () => {
    const k = regionScale(WAT_KET, VALERIEPIERIS_RADIUS_KM);

    for (const viewport of [PHONE, LAPTOP, PROJECTOR]) {
      const districtFit = isometricFit(WAT_KET, viewport).zoom;

      // The region disc, expressed in stage units, fitted the same way.
      const discStage = VALERIEPIERIS_RADIUS_KM * k * 2;
      const regionFit = isometricFit(
        [-discStage / 2, -discStage / 2, discStage / 2, discStage / 2],
        viewport,
      ).zoom;

      expect(districtFit / regionFit).toBeCloseTo(DEFAULT_REGION_OUT, 9);
    }
  });

  it('derives from the bounds rather than hard-coding Wat Ket', () => {
    const bigger = regionScale([-1000, -3200, 2000, 2200], VALERIEPIERIS_RADIUS_KM);
    const base = regionScale(WAT_KET, VALERIEPIERIS_RADIUS_KM);
    expect(bigger).toBeCloseTo(base * 2, 9);
  });

  it('survives a zero radius rather than emitting Infinity', () => {
    expect(Number.isFinite(regionScale(WAT_KET, 0))).toBe(true);
  });
});

describe('registerState', () => {
  const ladder = ladderFor(LAPTOP);

  it('has exactly one register fully opaque outside the handover band', () => {
    for (const t of [0, 0.1, 0.25, 0.5, 0.7, 0.9, 1]) {
      const s = registerState(tToZoom(t, ladder), ladder);
      if (s.railed) continue;
      const opaque = [s.regionOpacity, s.districtOpacity].filter((o) => o > 0.999);
      expect(opaque).toHaveLength(1);
    }
  });

  /** A frame with nothing in it looks, on a projector, exactly like a crash. */
  it('never shows a black frame inside the handover band', () => {
    for (let i = 0; i <= 400; i++) {
      const s = registerState(tToZoom(i / 400, ladder), ladder);
      expect(Math.max(s.regionOpacity, s.districtOpacity)).toBeGreaterThan(0.2);
    }
  });

  it('brings the region in before the district has gone', () => {
    // At the moment the district starts fading, the region must already be there.
    let sawOverlap = false;
    for (let i = 0; i <= 400; i++) {
      const s = registerState(tToZoom(i / 400, ladder), ladder);
      if (s.regionOpacity > 0.5 && s.districtOpacity > 0.5) sawOverlap = true;
    }
    expect(sawOverlap).toBe(true);
  });

  it('moves collapse monotonically from region to district', () => {
    let previous = Infinity;
    for (let i = 0; i <= 200; i++) {
      const s = registerState(tToZoom(i / 200, ladder), ladder);
      expect(s.collapse).toBeLessThanOrEqual(previous + 1e-12);
      previous = s.collapse;
    }
  });

  it('rails only strictly inside the band', () => {
    expect(registerState(tToZoom(0, ladder), ladder).railed).toBe(false);
    expect(registerState(tToZoom(0.5, ladder), ladder).railed).toBe(false);
    expect(registerState(tToZoom(1, ladder), ladder).railed).toBe(false);
    expect(registerState(tToZoom(0.36, ladder), ladder).railed).toBe(true);
  });

  it('names the register the chips should highlight', () => {
    expect(registerState(tToZoom(0, ladder), ladder).active).toBe('region');
    expect(registerState(tToZoom(0.5, ladder), ladder).active).toBe('district');
    expect(registerState(tToZoom(1, ladder), ladder).active).toBe('block');
  });

  it('ramps detail only in the district-to-block half', () => {
    expect(registerState(tToZoom(0.5, ladder), ladder).detail).toBe(0);
    expect(registerState(tToZoom(1, ladder), ladder).detail).toBe(1);
  });

  describe('a scene with no region raster', () => {
    const plain = ladderFor(LAPTOP, false);

    it('can never reach a register that has nothing in it', () => {
      for (let i = 0; i <= 100; i++) {
        expect(registerState(tToZoom(i / 100, plain), plain).active).not.toBe('region');
      }
    });

    it('keeps the district opaque and never rails', () => {
      for (let i = 0; i <= 100; i++) {
        const s = registerState(tToZoom(i / 100, plain), plain);
        expect(s.districtOpacity).toBe(1);
        expect(s.regionOpacity).toBe(0);
        expect(s.railed).toBe(false);
      }
    });

    it('degenerates minZoom to the original out-to-twice-the-district', () => {
      const districtFit = isometricFit(WAT_KET, LAPTOP).zoom;
      expect(plain.region).toBeCloseTo(districtFit * 0.5, 12);
    });
  });
});

describe('districtTransform', () => {
  const centre: [number, number] = [250, -250];
  const anchor: [number, number] = [-329.9, -597.3];
  const sigma = 0.002437;

  /** The guarantee that makes this safe to ship halfway through the week. */
  it('is the exact identity when no handover is happening', () => {
    const at0 = districtTransform(0, centre, anchor, sigma);
    expect(at0.scale).toBe(1);
    expect(at0.position).toEqual([centre[0], 0, centre[1]]);
  });

  it('lands exactly on the anchor when fully collapsed', () => {
    const at1 = districtTransform(1, centre, anchor, sigma);
    expect(at1.scale).toBeCloseTo(sigma, 12);
    expect(at1.position[0]).toBeCloseTo(anchor[0], 9);
    expect(at1.position[2]).toBeCloseTo(anchor[1], 9);
  });

  /** Linearly, the shrink would barely move and then vanish in a few frames. */
  it('interpolates scale in log space, so the zoom rate reads as constant', () => {
    const half = districtTransform(0.5, centre, anchor, sigma).scale;
    expect(half).toBeCloseTo(Math.sqrt(sigma), 9);
    // Emphatically not the arithmetic midpoint.
    expect(half).toBeLessThan((1 + sigma) / 2);
  });

  it('is genuinely a point by the time the district starts fading out', () => {
    // districtFadeFrom = 0.7.
    const scale = districtTransform(0.7, centre, anchor, sigma).scale;
    expect(scale * 2700).toBeLessThan(45); // stage units across, from a 2.7 km span
  });

  it('clamps rather than extrapolating past either end', () => {
    expect(districtTransform(-1, centre, anchor, sigma).scale).toBe(1);
    expect(districtTransform(2, centre, anchor, sigma).scale).toBeCloseTo(sigma, 12);
  });
});

describe('stageFit', () => {
  it('widens the frustum for the region without moving the camera', () => {
    const fit = isometricFit(WAT_KET, LAPTOP);
    const k = regionScale(WAT_KET, VALERIEPIERIS_RADIUS_KM);
    const staged = stageFit(WAT_KET, VALERIEPIERIS_RADIUS_KM * k, fit);

    expect(staged.position).toEqual(fit.position);
    expect(staged.target).toEqual(fit.target);
    expect(staged.zoom).toBe(fit.zoom);
    expect(staged.far).toBeGreaterThan(fit.far);
    expect(staged.near).toBeLessThan(fit.near);
  });

  it('leaves a region-less scene with the district frustum', () => {
    const fit = isometricFit(WAT_KET, LAPTOP);
    expect(stageFit(WAT_KET, 0, fit).far).toBe(fit.far);
  });
});

describe('smoothstep', () => {
  it('is pinned at both ends with zero derivative', () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
  });

  it('clamps outside the edges', () => {
    expect(smoothstep(0.2, 0.8, 0)).toBe(0);
    expect(smoothstep(0.2, 0.8, 1)).toBe(1);
  });

  it('survives a zero-width band', () => {
    expect(smoothstep(0.5, 0.5, 0.4)).toBe(0);
    expect(smoothstep(0.5, 0.5, 0.6)).toBe(1);
  });
});
