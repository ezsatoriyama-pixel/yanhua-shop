import { Suspense } from "react";
import Link from "next/link";
import { CartView } from "@/components/cart/CartView";
import { getCartView } from "@/lib/queries/cart";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "购物袋" };

export default function CartPage() {
  return (
    <div>
      <header className="flex items-end justify-between px-5 pb-1 pt-8">
        <h1 className="tracking-display text-[28px] font-semibold text-ink">
          购物袋
        </h1>
        <Link
          href="/"
          className="press pb-1.5 text-[13px] tracking-tight text-accent"
        >
          继续选购
        </Link>
      </header>
      <Suspense fallback={<CartSkeleton />}>
        <CartContent />
      </Suspense>
    </div>
  );
}

async function CartContent() {
  const viewer = await getViewer();
  const cart = await getCartView(viewer);
  return (
    <CartView initialLines={cart.lines} hasUnavailable={cart.hasUnavailable} />
  );
}

function CartSkeleton() {
  return (
    <div className="px-5 py-6">
      <div className="space-y-6">
        {[0, 1].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="size-[72px] animate-pulse rounded-xl bg-surface" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 w-1/2 animate-pulse rounded bg-surface" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-surface" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 h-9 w-full animate-pulse rounded-pill bg-surface" />
    </div>
  );
}
