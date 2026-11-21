"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const TABS = [
  { href: "/admin", label: "概览", exact: true },
  { href: "/admin/orders", label: "订单" },
  { href: "/admin/products", label: "商品" },
  { href: "/admin/categories", label: "分类" },
] as const;

/**
 * 后台顶部导航 —— 与前台保持同一套 Apple 视觉语言，
 * 但信息密度更高（后台是工具，不是展示页）。
 */
export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-hairline/60 bg-canvas/85 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex h-11 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold tracking-tight text-ink">
              长夜烟花
            </span>
            <span className="rounded-pill bg-surface px-2 py-0.5 text-[10px] tracking-tight text-ink-3">
              后台
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="press text-[12px] tracking-tight text-accent"
            >
              前台
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="press text-[12px] tracking-tight text-ink-3 hover:text-ink"
              title={email}
            >
              退出
            </button>
          </div>
        </div>

        <nav className="no-scrollbar flex gap-5 overflow-x-auto px-4">
          {TABS.map((tab) => {
            const active =
              "exact" in tab && tab.exact
                ? pathname === tab.href
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative shrink-0 whitespace-nowrap pb-2.5 pt-1 text-[13px] tracking-tight transition-colors ${
                  active ? "font-medium text-ink" : "text-ink-3 hover:text-ink-2"
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-ink" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
