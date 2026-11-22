/** @type {import('next').NextConfig} */
const path = require('path');
const { securityHeaders } = require('./security-headers');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // CSP, HSTS, frame and referrer policy on every response (security-headers.js).
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }];
  },
  output: 'standalone',
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