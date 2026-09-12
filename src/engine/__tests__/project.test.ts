import { describe, expect, it } from 'vitest';
import { projectToLocalMetres } from '@/engine/project';

// Wat Ket, east bank of the Ping.
const ORIGIN: [number, number] = [18.7912, 99.0043];

describe('projectToLocalMetres', () => {
  it('maps the origin to [0, 0]', () => {
    const [x, y] = projectToLocalMetres(ORIGIN, ORIGIN);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
  });

  it('puts a point ~100 m north within a metre of [0, 100]', () => {
    // 100 m of latitude is about 0.000899°.
    const [x, y] = projectToLocalMetres([ORIGIN[0] + 0.000899, ORIGIN[1]], ORIGIN);
    expect(Math.abs(x)).toBeLessThan(1);
    expect(y).toBeGreaterThan(99);
    expect(y).toBeLessThan(101);
  });

  it('scales east/west by cos(latitude), not 1:1', () => {
    // The classic way to get a squashed city is to forget this.
    const d = 0.001;
    const [east] = projectToLocalMetres([ORIGIN[0], ORIGIN[1] + d], ORIGIN);
    const [, north] = projectToLocalMetres([ORIGIN[0] + d, ORIGIN[1]], ORIGIN);
    const expected = Math.cos((ORIGIN[0] * Math.PI) / 180);
    expect(east / north).toBeCloseTo(expected, 2);
    expect(east).toBeLessThan(north);
  });

  it('signs the axes east-positive and north-positive', () => {
    const [eastX] = projectToLocalMetres([ORIGIN[0], ORIGIN[1] + 0.001], ORIGIN);
    const [, northY] = projectToLocalMetres([ORIGIN[0] + 0.001, ORIGIN[1]], ORIGIN);
    expect(eastX).toBeGreaterThan(0);
    expect(northY).toBeGreaterThan(0);
  });
});
