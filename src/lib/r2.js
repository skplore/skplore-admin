import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

function getS3Client() {
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_ACCESS_KEY_ID || !process.env.CLOUDFLARE_SECRET_ACCESS_KEY) {
    return null;
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
    },
  });
}

export function isR2Url(url) {
  if (!url) return false;
  const publicDomain = process.env.CLOUDFLARE_PUBLIC_DOMAIN;
  if (publicDomain && url.startsWith(publicDomain)) return true;
  return url.includes('.r2.cloudflarestorage.com') || url.includes('.r2.dev');
}

export function extractR2Key(url) {
  if (!url) return null;
  const publicDomain = process.env.CLOUDFLARE_PUBLIC_DOMAIN;
  if (publicDomain && url.startsWith(publicDomain)) {
    return url.replace(`${publicDomain}/`, '').split('?')[0];
  }
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.replace(/^\//, '');
  } catch {
    return null;
  }
}

export async function deleteFromR2(key) {
  if (!key || !process.env.CLOUDFLARE_BUCKET_NAME) return;
  const s3 = getS3Client();
  if (!s3) return;
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.CLOUDFLARE_BUCKET_NAME,
      Key: key,
    });
    await s3.send(command);
  } catch (err) {
    console.error('Failed to delete image from R2:', key, err.message);
  }
}