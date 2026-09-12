import type { Metadata } from 'next';
import { cssCustomProperties } from '@/engine/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wat Ket 2045',
  description:
    'Arguable futures for Wat Ket, Chiang Mai — an exhibition piece for Nomad Futures Lab.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Tokens are injected from the same module the renderer reads, so the DOM
            and the canvas cannot drift apart. See docs/design-system.md. */}
        <style dangerouslySetInnerHTML={{ __html: cssCustomProperties() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
