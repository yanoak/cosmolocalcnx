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
/** The eight Futures pins outside the diorama — what the valley beats put on the landscape. */
const VALLEY_PINS = [
  'kae',
  'wat-umong',
  'doi-suthep',
  'doi-saket',
  'lamphun-hills',
  'lamphun-town',
  'mae-taeng',
  'chiang-dao',
] as const;

/**
 * The Past's one framing, stem and bowl alike: south-east of the origin and a little
 * closer than the valley's fit, so the whole diamond sits up in the frame with all seven
 * pins in view — the truck and the tunnel were falling off the bottom. Measured off
 * Yan's own framing, 26 Sep 2026: the icons fitted to within ~20 px. Every beat holds
 * it, so the camera never moves during the Past's stem; the threads do the changing.
 */
const PAST_FRAME = { zoom: 1.19, target: [10900, 0, 9550] as [number, number, number] };

export const SCORES: Record<ChapterId, Score> = {
  past: {
    chapter: 'past',
    beats: [
      // Each thread arrives with its vehicle: the boat on the Ping, the mules and the cart
      // inside their corridors, the truck on Highway 11 — icons in the Futures' style, so
      // the two chapters that share the valley share a grammar. Added 24 Sep 2026 evening.
      // The base: the Ping as the valley's crossroads, before any date. The river is already
      // drawn; the first dated card puts a boat on it. Yan, 24 Sep 2026 evening.
      { id: 'crossroads', view: 'valley', pose: PAST_FRAME, layers: ['river'] },
      { id: 'river', view: 'valley', pose: PAST_FRAME, layers: ['river'], hotspots: ['ping-boat'] },
      { id: 'caravans', view: 'valley', pose: PAST_FRAME, layers: ['river', 'caravans'], hotspots: ['ping-boat', 'mule-caravan', 'bullock-cart'] },
      {
        id: 'roads',
        view: 'valley',
        pose: PAST_FRAME,
        layers: ['river', 'caravans', 'roads'],
        hotspots: ['ping-boat', 'mule-caravan', 'bullock-cart', 'highway-truck'],
      },
      // The station and the tunnel arrive with the track.
      {
        id: 'rail',
        view: 'valley',
        pose: PAST_FRAME,
        layers: ['river', 'caravans', 'roads', 'rail'],
        hotspots: ['ping-boat', 'mule-caravan', 'bullock-cart', 'highway-truck', 'station', 'khun-tan'],
      },
      // The thread with no route, and therefore the one that ends the chapter. Its only
      // geometry is the airport, which is a pin.
      {
        id: 'air',
        view: 'valley',
        pose: PAST_FRAME,
        layers: ['river', 'caravans', 'roads', 'rail', 'air'],
        hotspots: ['ping-boat', 'mule-caravan', 'bullock-cart', 'highway-truck', 'station', 'khun-tan', 'airport'],
        terminal: true,
      },
    ],
    // The bowl holds the stem's framing. See PAST_FRAME.
    bowl: { view: 'valley', ...PAST_FRAME },
    // Down opens the pins in the order they arrived in the valley, not the beats' order,
    // which is by thread and puts the 1969 truck before the 1922 railway. Yan, 26 Sep 2026.
    walk: [
      'ping-boat', //     1867, the documented journey upstream
      'mule-caravan', //  undated; the same pre-rail trade as the boat
      'bullock-cart', //  undated; likewise
      'khun-tan', //      1918, the tunnel finished ahead of the line
      'station', //       1922, the railway arrives
      'airport', //       1934, operations begin
      'highway-truck', // 1969, Highway 11
    ],
  },
  present: {
    chapter: 'present',
    beats: [
      // The camera holds still through the whole stem — Yan's call, 24 Sep 2026: "just see
      // the circle expand as you scroll". No beat carries a mapPose; all three sit at the
      // chapter's home view, the circle fitted, and only the ring moves. Stops at 0, 2,000
      // and the claim since the evening of 24 Sep; the beat past the claim went with them.
      // The base: one point on Wat Ket, before anything grows.
      { id: 'here', view: 'circle', ring: { from: 0, to: 0 }, card: 'low' }, // under Wat Ket, not over it
      // To 2,000 km — a fifth of the world — with the beat's progress; the counter reads
      // the committed curve.
      { id: 'two-thousand', view: 'circle', ring: { from: 0, to: 2000 } },
      // On to the claim: half of everyone alive. The bowl holds the ring here.
      { id: 'half', view: 'circle', ring: { from: 2000, to: 'claim' }, terminal: true },
    ],
  },
  futures: {
    chapter: 'futures',
    beats: [
      // Opens in the city — Yan, 24 Sep 2026 evening — on the district the newspaper's
      // world grows out of. No pins yet: "follow the pins" is the invitation, and they
      // arrive one piece at a time.
      { id: 'gen-c', view: 'city' },
      // The weir's idea, still over the district: the doc's order, restored once the doc
      // gained its own valley beats.
      { id: 'fai', view: 'city' },
      // Journeyfolk: Ban Tawan just inside Tha Phae Gate and Wua Lai's silver quarter — one
      // piece, two pins, so both arrive on its beat. Framed between them.
      {
        id: 'ban-tawan',
        view: 'city',
        pose: { zoom: 2.5, target: [-1615, 0, 935] },
        hotspots: ['ban-tawan', 'wua-lai'],
      },
      // Lanna World School: the shed at Wat Ket, then Anusarn. The last city beat.
      {
        id: 'lanna-world-school',
        view: 'city',
        pose: { zoom: 3, target: [-235, 0, 375] },
        hotspots: ['ban-tawan', 'wua-lai', 'lanna-world-school', 'anusarn'],
      },
      // The cut to the valley — CameraRig cuts across views whatever a beat's duration is —
      // and the establishing shot: the whole 120 km field, nothing on it yet but the city.
      // Then a sweep, west → north → east → south → the middle, each beat landing on its
      // pin and the neighbours the copy file puts with it. Six beats written into the doc
      // on 24 Sep 2026 evening from Yan's revised copy file.
      { id: 'valley', view: 'valley' },
      // West: the ridge, and Wat Umong at its foot.
      {
        id: 'doi-suthep',
        view: 'valley',
        pose: { zoom: 3, target: [-11000, 0, -4000] },
        hotspots: ['doi-suthep', 'wat-umong'],
      },
      // North: the tea, and Chiang Dao beyond it on the frame's edge.
      {
        id: 'mae-taeng',
        view: 'valley',
        pose: { zoom: 2.2, target: [-5000, 0, -45000] },
        hotspots: ['doi-suthep', 'wat-umong', 'mae-taeng', 'chiang-dao'],
      },
      // East: the farm.
      {
        id: 'doi-saket',
        view: 'valley',
        pose: { zoom: 3, target: [13560, 0, -9110] },
        hotspots: ['doi-suthep', 'wat-umong', 'mae-taeng', 'chiang-dao', 'doi-saket'],
      },
      // South: the hills and the town, framed between them.
      {
        id: 'lamphun-hills',
        view: 'valley',
        pose: { zoom: 2.5, target: [6300, 0, 25300] },
        hotspots: ['doi-suthep', 'wat-umong', 'mae-taeng', 'chiang-dao', 'doi-saket', 'lamphun-hills', 'lamphun-town'],
      },
      // The middle, and the close: pull back to the frame that holds all eight — 1.9× the
      // fit on the pins' screen centre, computed from projectView over the placed pins;
      // recompute if a pin moves — as KAE arrives at Wiang Kum Kam. The bowl holds this.
      {
        id: 'kae',
        view: 'valley',
        pose: { zoom: 1.9, target: [2200, 0, -11400] },
        hotspots: VALLEY_PINS,
        terminal: true,
      },
    ],
  },
};
