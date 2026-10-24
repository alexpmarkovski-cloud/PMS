import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Maintenance-request photo uploads go through a server action
      // (5 photos × ~5MB cap, plus multipart overhead).
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
