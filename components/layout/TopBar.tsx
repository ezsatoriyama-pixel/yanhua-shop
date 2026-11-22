import Link from "next/link";

/**
 * 顶栏（静态展示版）
 * 去掉了「查订单」——展示版没有订单功能，留着会是死链。
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
        <span className="text-[11px] tracking-tight text-ink-3">展示版</span>
      </div>
    </header>
  );
}
