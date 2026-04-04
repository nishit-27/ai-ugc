import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@google-cloud/storage', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner', 'sharp', 'ffmpeg-static', '@ffprobe-installer/ffprobe'],
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
    ],
  },
  outputFileTracingIncludes: {
    '/api/templates': ['./node_modules/ffmpeg-static/**', './node_modules/@ffprobe-installer/**', './lib/fonts/**'],
    '/api/templates/[id]': ['./node_modules/ffmpeg-static/**', './node_modules/@ffprobe-installer/**', './lib/fonts/**'],
    '/api/video-duration': ['./node_modules/@ffprobe-installer/**'],
    '/api/generate-first-frame': ['./node_modules/@fal-ai/**'],
  },
};

export default nextConfig;
