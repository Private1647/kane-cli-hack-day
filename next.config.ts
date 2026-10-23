import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // /admin moved to /ops (Hack OS). 308 so bookmarks and old links keep working.
  async redirects() {
    return [
      { source: "/admin", destination: "/ops", permanent: true },
      { source: "/admin/:path*", destination: "/ops/:path*", permanent: true },
    ];
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
