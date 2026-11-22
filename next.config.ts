import type { NextConfig } from "next";

/**
 * 静态导出配置（GitHub Pages）
 *
 * 为什么用 export：
 *   GitHub Pages 只能托管静态文件，无法运行 Node 服务端。
 *   因此本项目改为「数据打包进构建产物」的纯静态站：
 *   - 商品数据在构建时从 Neon 读取，生成静态 HTML
 *   - 购物车用 localStorage，不依赖服务端
 *   - 后台、订单、登录在静态版中不参与构建
 *
 * output: "export" 会生成 out/ 目录，直接推到 gh-pages 分支即可。
 */
const nextConfig: NextConfig = {
  output: "export",

  // GitHub Pages 部署在子路径下（https://user.github.io/repo/），
  // 必须设置 basePath 和 assetPrefix，否则 CSS/JS/图片全部 404。
  // 通过环境变量控制，本地开发时为空。
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || "",

  images: {
    // 静态导出不支持 Next 的图片优化服务，必须关闭
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },

  // 静态导出时尾斜杠更稳（GitHub Pages 目录式托管）
  trailingSlash: true,

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
