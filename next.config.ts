import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

  images: {
    /**
     * 商品图在线上存于 Vercel Blob（形如 https://xxx.public.blob.vercel-storage.com/...），
     * next/image 默认只允许本站域名，必须显式放行，否则图片全部 400。
     * 本地开发用的是 /uploads/xxx.png，不走这里。
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
