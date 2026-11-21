import { Suspense } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { BottomTabBar } from "@/components/layout/BottomTabBar";

/**
 * 前台外壳：顶栏 + 底部 Tab。
 * 只包住 (shop) 路由组，不影响 /admin 与 /login。
 */
export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /* Apple 风格：居中窄栏、纯白底、靠留白分层，不用卡片阴影 */
    <div className="mx-auto flex min-h-dvh w-full max-w-[680px] flex-col bg-canvas">
      <TopBar />
      <main className="flex-1 pb-safe">{children}</main>
      <Suspense fallback={<BottomTabBarFallback />}>
        <BottomTabBar />
      </Suspense>
    </div>
  );
}

/** 静态外壳版底部导航（无选中态），与 BottomTabBar 视觉完全一致 */
function BottomTabBarFallback() {
  return (
    <nav
      aria-hidden
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline/60 bg-canvas/80 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex h-[52px] w-full max-w-[680px]">
        {["选购", "购物车", "订单"].map((label) => (
          <li
            key={label}
            className="flex flex-1 flex-col items-center justify-center gap-[3px]"
          >
            <span className="size-[22px] rounded-md bg-surface" />
            <span className="text-[10px] tracking-tight text-ink-3">{label}</span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
