const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  turbopack: {
    root: path.resolve(__dirname)
  },
  experimental: {
    // Disk-cache compaction stalls local compiles on this workspace's storage.
    // Turbopack still keeps its in-memory development cache.
    turbopackFileSystemCacheForDev: false,
  },
  serverExternalPackages: ['@google/earthengine'],
  async rewrites() {
    return [
      {
        source: '/api/gdacs-feed',
        destination: 'https://gdacs.org/xml/rss.xml',
      },
    ];
  },
}

module.exports = nextConfig
