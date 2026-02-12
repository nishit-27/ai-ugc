import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@google-cloud/storage', 'ffmpeg-static', '@ffprobe-installer/ffprobe'],
  outputFileTracingIncludes: {
    '/api/templates': ['./node_modules/ffmpeg-static/**', './node_modules/@ffprobe-installer/**', './lib/fonts/**'],
    '/api/templates/[id]': ['./node_modules/ffmpeg-static/**', './node_modules/@ffprobe-installer/**', './lib/fonts/**'],
  },
};

export default nextConfig;
