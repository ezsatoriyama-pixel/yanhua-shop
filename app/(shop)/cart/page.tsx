import { Suspense } from "react";
import Link from "next/link";
import { CartClient } from "@/components/cart/CartClient";

export const metadata = { title: "购物车" };

export default function CartPage() {
  return (
    <div>
      <header className="flex items-end justify-between px-5 pb-1 pt-8">
        <h1 className="tracking-display text-[28px] font-semibold text-ink">
          购物车
        </h1>
        <Link
          href="/"
          className="press pb-1.5 text-[13px] tracking-tight text-accent"
        >
          继续选购
        </Link>
      </header>
      <Suspense fallback={null}>
        <CartClient />
      </Suspense>
    </div>
  );
}
