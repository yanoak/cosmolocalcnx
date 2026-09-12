import { describe, expect, it } from 'vitest';
import { isometricFit } from '../camera';
import type { Bounds } from '../camera';

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
