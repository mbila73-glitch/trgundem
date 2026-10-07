import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // nodemailer standalone build'de çalışması için native modül olarak işaretle
  serverExternalPackages: ["nodemailer"],
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
  // Preview penceresi (preview-chat-*.space-z.ai) açıldığında trgundem.net'e yönlendir
  async redirects() {
    return [
      {
        source: "/(.*)",
        has: [
          { type: "host", value: "preview-chat-c48ba88b-0eeb-406f-a214-77f092032917.space-z.ai" },
        ],
        destination: "https://trgundem.net/$1",
        permanent: false,
      },
    ];
  },
  // RSS feed için standart URL'ler → /api/rss route'una yönlendir
  // /rss.xml, /feed.xml, /feed, /rss — feed reader'lar bu URL'leri arar
  async rewrites() {
    return [
      { source: "/rss.xml", destination: "/api/rss" },
      { source: "/feed.xml", destination: "/api/rss" },
      { source: "/feed", destination: "/api/rss" },
      { source: "/rss", destination: "/api/rss" },
    ];
  },
};

export default nextConfig;
