import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Prevent third-party sites from embedding the wallet iframe
        source: "/wallet/local",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self';" },
        ],
      },
    ];
  },
  // Suppress warnings for packages that use node built-ins on server only
  serverExternalPackages: ["@simplewebauthn/server", "pg", "ioredis"],
};

export default nextConfig;
