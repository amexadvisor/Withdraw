/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tell Next.js to load these packages directly from node_modules
  // at runtime instead of bundling them into the server chunks.
  // @ton/ton has export patterns that Next's bundler (webpack and
  // Turbopack) mis-resolves, which is why WalletContractV5R1 comes
  // back undefined even though it exists in the installed package.
  serverExternalPackages: ['@ton/ton', '@ton/core', '@ton/crypto'],
};

module.exports = nextConfig;
