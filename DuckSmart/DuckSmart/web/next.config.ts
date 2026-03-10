import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  images: {
    remotePatterns: [
      // Firebase Storage — hunt photos
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      // Google user avatars
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      // Firebase Storage (new domain)
      {
        protocol: "https",
        hostname: "*.firebasestorage.app",
      },
    ],
  },
};

export default nextConfig;
