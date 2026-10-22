import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The API route reads the n8n Code-node scripts and sample price lists from disk.
  outputFileTracingIncludes: {
    "/api/analyze": ["./n8n/code/**/*", "./public/samples/**/*"],
    "/api/gem/collect": ["./n8n/code/gem.js"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
