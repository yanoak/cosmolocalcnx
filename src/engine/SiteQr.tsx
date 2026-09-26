/**
 * The piece's public address as a QR code, for the exhibition screen: a visitor points a
 * phone at the corner and carries the piece away. Drawn inline in the ink colour rather
 * than as an image, so it takes the theme's tokens and no hex value enters the source.
 *
 * The path is the `qrcode` package's own output, error correction M, no margin — the
 * quiet zone is CSS padding. To regenerate after the address changes:
 *
 *   npx -y qrcode@1.5.4 -t svg -e M -q 0 -o qr.svg "https://cnx2045.thibi.co"
 *
 * and paste the dark path's `d` and the `viewBox` below. Added 26 Sep 2026.
 */
export const SITE_URL = 'https://cnx2045.thibi.co';
export const SITE_LABEL = 'cnx2045.thibi.co';

const VIEWBOX = '0 0 25 25';
const MODULES =
  'M0 0.5h7m2 0h5m2 0h1m1 0h7M0 1.5h1m5 0h1m2 0h3m3 0h1m2 0h1m5 0h1M0 2.5h1m1 0h3m1 0h1m1 0h1m2 0h2m2 0h2m1 0h1m1 0h3m1 0h1M0 3.5h1m1 0h3m1 0h1m1 0h4m1 0h4m1 0h1m1 0h3m1 0h1M0 4.5h1m1 0h3m1 0h1m1 0h2m1 0h1m1 0h1m2 0h1m1 0h1m1 0h3m1 0h1M0 5.5h1m5 0h1m1 0h1m3 0h1m2 0h1m2 0h1m5 0h1M0 6.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M8 7.5h1m1 0h2m2 0h1m1 0h1M0 8.5h1m1 0h5m2 0h2m2 0h2m3 0h5M1 9.5h2m7 0h1m1 0h1m6 0h1m3 0h1M0 10.5h2m1 0h1m1 0h4m3 0h2m1 0h3m1 0h3m1 0h2M2 11.5h2m1 0h1m1 0h1m1 0h1m2 0h1m2 0h2m7 0h1M0 12.5h2m1 0h1m1 0h4m1 0h1m2 0h6m1 0h1m1 0h3M0 13.5h2m6 0h3m1 0h2m3 0h1m1 0h1m1 0h1m1 0h1M0 14.5h1m2 0h1m2 0h1m1 0h1m1 0h1m4 0h1m3 0h3m1 0h2M0 15.5h1m3 0h2m1 0h3m2 0h1m1 0h3m1 0h3m3 0h1M0 16.5h1m1 0h1m1 0h1m1 0h1m3 0h1m1 0h2m1 0h6m1 0h1M8 17.5h2m3 0h1m2 0h1m3 0h2M0 18.5h7m2 0h6m1 0h1m1 0h1m1 0h1m1 0h3M0 19.5h1m5 0h1m1 0h1m1 0h2m3 0h2m3 0h2m2 0h1M0 20.5h1m1 0h3m1 0h1m1 0h1m2 0h10m1 0h1M0 21.5h1m1 0h3m1 0h1m1 0h1m3 0h1m2 0h1m2 0h1m1 0h5M0 22.5h1m1 0h3m1 0h1m1 0h1m1 0h1m2 0h1m1 0h1m1 0h1m3 0h2m1 0h1M0 23.5h1m5 0h1m2 0h3m2 0h1m1 0h1m1 0h4m2 0h1M0 24.5h7m1 0h1m2 0h5m3 0h6';

export function SiteQr({ size = 72 }: { size?: number }) {
  return (
    <svg
      className="site-qr-code"
      viewBox={VIEWBOX}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code for ${SITE_LABEL}`}
    >
      <path stroke="currentColor" d={MODULES} />
    </svg>
  );
}
