// Cloudflare R2 (S3-compatible) client — CHỈ chạy phía server.
//
// Dùng cho việc upload ảnh câu hỏi trong trình soạn đề. Các biến bí mật
// (access key/secret) chỉ được đọc trong module này và không bao giờ gửi ra
// client. File này chỉ được import từ Server Action ('use server').
//
// Biến môi trường (.env.local):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//   R2_BUCKET_NAME, R2_PUBLIC_URL (base URL public/custom domain, không kèm path).

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB — khớp giới hạn khi publish

const EXTENSION_BY_TYPE: Record<AllowedImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export function isAllowedImageType(value: string): value is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

export function imageExtension(type: AllowedImageType): string {
  return EXTENSION_BY_TYPE[type];
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Thiếu biến môi trường ${name} cho Cloudflare R2.`);
  }
  return value.trim();
}

let cachedClient: S3Client | null = null;

function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;
  const accountId = requiredEnv('R2_ACCOUNT_ID');
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
  return cachedClient;
}

/** URL public ổn định (không query/fragment) khớp cách publish kiểm tra. */
export function r2PublicUrl(objectKey: string): string {
  const base = requiredEnv('R2_PUBLIC_URL').replace(/\/+$/, '');
  return `${base}/${objectKey.replace(/^\/+/, '')}`;
}

/** Upload một object lên R2. Không đăng ký DB — việc đó do RPC riêng lo. */
export async function putR2Object(params: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<void> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: requiredEnv('R2_BUCKET_NAME'),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}
