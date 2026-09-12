import { describe, expect, it } from 'vitest';
import {
  bounds,
  centroid,
  clipRingToConvex,
  pointInAny,
  pointInPolygon,
  pointInRing,
  polygonArea,
  rectRing,
  ringArea,
} from '../clip';
import type { Poly, Ring } from '../clip';
import type { Point2 } from '../extrude';

const SQUARE: Ring = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];

/** An L, so the concave corner sits at (50, 50) with the notch to its north-east. */
const L_SHAPE: Ring = [
  [0, 0],
  [100, 0],
  [100, 50],
  [50, 50],
  [50, 100],
  [0, 100],
];

describe('pointInRing', () => {
  it('keeps a point inside and drops one outside', () => {
    expect(pointInRing([50, 50], SQUARE)).toBe(true);
    expect(pointInRing([150, 50], SQUARE)).toBe(false);
    expect(pointInRing([50, -1], SQUARE)).toBe(false);
  });

  it('does not keep points in the concavity of a concave boundary', () => {
    // Inside the bounding box of the L, but in the bite taken out of it.
    expect(pointInRing([75, 75], L_SHAPE)).toBe(false);
    // Both arms of the L are still inside.
    expect(pointInRing([75, 25], L_SHAPE)).toBe(true);
    expect(pointInRing([25, 75], L_SHAPE)).toBe(true);
  });

  it('counts a ray through a vertex once, not twice', () => {
    // y = 50 passes exactly through the vertices at (100, 50) and (50, 50).
    expect(pointInRing([25, 50], L_SHAPE)).toBe(true);
    expect(pointInRing([75, 50.0001], L_SHAPE)).toBe(false);
  });

  it('tolerates a repeated closing point', () => {
    const closed: Ring = [...SQUARE, [0, 0]];
    expect(pointInRing([50, 50], closed)).toBe(true);
    expect(pointInRing([150, 50], closed)).toBe(false);
  });
});

describe('pointInPolygon', () => {
  const withHole: Poly = [
    SQUARE,
    [
      [40, 40],
      [60, 40],
      [60, 60],
      [40, 60],
    ],
  ];

  it('treats a hole as outside', () => {
    expect(pointInPolygon([50, 50], withHole)).toBe(false);
    expect(pointInPolygon([20, 20], withHole)).toBe(true);
  });

  it('is false for an empty polygon rather than throwing', () => {
    expect(pointInPolygon([0, 0], [])).toBe(false);
  });
});

describe('pointInAny', () => {
  it('accepts a point in any part of a multipolygon', () => {
    const east: Ring = [
      [200, 0],
      [300, 0],
      [300, 100],
      [200, 100],
    ];
    expect(pointInAny([250, 50], [[SQUARE], [east]])).toBe(true);
    expect(pointInAny([150, 50], [[SQUARE], [east]])).toBe(false);
  });
});

describe('clipping by centroid', () => {
  /** What the import actually does: keep a building if its centroid is inside. */
  const keep = (footprint: Ring, boundary: Poly) => pointInPolygon(centroid(footprint), boundary);

  it('decides a straddling building by its centroid, consistently', () => {
    // Sits across the eastern edge at x = 100, with most of its area outside.
    const mostlyOut: Ring = [
      [90, 40],
      [130, 40],
      [130, 60],
      [90, 60],
    ];
    // Same straddle, most of its area inside.
    const mostlyIn: Ring = [
      [70, 40],
      [110, 40],
      [110, 60],
      [70, 60],
    ];

    expect(keep(mostlyOut, [SQUARE])).toBe(false);
    expect(keep(mostlyIn, [SQUARE])).toBe(true);

    // Consistently: the same footprint decided the same way however it is wound,
    // and whether or not the source closed the ring.
    expect(keep([...mostlyOut].reverse(), [SQUARE])).toBe(false);
    expect(keep([...mostlyIn, mostlyIn[0]], [SQUARE])).toBe(true);
  });
});

