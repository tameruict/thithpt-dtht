import type { NextConfig } from "next";

const imageRemotePatterns: URL[] = [];
if (process.env.R2_PUBLIC_URL) {
  const pattern = new URL(process.env.R2_PUBLIC_URL);
  pattern.pathname = `${pattern.pathname.replace(/\/+$/, '')}/**`;
  pattern.search = '';
  imageRemotePatterns.push(pattern);
}

// QR thanh toán mua key: ảnh QR VietQR (số tiền + nội dung nhúng sẵn) và QR Zalo
// hỗ trợ đều tải từ dịch vụ ngoài, nên phải khai báo host ở remotePatterns thì
// next/image (Next 16) mới cho phép render — nếu thiếu, ảnh QR sẽ lỗi.
imageRemotePatterns.push(
  new URL('https://img.vietqr.io/image/**'),
  new URL('https://api.qrserver.com/v1/create-qr-code/**'),
);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    remotePatterns: imageRemotePatterns,
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
