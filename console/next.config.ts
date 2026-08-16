import type { NextConfig } from 'next';

// better-sqlite3 ships a native addon; it must stay external to the server
// bundle instead of being processed by webpack/turbopack.
const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
