/** @type {import('next').NextConfig} */
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // TAK live tracking (optional, in development): always defined at build
  // time, so `process.env.NEXT_PUBLIC_TAK === 'on'` is a constant and TAK is
  // compiled out entirely unless the flag is exactly "on".
  env: {
    NEXT_PUBLIC_TAK: process.env.NEXT_PUBLIC_TAK === 'on' ? 'on' : 'off',
  },
  // Ensure Next.js traces output from the project root (Dispatch)
  outputFileTracingRoot: path.resolve(__dirname),
  images: {
    remotePatterns: [
      // Classic Firebase Storage REST endpoint
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        pathname: '/v0/b/**', // allow any bucket path
      },
      // Alternate Google Storage endpoint (some URLs resolve here)
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/**',
      },
      // App Check / modern storage domains for your bucket
      // Replace dispatch-60ca7 with YOUR actual bucket name if different
      {
        protocol: 'https',
        hostname: 'dispatch-60ca7.firebasestorage.app',
        pathname: '/**',
      },
      // If your bucket is regionalized and uses a regional subdomain, add a wildcard:
      {
        protocol: 'https',
        hostname: '*.firebasestorage.app',
        pathname: '/**',
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;