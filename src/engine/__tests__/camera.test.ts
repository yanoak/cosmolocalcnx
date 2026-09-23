import { describe, expect, it } from 'vitest';
import { isometricFit } from '../camera';
import type { Bounds, Viewport } from '../camera';

/** The committed Wat Ket extent: 1.5 km east-west by 2.7 km north-south. */
const WAT_KET: Bounds = [-488, -1600, 1000, 1100];

const LAPTOP = { width: 1470, height: 690 };
const PHONE = { width: 390, height: 600 };
const PROJECTOR = { width: 1920, height: 1080 };

describe('isometricFit', () => {
  it('centres on the middle of the extent, with north as -Z', () => {
    const { target } = isometricFit(WAT_KET, LAPTOP);
    expect(target[0]).toBeCloseTo((-488 + 1000) / 2);
    expect(target[1]).toBe(0);
    expect(target[2]).toBeCloseTo(-(-1600 + 1100) / 2);
  });

  it('places the camera on the (1, 1, 1) diagonal from the target', () => {
    const { position, target } = isometricFit(WAT_KET, LAPTOP);
    const dx = position[0] - target[0];
    const dy = position[1] - target[1];
    const dz = position[2] - target[2];
    expect(dx).toBeCloseTo(dy);
    expect(dy).toBeCloseTo(dz);
    expect(dx).toBeGreaterThan(0);
  });

  it('fits the whole district on every surface', () => {
    for (const viewport of [LAPTOP, PHONE, PROJECTOR]) {
      const { zoom } = isometricFit(WAT_KET, viewport);
      const [west, south, east, north] = WAT_KET;
      const screenWidth = (east - west + (north - south)) * Math.SQRT1_2;
      const screenHeight = screenWidth * Math.sin(Math.atan(Math.SQRT1_2));

      // Everything must land inside the viewport, on both axes.
      expect(screenWidth * zoom).toBeLessThanOrEqual(viewport.width);
      expect(screenHeight * zoom).toBeLessThanOrEqual(viewport.height);
    }
  });

  it('touches at least one edge, so it fits tightly rather than receding', () => {
    for (const viewport of [LAPTOP, PHONE, PROJECTOR]) {
      const { zoom } = isometricFit(WAT_KET, viewport);
      const [west, south, east, north] = WAT_KET;
      const screenWidth = (east - west + (north - south)) * Math.SQRT1_2;
      const screenHeight = screenWidth * Math.sin(Math.atan(Math.SQRT1_2));
      const fill = Math.max(
        (screenWidth * zoom) / viewport.width,
        (screenHeight * zoom) / viewport.height,
      );
      expect(fill).toBeGreaterThan(0.85);
    }
  });

  it('zooms in when the viewport grows', () => {
    expect(isometricFit(WAT_KET, PROJECTOR).zoom).toBeGreaterThan(
      isometricFit(WAT_KET, PHONE).zoom,
    );
  });

  it('zooms out when the extent grows', () => {
    const wider: Bounds = [-2000, -4000, 3000, 3000];
    expect(isometricFit(wider, LAPTOP).zoom).toBeLessThan(isometricFit(WAT_KET, LAPTOP).zoom);
  });

  it('never emits a zero or negative zoom for a viewport still being laid out', () => {
    for (const viewport of [
      { width: 0, height: 0 },
      { width: 300, height: 0 },
      { width: Number.NaN, height: 100 },
    ]) {
      const { zoom } = isometricFit(WAT_KET, viewport);
      expect(Number.isFinite(zoom)).toBe(true);
      expect(zoom).toBeGreaterThan(0);
    }
  });

  it('survives a degenerate extent rather than dividing by zero', () => {
    const { zoom, near, far } = isometricFit([0, 0, 0, 0], LAPTOP);
    expect(Number.isFinite(zoom)).toBe(true);
    expect(near).toBeLessThan(0);
    expect(far).toBeGreaterThan(0);
  });

  it('puts the whole scene between near and far', () => {
    const { near, far, position, target } = isometricFit(WAT_KET, LAPTOP);
    const distance = Math.hypot(
      position[0] - target[0],
      position[1] - target[1],
      position[2] - target[2],
    );
    expect(far).toBeGreaterThan(distance);
    expect(near).toBeLessThan(-distance);
  });
});

// ---------------------------------------------------------------------------------
// Migrated from registers.test.ts on 24 Sep 2026, when that module was deleted. The
// circle's framing arithmetic is the part of it that was still true.

import {
  DEFAULT_REGION_OUT,
  REGION_MARGIN,
  circleFitZoom,
  poseBetween,
  regionScale,
  samePose,
  stageFit,
  type CameraPose,
} from '../camera';

/** The committed extent — scripts/fetch-osm.ts DEFAULT_EXTENT. */
const EXTENT: Bounds = [-500, -1600, 1000, 1100];
const PHONE_390: Viewport = { width: 390, height: 844 };
const LAPTOP_1440: Viewport = { width: 1440, height: 900 };
const PROJECTOR_2560: Viewport = { width: 2560, height: 1080 };
const RADIUS_KM = 3437;

