/** @type {import('next').NextConfig} */
const nextConfig = {
  // The exhibition laptop serves a static export so a venue wifi failure cannot
  // take the installation down. Keeping this on from day one means nothing that
  // needs a server can quietly creep in. See docs/architecture.md.
  output: 'export',
  images: { unoptimized: true },
};
export default nextConfig;
