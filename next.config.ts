import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The API route reads the n8n Code-node scripts and sample price lists from disk.
  outputFileTracingIncludes: {
    "/api/analyze": ["./n8n/code/**/*", "./public/samples/**/*"],
    // The home page shows the demo report, built by the same rules.
    "/": ["./n8n/code/**/*", "./public/samples/**/*"],
    "/api/gem/collect": ["./n8n/code/gem.js"],
  },
  partialPrefetching: true,
  // Bid documents are read on the server with pdf.js (/api/tenders/documents).
  serverExternalPackages: ["pdfjs-dist"],
  // The tender list used to live at "/": send old bookmarks with filters to its new address.
  async redirects() {
    return ["tab", "q", "category", "keyword", "ministry", "sort"].map((key) => ({
      source: "/",
      has: [{ type: "query" as const, key }],
      destination: "/tenders",
      permanent: false,
    }));
  },
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
