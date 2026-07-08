import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    // Ensure the seed CSV is bundled with the demo-reset API route
    // on Vercel (serverless functions can't read arbitrary cwd files at runtime).
    "/api/demo-reset": ["./data/**/*"],
  },
};

export default nextConfig;
