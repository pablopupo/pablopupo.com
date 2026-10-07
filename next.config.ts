import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Media validation needs sharp's native library alongside its JavaScript.
  outputFileTracingIncludes: {
    "/api/admin/**": ["./node_modules/@img/sharp-*/**/*"],
  },
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
