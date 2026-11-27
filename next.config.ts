import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // forbidden() / app/forbidden.tsx (403 pro člena se špatnou rolí)
    authInterrupts: true,
  },
};

export default nextConfig;
