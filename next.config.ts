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
  compress: true,
  images: {
    remotePatterns: r2RemotePatterns,
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
  },
  experimental: {
    // lucide-react + react-markdown/rehype là ESM nhiều file: tree-shake từng
    // icon/module thay vì kéo cả package vào bundle trang thi.
    optimizePackageImports: [
      'lucide-react',
      'react-markdown',
      'remark-gfm',
      'remark-math',
      'rehype-katex',
      'rehype-raw',
      'rehype-sanitize',
    ],
  },
};

export default nextConfig;
