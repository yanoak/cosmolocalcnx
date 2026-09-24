/** @type {import('next').NextConfig} */
const nextConfig = {
  // The exhibition laptop serves a static export so a venue wifi failure cannot
  // take the installation down. Keeping this on from day one means nothing that
  // needs a server can quietly creep in. See docs/architecture.md.
  output: 'export',
  images: { unoptimized: true },
  // The dev route indicator sits bottom-left, on top of the credits button, and every
  // other corner of the viewer is taken too. Compile and runtime errors still surface.
  devIndicators: false,
};
export default nextConfig;
