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
};

export default nextConfig;
