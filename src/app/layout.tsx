import type { Metadata } from 'next';
import { IBM_Plex_Sans_Thai } from 'next/font/google';
import { cssCustomProperties } from '@/engine/theme';
import './globals.css';

/**
 * One family for both scripts.
 *
 * The Cosmo Local brand specifies IBM Plex Sans Thai, and it happens to solve
 * roadmap item 5's Thai typography pass at the same time: Latin and Thai share
 * metrics, so bilingual copy needs no fallback stack and no separate line-height.
 *
 * Self-hosted by next/font rather than linked from Google, because the
 * laptop/projection machine runs a local static export and must survive the venue
 * wifi failing.
 */
const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['latin', 'thai'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-plex-thai',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Wat Ket 2045',
  description:
    'Arguable futures for Wat Ket, Chiang Mai — an exhibition piece for Nomad Futures Lab.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plexThai.variable}>
      <head>
        {/* Tokens are injected from the same module the renderer reads, so the DOM
            and the canvas cannot drift apart. See docs/design-system.md. */}
        <style dangerouslySetInnerHTML={{ __html: cssCustomProperties() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
