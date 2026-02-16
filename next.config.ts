import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@google-cloud/storage', 'ffmpeg-static', '@ffprobe-installer/ffprobe'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: 'storage.cloud.google.com' },
    ],
  },
  outputFileTracingIncludes: {
    '/api/templates': ['./node_modules/ffmpeg-static/**', './node_modules/@ffprobe-installer/**', './lib/fonts/**'],
    '/api/templates/[id]': ['./node_modules/ffmpeg-static/**', './node_modules/@ffprobe-installer/**', './lib/fonts/**'],
    '/api/generate-first-frame': ['./node_modules/@fal-ai/**'],
  },
};

export default nextConfig;
