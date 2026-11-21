import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { getCheckoutData } from "@/lib/queries/checkout";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "确认订单" };

export default function CheckoutPage() {
  return (
    <div>
      <header className="flex items-end justify-between px-5 pb-4 pt-8">
        <h1 className="tracking-display text-[28px] font-semibold text-ink">
          结账
        </h1>
        <Link
          href="/cart"
          className="press pb-1.5 text-[13px] tracking-tight text-accent"
        >
          返回购物袋
        </Link>
      </header>
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutContent />
      </Suspense>
    </div>
  );
}

async function CheckoutContent() {
  const viewer = await getViewer();
  const data = await getCheckoutData(viewer);

  if (data.lines.length === 0) redirect("/cart");

  return (
    <CheckoutForm
      lines={data.lines}
      slots={data.slots}
      store={data.store}
      needsAttention={data.needsAttention}
    />
  );
}

function CheckoutSkeleton() {
  return (
    <div className="space-y-7 px-5">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <div className="mb-3 h-3 w-16 animate-pulse rounded bg-surface" />
          <div className="h-12 animate-pulse rounded-xl bg-surface" />
        </div>
      ))}
    </div>
  );
}
