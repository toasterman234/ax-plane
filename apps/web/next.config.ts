import type { NextConfig } from 'next';
import { resolve } from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
};

export default nextConfig;
