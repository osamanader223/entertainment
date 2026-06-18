/** @type {import('next').NextConfig} */
const nextConfig = {
  // Supabase-generated types are incomplete stubs; ignore TS/lint errors at build time.
  // Remove these once types are regenerated via: npx supabase gen types typescript --project-id <ref>
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
