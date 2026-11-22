"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CartBadge } from "@/components/cart/CartClient";

const TABS = [
  { href: "/", label: "选购", icon: HomeIcon },
  { href: "/cart/", label: "购物车", icon: CartIcon },
] as const;

/**
 * 底部 Tab（静态版）
 * 只有「选购」和「购物车」——订单功能需要服务端，展示版不提供。
 */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline/60 bg-canvas/80 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex h-[52px] w-full max-w-[680px]">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" || pathname === "" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`press relative flex h-full flex-col items-center justify-center gap-[3px] ${
                  active ? "text-accent" : "text-ink-3"
                }`}
              >
                <span className="relative">
                  <Icon active={active} />
                  {href === "/cart/" && <CartBadge />}
                </span>
                <span className="text-[10px] tracking-tight">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 1.9 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 10.2 12 3.5l8 6.7" />
      <path d="M6.2 9.2V20h11.6V9.2" />
    </svg>
  );
}

function CartIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 1.9 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 5h1.8l2.1 9.6a1.4 1.4 0 0 0 1.4 1.1h7.6a1.4 1.4 0 0 0 1.4-1.1L19.5 8.5H6.3" />
      <circle cx="9.6" cy="19.4" r="1.2" />
      <circle cx="17.2" cy="19.4" r="1.2" />
    </svg>
  );
}
