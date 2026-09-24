import type { Score } from '@/engine/chapters';
import type { ChapterId } from '@/engine/views';

/**
 * The three stems, as data.
 *
 * A score is the engineer-edited half of a chapter — which view each beat is in, where
 * the camera goes relative to that view's fit, which layers and hotspots are on. The
 * writer-edited half, the words, lives in the Google Doc and arrives as
 * `src/content/copy.json`; the two are joined by beat id, and `scores.test.ts` fails the
 * build if either side has an id the other lacks. See docs/copy-schema.md.
 *
 * Targets are three.js world units: [east, 0, −north] in metres from the scene origin —
 * the same frame for the city and the valley, which is what makes a valley beat and a
 * city beat the same kind of thing.
 *
 * These are the sample beats seeded on 24 Sep 2026, so the stems can be scrolled before
 * the real copy exists. Replace freely; the test says what has to stay consistent.
 */
export const SCORES: Record<ChapterId, Score> = {
  past: {
    chapter: 'past',
    beats: [
      { id: 'river', view: 'valley', layers: ['river'] },
      { id: 'caravans', view: 'valley', layers: ['river', 'caravans'] },
      { id: 'roads', view: 'valley', layers: ['river', 'caravans', 'roads'] },
      { id: 'rail', view: 'valley', layers: ['river', 'caravans', 'roads', 'rail'] },
      // The thread with no route, and therefore the one that ends the chapter.
      { id: 'air', view: 'valley', layers: ['river', 'caravans', 'roads', 'rail', 'air'], terminal: true },
    ],
  },
  present: {
    chapter: 'present',
    beats: [
      // The base: close on Wat Ket, before anything grows. No ring.
      { id: 'here', view: 'circle', pose: { zoom: 6 }, ring: { from: 0, to: 0 } },
      // The ring grows to the claim — half of humanity — while the camera pulls back, so
      // the ring holds roughly its share of the screen. Both are continuous in the beat's
      // progress; the counter reads the committed curve.
      { id: 'grow', view: 'circle', pose: { zoom: 6 }, ring: { from: 0, to: 1 } },
      // Past the claim, greyed: the next three thousand kilometres add a sixth as much.
      { id: 'flatten', view: 'circle', pose: { zoom: 1.6 }, ring: { from: 1, to: 1.75 }, terminal: true },
    ],
  },
  futures: {
    chapter: 'futures',
    beats: [
      { id: 'gen-c', view: 'city' },
      { id: 'fai', view: 'city' },
      // Ban Tawan: just inside the eastern gate — 1.15 km west, 0.40 km south of the origin.
      { id: 'ban-tawan', view: 'city', pose: { zoom: 4, target: [-1150, 0, 400] }, hotspots: ['ban-tawan'] },
      // The shed, on the origin. Terminal until the doc gains valley beats; then the stem
      // shifts to the valley here and this stops being the end.
      { id: 'lanna-world-school', view: 'city', pose: { zoom: 4, target: [0, 0, 0] }, hotspots: ['ban-tawan', 'lanna-world-school'], terminal: true },
    ],
  },
};
