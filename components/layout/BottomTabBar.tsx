"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "选购", icon: HomeIcon },
  { href: "/cart", label: "购物车", icon: CartIcon },
  { href: "/orders", label: "订单", icon: OrderIcon },
] as const;

/**
 * 底部 Tab —— Apple 官网移动端底部栏风格：
 * 毛玻璃背景 + 极细上边线 + 线性图标 + 10px 小字，
 * 选中态只靠颜色区分（Apple 蓝），不加背景块。
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
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`press flex h-full flex-col items-center justify-center gap-[3px] ${
                  active ? "text-accent" : "text-ink-3"
                }`}
              >
                <Icon active={active} />
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

function OrderIcon({ active }: { active: boolean }) {
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
      <path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-3.2-2.1-3.3 2.1-3.3-2.1-3.2 2.1v-16a1 1 0 0 1 1-1Z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </svg>
  );
}
