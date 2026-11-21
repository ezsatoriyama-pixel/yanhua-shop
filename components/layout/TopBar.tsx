import Link from "next/link";

/**
 * 顶栏 —— Apple 官网导航的移动端形态：
 * 极矮（44px）、毛玻璃、无实心分割线、店名小巧不抢戏。
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline/50 bg-canvas/80 backdrop-blur-xl">
      <div className="flex h-11 items-center justify-between px-5">
        <Link href="/" className="press flex items-center gap-2">
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            长夜烟花
          </span>
        </Link>
        <Link
          href="/orders/lookup"
          className="press rounded-pill px-3 py-1 text-[12px] text-ink-2 hover:text-ink"
        >
          查订单
        </Link>
      </div>
    </header>
  );
}
