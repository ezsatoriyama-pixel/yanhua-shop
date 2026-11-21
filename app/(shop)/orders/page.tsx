import { Suspense } from "react";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/order/OrderStatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { formatPrice } from "@/lib/sku";
import { getOrders } from "@/lib/queries/orders";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "订单" };

export default function OrdersPage() {
  return (
    <div>
      <header className="flex items-end justify-between px-5 pb-4 pt-8">
        <h1 className="tracking-display text-[28px] font-semibold text-ink">
          订单
        </h1>
        <Link
          href="/orders/lookup"
          className="press pb-1.5 text-[13px] tracking-tight text-accent"
        >
          查订单
        </Link>
      </header>
      <Suspense fallback={<OrdersSkeleton />}>
        <OrdersList />
      </Suspense>
    </div>
  );
}

async function OrdersList() {
  const viewer = await getViewer();
  const orders = await getOrders(viewer);

  if (orders.length === 0) {
    return (
      <EmptyState
        title="还没有订单"
        description="下单成功后，取货号和订单状态都会显示在这里。"
        actionLabel="去选购"
        actionHref="/"
      />
    );
  }

  return (
    <ul className="divide-y divide-hairline/50 px-5 pb-8">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.id}`} className="press block py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="tabular text-[13px] tracking-tight text-ink-3">
                  {o.orderNo}
                </p>
                <p className="mt-1 truncate text-[15px] font-medium tracking-tight text-ink">
                  {o.firstItemName}
                  {o.itemCount > 1 && (
                    <span className="font-normal text-ink-3">
                      {" "}
                      等 {o.itemCount} 件
                    </span>
                  )}
                </p>
              </div>
              <OrderStatusBadge status={o.status} />
            </div>

            <div className="mt-2.5 flex items-baseline justify-between">
              <span className="text-[12px] tracking-tight text-ink-3">
                {o.pickupNo ? (
                  <>
                    取货号{" "}
                    <span className="tabular font-medium text-ink">
                      {o.pickupNo}
                    </span>
                  </>
                ) : (
                  "无取货号"
                )}
                <span className="ml-2">
                  {new Date(o.createdAt).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </span>
              <span className="tabular text-[15px] font-medium tracking-tight text-ink">
                {formatPrice(o.totalCents)}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function OrdersSkeleton() {
  return (
    <div className="divide-y divide-hairline/50 px-5">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2 py-5">
          <div className="h-3 w-24 animate-pulse rounded bg-surface" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface" />
        </div>
      ))}
    </div>
  );
}