describe('regionScale', () => {
  /**
   * The property that would hold on a laptop and break silently at the venue: a
   * square circle and a rectangular district have the same constraining screen axis
   * under an isometric orthographic camera, so the ratio of their fits is exactly
   * regionOut on every aspect ratio.
   */
  it('frames the circle PLUS its margin at exactly regionOut times the district, on every surface', () => {
    const k = regionScale(EXTENT, RADIUS_KM);
    for (const viewport of [PHONE_390, LAPTOP_1440, PROJECTOR_2560]) {
      const districtFit = isometricFit(EXTENT, viewport).zoom;
      const framedStage = RADIUS_KM * REGION_MARGIN * k * 2;
      const regionFit = isometricFit(
        [-framedStage / 2, -framedStage / 2, framedStage / 2, framedStage / 2],
        viewport,
      ).zoom;
      expect(districtFit / regionFit).toBeCloseTo(DEFAULT_REGION_OUT, 9);
    }
  });

  it('leaves room around the circle rather than letting it fill the frame', () => {
    expect(REGION_MARGIN).toBeGreaterThan(1);
    const k = regionScale(EXTENT, RADIUS_KM);
    const tight = regionScale(EXTENT, RADIUS_KM, DEFAULT_REGION_OUT, 1);
    expect(k).toBeLessThan(tight);
    expect(k * REGION_MARGIN).toBeCloseTo(tight, 9);
  });

  it('derives from the bounds rather than hard-coding Wat Ket', () => {
    const bigger = regionScale([-1000, -3200, 2000, 2200], RADIUS_KM);
    expect(bigger).toBeCloseTo(regionScale(EXTENT, RADIUS_KM) * 2, 9);
  });

  it('survives a zero radius rather than emitting Infinity', () => {
    expect(Number.isFinite(regionScale(EXTENT, 0))).toBe(true);
  });
});

describe('circleFitZoom', () => {
  it('is the district fit, regionOut times further out — what the ladder anchor was', () => {
    expect(circleFitZoom(80)).toBeCloseTo(80 / DEFAULT_REGION_OUT, 12);
    expect(circleFitZoom(80, 4)).toBe(20);
  });
  it('never divides by zero', () => {
    expect(Number.isFinite(circleFitZoom(80, 0))).toBe(true);
  });
});

describe('stageFit', () => {
  it('widens the frustum for the circle without moving the camera', () => {
    const fit = isometricFit(EXTENT, LAPTOP_1440);
    const k = regionScale(EXTENT, RADIUS_KM);
    const staged = stageFit(EXTENT, RADIUS_KM * k, fit);
    expect(staged.position).toEqual(fit.position);
    expect(staged.target).toEqual(fit.target);
    expect(staged.zoom).toBe(fit.zoom);
    expect(staged.far).toBeGreaterThan(fit.far);
    expect(staged.near).toBeLessThan(fit.near);
  });

  it('leaves a circle-less scene with the district frustum', () => {
    const fit = isometricFit(EXTENT, LAPTOP_1440);
    expect(stageFit(EXTENT, 0, fit).far).toBe(fit.far);
  });
});

describe('poseBetween', () => {
  const a: CameraPose = { view: 'circle', zoom: 10, target: [0, 0, 0] };
  const b: CameraPose = { view: 'city', zoom: 160, target: [100, 0, -50] };

  it('is pinned at both ends', () => {
    expect(poseBetween(a, b, 0)).toEqual(a.view === b.view ? a : { ...a, view: b.view });
    expect(poseBetween(a, b, 1)).toEqual(b);
  });

  it('interpolates zoom in log space, so halfway is the geometric mean', () => {
    expect(poseBetween(a, b, 0.5).zoom).toBeCloseTo(40, 9);
  });

  it('interpolates the target linearly', () => {
    expect(poseBetween(a, b, 0.5).target).toEqual([50, 0, -25]);
  });

  /** The invariant the rail removal bought: a pose's view is named, never derived. */
  it('carries the destination view throughout — there is no half a view', () => {
    for (const u of [0, 0.01, 0.5, 0.99, 1]) expect(poseBetween(a, b, u).view).toBe('city');
  });

  it('clamps outside [0, 1]', () => {
    expect(poseBetween(a, b, -1).zoom).toBe(a.zoom);
    expect(poseBetween(a, b, 2).zoom).toBe(b.zoom);
  });
});

describe('samePose', () => {
  it('compares by value, so a re-rendered but unchanged pose does not move the camera', () => {
    const p: CameraPose = { view: 'city', zoom: 3, target: [1, 2, 3] };
    expect(samePose(p, { ...p, target: [1, 2, 3] })).toBe(true);
    expect(samePose(p, { ...p, zoom: 4 })).toBe(false);
    expect(samePose(p, { ...p, view: 'valley' })).toBe(false);
  });
});
