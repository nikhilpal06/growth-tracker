import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output produces a self-contained server.js for the Docker image.
  output: "standalone",
};

export default nextConfig;
