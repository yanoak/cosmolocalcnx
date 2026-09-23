import Link from 'next/link';
import {
  BRIDGE_TONES,
  GROUND,
  PALETTE,
  PALETTE_EXTENDED,
  POPULATION_RAMP,
  POPULATION_RAMP_OUTSIDE,
  RELIEF_RAMP,
  ROAD_TONES,
  SURFACE_ROLES,
  UI_TOKENS,
  contrastRatio,
  type Hex,
  type Ramp,
} from '@/engine/theme';
import './design.css';

/**
 * The design system, rendered from the design system.
 *
 * Every value on this page is IMPORTED from `src/engine/theme.ts` rather than written
 * here, which is the only property that makes a page like this worth having: it cannot
 * drift from the thing it documents. If a swatch is wrong, the token is wrong.
 *
 * `docs/design-system.md` says why the values are what they are. This says what they
 * currently ARE. The two are not the same job and this one goes stale the moment it is
 * maintained by hand.
 *
 * Internal, like `/settings` — not linked from the viewer, reached by typing the
 * address. Unlike `/print` it is harmless to deploy: it ships tokens, not a 4 MB scene.
 *
 * See plans/2026-09-23_kv-design-system.plan.md.
 */

export const metadata = {
  title: 'Design system — Cosmo Local CNX',
};

/** Large text clears at 3:1, body at 4.5:1. The size a token is used at is part of the token. */
function Contrast({ fg, bg, large = false }: { fg: string; bg: string; large?: boolean }) {
  const ratio = contrastRatio(fg, bg);
  const need = large ? 3 : 4.5;
  const pass = ratio >= need;
  return (
    <span className={pass ? 'ratio pass' : 'ratio fail'}>
      {ratio.toFixed(2)}:1 {pass ? '✓' : '✕'}
      <span className="need"> needs {need}</span>
    </span>
  );
}

function Swatch({ name, value }: { name: string; value: Hex }) {
  return (
    <figure className="swatch">
      <div className="chip" style={{ background: value }} />
      <figcaption>
        <code>{name}</code>
        <span className="hex">{value}</span>
      </figcaption>
    </figure>
  );
}

/** Top, side, shade — the three faces, in the orientation the diorama shows them. */
function RampChip({ name, value }: { name: string; value: Ramp }) {
  return (
    <figure className="swatch">
      <div className="chip tri">
        <span style={{ background: value.top }} />
        <span style={{ background: value.side }} />
        <span style={{ background: value.shade }} />
      </div>
      <figcaption>
        <code>{name}</code>
        <span className="hex">
          {value.top} · {value.side} · {value.shade}
        </span>
      </figcaption>
    </figure>
  );
}

function RampBar({ stops }: { stops: readonly string[] }) {
  return (
    <div className="rampbar">
      {stops.map((s, i) => (
        <span key={`${s}-${i}`} style={{ background: s }} title={s} />
      ))}
    </div>
  );
}

