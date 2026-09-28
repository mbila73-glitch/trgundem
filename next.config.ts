import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow cross-origin dev requests from the preview-chat sandbox domain
  // (e.g. preview-chat-c48ba88b-...space-z.ai) so the preview panel can
  // load /_next/* assets without being rejected.
  allowedDevOrigins: [
    "https://preview-chat-c48ba88b-0eeb-406f-a214-77f092032917.space-z.ai",
    "*.space-z.ai",
    "*.chatglm.cn",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
};

export default nextConfig;
