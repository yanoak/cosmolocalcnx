import { describe, expect, it } from 'vitest';
import { chooseLod, LOD_MODES } from '../lod';

const NEAR = ['near'];
const FULL = ['full'];
const BACKDROP = { meta: 'wat-ket.backdrop.json' };

describe('chooseLod', () => {
  it('draws the near set over the raster by default', () => {
    expect(chooseLod('near', NEAR, null, BACKDROP)).toEqual({
      buildings: NEAR,
      backdrop: BACKDROP,
      pending: false,
    });
  });

  it('keeps the raster while the full document is still in flight', () => {
    // The whole reason this is a function: dropping the backdrop when `full` is
    // REQUESTED rather than when it ARRIVES leaves a hole where the far city was.
    expect(chooseLod('full', NEAR, null, BACKDROP)).toEqual({
      buildings: NEAR,
      backdrop: BACKDROP,
      pending: true,
    });
  });

  it('swaps to geometry and drops the raster once the document lands', () => {
    expect(chooseLod('full', NEAR, FULL, BACKDROP)).toEqual({
      buildings: FULL,
      backdrop: null,
      pending: false,
    });
  });

  it('ignores a loaded full document while in near mode', () => {
    // Toggling back must be instant and must not re-fetch, so the document stays.
    expect(chooseLod('near', NEAR, FULL, BACKDROP)).toEqual({
      buildings: NEAR,
      backdrop: BACKDROP,
      pending: false,
    });
  });

  it('leaves a scene with no backdrop alone in either mode', () => {
    // A second neighbourhood small enough to fit the budget never has one.
    expect(chooseLod('near', NEAR, null, null).backdrop).toBeNull();
    expect(chooseLod('full', NEAR, FULL, null).buildings).toBe(FULL);
  });

  it('offers exactly two modes', () => {
    expect([...LOD_MODES]).toEqual(['near', 'full']);
  });
});
