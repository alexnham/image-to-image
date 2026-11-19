import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/projects/*/export": ["./public/fonts/**"],
    "/api/projects/*/edit": ["./public/fonts/**"],
    "/api/projects/*/text": ["./public/fonts/**"],
  },
  serverExternalPackages: ["sharp"],
  cacheComponents: true,
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