describe('centroid', () => {
  it('finds the centre of a rectangle', () => {
    const [x, y] = centroid(SQUARE);
    expect(x).toBeCloseTo(50);
    expect(y).toBeCloseTo(50);
  });

  it('is unchanged by winding order or a repeated closing point', () => {
    const a = centroid(L_SHAPE);
    const b = centroid([...L_SHAPE].reverse());
    const c = centroid([...L_SHAPE, L_SHAPE[0]]);
    expect(b[0]).toBeCloseTo(a[0]);
    expect(b[1]).toBeCloseTo(a[1]);
    expect(c[0]).toBeCloseTo(a[0]);
    expect(c[1]).toBeCloseTo(a[1]);
  });

  it('falls back to the vertex mean on a degenerate ring rather than emitting NaN', () => {
    const collapsed: Ring = [
      [10, 10],
      [10, 10],
      [10, 10],
    ];
    const [x, y] = centroid(collapsed);
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
    expect([x, y]).toEqual([10, 10]);

    const line: Ring = [
      [0, 0],
      [10, 0],
      [20, 0],
    ];
    const mid: Point2 = centroid(line);
    expect(mid.every(Number.isFinite)).toBe(true);
    expect(mid[0]).toBeCloseTo(10);
  });
});

describe('area', () => {
  it('is signed by winding for a ring, and positive for a polygon', () => {
    expect(ringArea(SQUARE)).toBeCloseTo(10_000);
    expect(ringArea([...SQUARE].reverse())).toBeCloseTo(-10_000);
    expect(polygonArea([[...SQUARE].reverse()])).toBeCloseTo(10_000);
  });

  it('subtracts holes', () => {
    const withHole: Poly = [
      SQUARE,
      [
        [40, 40],
        [60, 40],
        [60, 60],
        [40, 60],
      ],
    ];
    expect(polygonArea(withHole)).toBeCloseTo(10_000 - 400);
  });

  it('ignores a repeated closing point', () => {
    expect(ringArea([...SQUARE, SQUARE[0]])).toBeCloseTo(10_000);
  });
});

describe('clipRingToConvex', () => {
  const BIG: Ring = [
    [-100, -100],
    [200, -100],
    [200, 200],
    [-100, 200],
  ];

  it('leaves a ring already inside the clipper alone', () => {
    const inner: Ring = [
      [0, 0],
      [50, 0],
      [50, 50],
      [0, 50],
    ];
    expect(polygonArea([clipRingToConvex(inner, BIG)])).toBeCloseTo(2500);
  });

  it('cuts a ring down to the clipper', () => {
    const clipped = clipRingToConvex(BIG, SQUARE);
    expect(polygonArea([clipped])).toBeCloseTo(10_000);
  });

  it('keeps only the overlap of two partly overlapping rings', () => {
    const eastHalf: Ring = [
      [50, -50],
      [150, -50],
      [150, 150],
      [50, 150],
    ];
    // SQUARE is 0..100 in both axes; the overlap is x 50..100, y 0..100.
    expect(polygonArea([clipRingToConvex(SQUARE, eastHalf)])).toBeCloseTo(5000);
  });

  it('preserves a concave subject where the clip does not split it', () => {
    // The L, clipped by a box that contains it entirely.
    const clipped = clipRingToConvex(L_SHAPE, BIG);
    expect(polygonArea([clipped])).toBeCloseTo(polygonArea([L_SHAPE]));
  });

  it('is empty when the rings do not overlap', () => {
    const away: Ring = [
      [500, 500],
      [600, 500],
      [600, 600],
      [500, 600],
    ];
    expect(clipRingToConvex(SQUARE, away)).toEqual([]);
  });

  it('does not care which way either ring was wound', () => {
    const forward = polygonArea([clipRingToConvex(BIG, SQUARE)]);
    expect(polygonArea([clipRingToConvex([...BIG].reverse(), SQUARE)])).toBeCloseTo(forward);
    expect(polygonArea([clipRingToConvex(BIG, [...SQUARE].reverse())])).toBeCloseTo(forward);
  });

  it('refuses degenerate input rather than throwing', () => {
    expect(clipRingToConvex([[0, 0], [1, 1]], SQUARE)).toEqual([]);
    expect(clipRingToConvex(SQUARE, [])).toEqual([]);
  });
});

describe('rectRing and bounds', () => {
  it('round-trips a rectangle through its bounds', () => {
    const ring = rectRing(-10, -20, 30, 40);
    expect(polygonArea([ring])).toBeCloseTo(40 * 60);
    expect(bounds(ring)).toEqual([-10, -20, 30, 40]);
  });
});
