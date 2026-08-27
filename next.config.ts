import type { NextConfig } from "next";

const r2RemotePatterns: URL[] = [];
if (process.env.R2_PUBLIC_URL) {
  const pattern = new URL(process.env.R2_PUBLIC_URL);
  pattern.pathname = `${pattern.pathname.replace(/\/+$/, '')}/**`;
  pattern.search = '';
  r2RemotePatterns.push(pattern);
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: r2RemotePatterns,
  },
  // Vercel's legacy production route manifest can lag behind newly added app
  // routes. This after-files alias is dormant when /purchase exists and falls
  // back to the established dynamic /join/[roomId] route when it does not.
  rewrites() {
    return [
      {
        source: '/purchase',
        destination: '/join/__purchase',
      },
    ];
  },
};

export default nextConfig;
