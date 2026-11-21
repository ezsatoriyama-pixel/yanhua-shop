import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "长夜烟花",
    template: "%s · 长夜烟花",
  },
  description: "选规格、看实时库存、预约取货时段。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ffffff",
};

/**
 * 根布局只负责 html/body 与全局样式。
 *
 * 前台外壳（顶栏 + 底部 Tab）在 app/(shop)/layout.tsx，
 * 后台外壳在 app/admin/layout.tsx —— 两者互不污染。
 * 如果把顶栏写在这里，后台页面也会被套上前台导航。
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
