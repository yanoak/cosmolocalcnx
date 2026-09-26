import { describe, expect, it } from 'vitest';
import {
  CAMERA_PITCH,
  CAMERA_YAW,
  groundDepth,
  isometricFit,
  projectView,
  rightness,
  screenBasis,
  screenFootprint,
  wallFacesCamera,
} from '../camera';
import type { Bounds, Viewport } from '../camera';

const dot = (a: readonly number[], b: readonly number[]) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('the attitude', () => {
  it('is the diagonal isometric: camera south-east of its target, north running up-left', () => {
    expect(CAMERA_YAW).toBeCloseTo(Math.PI / 4, 12);
    expect(CAMERA_PITCH).toBeCloseTo(Math.atan(Math.SQRT1_2), 12);
    const { groundTrack, towards } = screenBasis();
    expect(groundTrack[0]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(groundTrack[1]).toBeCloseTo(-Math.SQRT1_2, 12);
    const s = 1 / Math.sqrt(3);
    expect(towards[0]).toBeCloseTo(s, 12);
    expect(towards[1]).toBeCloseTo(s, 12);
    expect(towards[2]).toBeCloseTo(s, 12);
  });

  it('is pitched down, not level and not straight down', () => {
    expect(CAMERA_PITCH).toBeGreaterThan(0);
    expect(CAMERA_PITCH).toBeLessThan(Math.PI / 2);
  });
});

describe('screenBasis', () => {
  it('is orthonormal for any yaw and pitch', () => {
    for (const yaw of [0, 0.3, Math.PI / 4, 2]) {
      for (const pitch of [0.2, Math.atan(Math.SQRT1_2), Math.PI / 4, 1.2]) {
        const { right, up, towards } = screenBasis(yaw, pitch);
        for (const v of [right, up, towards]) expect(Math.hypot(...v)).toBeCloseTo(1, 12);
        expect(dot(right, up)).toBeCloseTo(0, 12);
        expect(dot(right, towards)).toBeCloseTo(0, 12);
        expect(dot(up, towards)).toBeCloseTo(0, 12);
      }
    }
  });

  it('keeps screen-up pointing up and screen-right horizontal', () => {
    const { right, up } = screenBasis();
    expect(up[1]).toBeGreaterThan(0);
    expect(right[1]).toBe(0);
  });

  /** The old diagonal, as a regression: yaw π/4 at the isometric pitch is (1, 1, 1)/√3. */
  it('reproduces the (1, 1, 1) diagonal at yaw π/4 and the isometric pitch', () => {
    const { towards, right, up } = screenBasis(Math.PI / 4, Math.atan(Math.SQRT1_2));
    const s = 1 / Math.sqrt(3);
    expect(towards.map((v) => +v.toFixed(9))).toEqual([s, s, s].map((v) => +v.toFixed(9)));
    expect(right.map((v) => +v.toFixed(9))).toEqual([Math.SQRT1_2, 0, -Math.SQRT1_2].map((v) => +v.toFixed(9)));
    expect(up.map((v) => +v.toFixed(9))).toEqual([-1, 2, -1].map((v) => +(v / Math.sqrt(6)).toFixed(9)));
  });
});

describe('projectView', () => {
  it('puts the origin at the origin', () => {
    expect(projectView(0, 0, 0)).toEqual([0, 0]);
  });

  it('sends north-east and south-west to the same screen column', () => {
    // On the diagonal (x + y) is the horizontal axis, so these differ only in height.
    expect(projectView(1000, 0)[0]).toBeCloseTo(projectView(0, 1000)[0], 9);
  });

  it('puts north higher up the screen than south, and east to the right of west', () => {
    expect(projectView(0, 1000)[1]).toBeGreaterThan(projectView(0, -1000)[1]);
    expect(projectView(1000, 0)[0]).toBeGreaterThan(projectView(-1000, 0)[0]);
  });

  it('reproduces the hand-written isometric projection', () => {
    const [sx, sy] = projectView(300, -100, 5);
    expect(sx).toBeCloseTo((300 - 100) * Math.SQRT1_2, 9);
    expect(sy).toBeCloseTo((-100 - 300 + 2 * 5) / Math.sqrt(6), 9);
  });

  it('raises a point straight up the screen as it gets taller, by cos(pitch)', () => {
    const ground = projectView(100, 200, 0);
    const tall = projectView(100, 200, 30);
    expect(tall[0]).toBeCloseTo(ground[0], 9);
    expect(tall[1] - ground[1]).toBeCloseTo(30 * Math.cos(CAMERA_PITCH), 9);
  });

  it('is linear, which is what makes an orthographic raster exact', () => {
    const a = projectView(300, -100, 5);
    const b = projectView(600, -200, 10);
    expect(b[0]).toBeCloseTo(2 * a[0], 9);
    expect(b[1]).toBeCloseTo(2 * a[1], 9);
  });
});

describe('groundDepth and wallFacesCamera', () => {
  it('grows toward the camera — south-east, on the diagonal', () => {
    expect(groundDepth(100, -100)).toBeCloseTo(100 * Math.SQRT2, 9);
    expect(groundDepth(-100, 100)).toBeCloseTo(-100 * Math.SQRT2, 9);
    expect(groundDepth(100, 100)).toBeCloseTo(0, 9);
  });

  it('east- and south-facing walls face the camera; north- and west-facing do not', () => {
    expect(wallFacesCamera(1, 0)).toBe(true);
    expect(wallFacesCamera(0, -1)).toBe(true);
    expect(wallFacesCamera(0, 1)).toBe(false);
    expect(wallFacesCamera(-1, 0)).toBe(false);
  });

  it('rightness is positive for the east wall and negative for the south wall', () => {
    expect(rightness(1, 0, 0)).toBeCloseTo(Math.SQRT1_2, 12);
    expect(rightness(0, 0, 1)).toBeCloseTo(-Math.SQRT1_2, 12);
  });
});

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

  it('places the camera along the attitude\'s towards vector — the (1, 1, 1) diagonal', () => {
    const { position, target } = isometricFit(WAT_KET, LAPTOP);
    const d = [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
    const len = Math.hypot(...d);
    const { towards } = screenBasis();
    expect(d[0] / len).toBeCloseTo(towards[0], 9);
    expect(d[1] / len).toBeCloseTo(towards[1], 9);
    expect(d[2] / len).toBeCloseTo(towards[2], 9);
    expect(d[0]).toBeCloseTo(d[1], 6);
    expect(d[1]).toBeCloseTo(d[2], 6);
    expect(d[0]).toBeGreaterThan(0);
  });

  it('projects a ground rectangle to the isometric footprint', () => {
    const [west, south, east, north] = WAT_KET;
    const { width, height } = screenFootprint(WAT_KET);
    expect(width).toBeCloseTo((east - west + (north - south)) * Math.SQRT1_2, 9);
    expect(height).toBeCloseTo(width * Math.sin(CAMERA_PITCH), 9);
  });

  it('fits the whole district on every surface', () => {
    for (const viewport of [LAPTOP, PHONE, PROJECTOR]) {
      const { zoom } = isometricFit(WAT_KET, viewport);
      const { width: screenWidth, height: screenHeight } = screenFootprint(WAT_KET);

      // Everything must land inside the viewport, on both axes.
      expect(screenWidth * zoom).toBeLessThanOrEqual(viewport.width);
      expect(screenHeight * zoom).toBeLessThanOrEqual(viewport.height);
    }
  });

  it('touches at least one edge, so it fits tightly rather than receding', () => {
    for (const viewport of [LAPTOP, PHONE, PROJECTOR]) {
      const { zoom } = isometricFit(WAT_KET, viewport);
      const { width: screenWidth, height: screenHeight } = screenFootprint(WAT_KET);
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

import { moveDuration, poseBetween, samePose, standFor, type CameraPose } from '../camera';

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

describe('moveDuration', () => {
  const city: CameraPose = { view: 'city', zoom: 10, target: [0, 0, 0] };
  const cityNear: CameraPose = { view: 'city', zoom: 40, target: [100, 0, -100] };
  const valley: CameraPose = { view: 'valley', zoom: 1, target: [0, 0, 0] };

  it('keeps the duration for a move within a view', () => {
    expect(moveDuration(city, cityNear, 600)).toBe(600);
  });

  it('cuts across views, whatever duration a beat asked for', () => {
    expect(moveDuration(city, valley, 600)).toBe(0);
    expect(moveDuration(valley, city, 600)).toBe(0);
  });

  it('cuts on the first pose, when there is nothing to move from', () => {
    expect(moveDuration(null, city, 600)).toBe(0);
  });
});

describe('standFor', () => {
  it('offsets every target by the same vector — the attitude times the distance', () => {
    const a = standFor([0, 0, 0], 28000);
    const b = standFor([2200, 0, -11400], 28000);
    const c = standFor([-45000, 0, 30000], 28000);
    const offset = (p: [number, number, number], t: [number, number, number]) => p.map((v, i) => v - t[i]);
    expect(offset(b, [2200, 0, -11400]).map((v) => Math.round(v))).toEqual(offset(a, [0, 0, 0]).map((v) => Math.round(v)));
    expect(offset(c, [-45000, 0, 30000]).map((v) => Math.round(v))).toEqual(offset(a, [0, 0, 0]).map((v) => Math.round(v)));
  });

  it('stands along the attitude, at the distance asked for', () => {
    const { towards } = screenBasis();
    const p = standFor([100, 0, -200], 1000);
    expect(p[0] - 100).toBeCloseTo(towards[0] * 1000, 6);
    expect(p[1]).toBeCloseTo(towards[1] * 1000, 6);
    expect(p[2] + 200).toBeCloseTo(towards[2] * 1000, 6);
    expect(Math.hypot(p[0] - 100, p[1], p[2] + 200)).toBeCloseTo(1000, 6);
  });
});

import { panDuration, targetBelow, targetOf } from '../camera';

describe('panDuration', () => {
  const A: CameraPose = { view: 'valley', zoom: 0.01, target: [0, 0, 0] };
  it('takes no time across views or for no move', () => {
    expect(panDuration(A, { ...A, view: 'city' })).toBe(0);
    expect(panDuration(A, A)).toBe(0);
  });
  it('takes longer for a longer pan, within bounds', () => {
    const near = panDuration(A, { ...A, target: [5000, 0, 0] });
    const far = panDuration(A, { ...A, target: [60000, 0, 0] });
    expect(near).toBeGreaterThanOrEqual(400);
    expect(far).toBeGreaterThan(near);
    expect(far).toBeLessThanOrEqual(1200);
  });
});

describe('targetOf', () => {
  it('inverts standFor', () => {
    const t: [number, number, number] = [123, 4, -567];
    const back = targetOf(standFor(t, 9000), 9000);
    back.forEach((v, i) => expect(v).toBeCloseTo(t[i], 6));
  });
});

describe('targetBelow', () => {
  it('moves the target straight up the screen, so the point sits that far below centre', () => {
    const at: [number, number, number] = [1000, 50, -2000];
    const zoom = 0.02; // px per metre
    const t = targetBelow(at, 200, zoom);
    // Screen position of a three.js point, via projectView's (east, north, h) frame.
    const screen = (p: [number, number, number]) => projectView(p[0], -p[2], p[1]);
    const [ax, ay] = screen(at);
    const [tx, ty] = screen(t);
    expect(tx - ax).toBeCloseTo(0, 6);
    expect((ty - ay) * zoom).toBeCloseTo(200, 6);
  });
  it('is the point itself at no offset', () => {
    expect(targetBelow([1, 2, 3], 0, 0.5)).toEqual([1, 2, 3]);
  });
});