export default function DesignSystemPage() {
  const page = GROUND.ground;

  return (
    <main className="design">
      <header className="masthead">
        <p className="kicker">Cosmo Local CNX</p>
        <h1>Design system</h1>
        <p className="lede">
          Every value below is imported from <code>src/engine/theme.ts</code>. Nothing on this
          page is written by hand, so it cannot drift from what the renderer actually draws.{' '}
          <Link href="/settings">Settings</Link> · <Link href="/">Viewer</Link>
        </p>
      </header>

      <section>
        <h2>Layer 1 — palette</h2>
        <p>
          Specified values, not sampled ones. Verified on 23 Sep 2026 against the printed
          exhibition panels by extracting their span colours and fill operators: the panels use{' '}
          <code>cosmo.orange</code>, <code>cosmo.purple</code>, <code>cosmo.charcoal</code> and{' '}
          <code>cosmo.offWhite</code> exactly as they are below.
        </p>
        <div className="grid">
          {Object.entries(PALETTE).map(([k, v]) => (
            <Swatch key={k} name={k} value={v} />
          ))}
        </div>

        <h3>Extended</h3>
        <p>Secondary and neutral ranges. Roles reach into these; nothing else does.</p>
        <div className="grid">
          {Object.entries(PALETTE_EXTENDED).map(([k, v]) => (
            <Swatch key={k} name={k} value={v} />
          ))}
        </div>
      </section>

      <section>
        <h2>Layer 2 — surface roles</h2>
        <p>
          The only names used anywhere in code. Each expands to three tones — top face, light
          side, shade side — derived by <code>ramp()</code> rather than hand-picked, because form
          comes from face orientation and there are no lights in the scene.
        </p>
        <div className="grid">
          {Object.entries(SURFACE_ROLES).map(([k, v]) => (
            <RampChip key={k} name={k} value={v} />
          ))}
        </div>

        <h3>Bridges</h3>
        <div className="grid">
          {Object.entries(BRIDGE_TONES).map(([k, v]) => (
            <RampChip key={k} name={`bridge.${k}`} value={v} />
          ))}
        </div>

        <h3>Ground</h3>
        <p>Flat surfaces, no ramp — they are only ever seen from above.</p>
        <div className="grid">
          {Object.entries(GROUND).map(([k, v]) => (
            <Swatch key={k} name={k} value={v} />
          ))}
        </div>

        <h3>Street hierarchy</h3>
        <p>
          Roads are drawn into a canvas texture, so tone is their only visual variable besides
          width. Wider and darker for the roads that carry the district&rsquo;s shape.
        </p>
        <div className="roads">
          {Object.entries(ROAD_TONES).map(([k, v]) => (
            <div key={k} className="road">
              <span className="bar" style={{ background: v }} />
              <code>{k}</code>
              <span className="hex">{v}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Ramps</h2>

        <h3>Population</h3>
        <p>
          Sequential and light-to-dark, because the quantity has a direction and a spectral ramp
          would invent boundaries the data does not have. It starts at the district&rsquo;s own
          ground tone — the emptiest cell in Asia is exactly the colour of the ground in Wat Ket —
          and ends at the interrupt colour, so the megacities are the only thing in frame using it.
        </p>
        <RampBar stops={POPULATION_RAMP} />
        <p className="note">Outside the circle, desaturated:</p>
        <RampBar stops={POPULATION_RAMP_OUTSIDE} />

        <h3>Relief</h3>
        <p>
          Plain → foothills → summits, through park green and civic teal and out at deep violet,
          which keeps the mountains in the brand rather than reaching for a satellite brown.
        </p>
        <RampBar stops={RELIEF_RAMP} />
      </section>

      <section>
        <h2>UI tokens</h2>
        <p>
          Derived <em>darker</em> from the palette, never taken from it. The raw values fail
          contrast badly as text and the audience reads this standing in a bright mall on their
          own phone. Ratios below are measured live against <code>ground</code> ({page}).
        </p>
        <table className="tokens">
          <thead>
            <tr>
              <th>Token</th>
              <th>Value</th>
              <th>On ground</th>
              <th>Sample</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(UI_TOKENS).map(([k, v]) => (
              <tr key={k}>
                <td>
                  <code>{k}</code>
                </td>
                <td>
                  <span className="hex">{v}</span>
                </td>
                <td>
                  <Contrast fg={v} bg={page} />
                </td>
                <td style={{ background: page }}>
                  <span style={{ color: v }}>Wat Ket, 2045</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Typeface</h2>
        <p>
          IBM Plex Sans Thai, self-hosted via <code>next/font</code> so it survives the offline
          static export. One family covers Latin and Thai, which is why the brand chose it and why
          the bilingual copy needs no fallback stack.
        </p>
        <div className="specimen">
          <p style={{ fontSize: '2rem', fontWeight: 600 }}>Wat Ket, 2045</p>
          <p style={{ fontSize: '2rem', fontWeight: 600 }}>วัดเกต พ.ศ. 2588</p>
          <p>
            Wat Ket sits 279.98 km from the centre of the Valeriepieris circle, 8.15% of its
            radius.
          </p>
          <p>
            วัดเกตอยู่ห่างจากศูนย์กลางของวงกลมวาเลอรีปีเอริส 279.98 กิโลเมตร
            คิดเป็น 8.15% ของรัศมี
          </p>
        </div>
      </section>

      <section className="proposed">
        <h2>Proposed — the two registers</h2>
        <p>
          <strong>Not yet in <code>theme.ts</code>.</strong> The printed panels use two registers
          and the token table currently has one. These are composed from existing Layer 1 values,
          so adopting them adds roles without adding colours. See{' '}
          <code>plans/2026-09-23_kv-design-system.plan.md</code>.
        </p>

        <div className="registers">
          <div
            className="register"
            style={{ background: PALETTE_EXTENDED['cosmo.offWhite'], color: PALETTE_EXTENDED['cosmo.charcoal'] }}
          >
            <p className="r-kicker" style={{ color: PALETTE['cosmo.orange'] }}>
              Nomad Futures Lab:
            </p>
            <p className="r-head">Nomads as bridges to today&rsquo;s new rivers of opportunity</p>
            <p className="r-body">
              Chiang Mai has always been shaped by the routes that connect it to the world, with
              digital remote work offering the newest opportunity.
            </p>
            <p className="r-label">
              page · ground <code>cosmo.offWhite</code> · ink <code>cosmo.charcoal</code> · kicker{' '}
              <code>cosmo.orange</code>
            </p>
          </div>

          <div
            className="register"
            style={{ background: PALETTE['cosmo.purple'], color: PALETTE_EXTENDED['cosmo.offWhite'] }}
          >
            <p className="r-kicker" style={{ color: PALETTE['cosmo.orange'] }}>
              Dreamers, it&rsquo;s your turn:
            </p>
            <p className="r-head">What are your dreams for Chiang Mai?</p>
            <p className="r-body">
              Whether you live here, work here, have just arrived, or come back every year, what do
              you dream of for Chiang Mai?
            </p>
            <p className="r-label">
              invert · ground <code>cosmo.purple</code> · ink <code>cosmo.offWhite</code> · kicker{' '}
              <code>cosmo.orange</code>
            </p>
          </div>
        </div>

        <h3>Contrast, at the size each is used</h3>
        <p>
          The panels set kickers at 80 pt, where raw orange is legible. At body size on a phone it
          is not — which is why <code>ui.accent</code> already derives a darker orange, and why one
          accent token cannot serve both.
        </p>
        <table className="tokens">
          <tbody>
            <tr>
              <td>
                <code>page</code> ink on ground
              </td>
              <td>
                <Contrast fg={PALETTE_EXTENDED['cosmo.charcoal']} bg={PALETTE_EXTENDED['cosmo.offWhite']} />
              </td>
            </tr>
            <tr>
              <td>
                <code>page</code> kicker on ground, as large text
              </td>
              <td>
                <Contrast fg={PALETTE['cosmo.orange']} bg={PALETTE_EXTENDED['cosmo.offWhite']} large />
              </td>
            </tr>
            <tr>
              <td>
                <code>page</code> kicker on ground, at body size
              </td>
              <td>
                <Contrast fg={PALETTE['cosmo.orange']} bg={PALETTE_EXTENDED['cosmo.offWhite']} />
              </td>
            </tr>
            <tr>
              <td>
                <code>invert</code> ink on ground
              </td>
              <td>
                <Contrast fg={PALETTE_EXTENDED['cosmo.offWhite']} bg={PALETTE['cosmo.purple']} />
              </td>
            </tr>
            <tr>
              <td>
                <code>invert</code> kicker on ground, as large text
              </td>
              <td>
                <Contrast fg={PALETTE['cosmo.orange']} bg={PALETTE['cosmo.purple']} large />
              </td>
            </tr>
          </tbody>
        </table>

        <h3>The rail</h3>
        <p>
          The pipe-and-node graphic on p22 of the panels, which is already a chapter rail in print.
          Built against the three views first; it gains chapters as a data change.
        </p>
        <nav className="rail" aria-label="Rail preview (static)">
          {['Past', 'Present', 'Futures'].map((label, i) => (
            <span key={label} className="node-wrap">
              <span
                className={i === 0 ? 'node current' : 'node'}
                style={{ borderColor: PALETTE['cosmo.orange'], background: GROUND.ground }}
              />
              <span className="node-label">{label}</span>
              {i < 2 && <span className="conduit" style={{ background: PALETTE['cosmo.orange'] }} />}
            </span>
          ))}
        </nav>
      </section>

      <footer className="colophon">
        <p>
          Rendered from <code>src/engine/theme.ts</code>. Rationale lives in{' '}
          <code>docs/design-system.md</code>; the panels it answers to are at{' '}
          <code>docs/references/CosmoLocal Exhibition_5_small.pdf</code>, which is gitignored.
        </p>
      </footer>
    </main>
  );
}
