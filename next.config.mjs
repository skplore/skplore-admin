/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.0.109'],

  // Allow Cloudflare R2 + Cloudinary + Supabase images
  images: {
    unoptimized: true,
    imageSizes: [128, 256, 384],
    deviceSizes: [640, 768, 1024, 1280],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-147b6454958c46f3bfb564286d54ecf9.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'skimedlufkytgemmdhsv.supabase.co',
      },
    ],
  },
};

export default nextConfig;
