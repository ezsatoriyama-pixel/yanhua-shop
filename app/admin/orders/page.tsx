import { Suspense } from "react";
import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { getAdminOrders } from "@/lib/admin/queries";
import { formatPrice } from "@/lib/sku";
import { OrderStatusBadge } from "@/components/order/OrderStatusBadge";
import { OrderActions } from "@/components/admin/OrderActions";

export const metadata = { title: "订单" };

const FILTERS: { value: OrderStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "全部" },
  { value: "PENDING", label: "待处理" },
  { value: "CONFIRMED", label: "已确认" },
  { value: "COMPLETED", label: "已完成" },
  { value: "CANCELLED", label: "已取消" },
];

export default function AdminOrdersPage({
  searchParams,
}: PageProps<"/admin/orders">) {
  return (
    <div>
      <header className="mb-5">
        <h1 className="tracking-display text-[26px] font-semibold text-ink">
          订单
        </h1>
      </header>
      <Suspense fallback={<OrdersSkeleton />}>
        <OrdersContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OrdersContent({
  searchParams,
}: Pick<PageProps<"/admin/orders">, "searchParams">) {
  const { status, q } = await searchParams;
  const statusFilter = (
    typeof status === "string" ? status : "ALL"
  ) as OrderStatus | "ALL";
  const query = typeof q === "string" ? q : undefined;

  const orders = await getAdminOrders({ status: statusFilter, q: query });

  return (
    <>
      {/* 状态筛选 */}
      <nav className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => {
          const active = statusFilter === f.value;
          const href =
            f.value === "ALL" ? "/admin/orders" : `/admin/orders?status=${f.value}`;
          return (
            <Link
              key={f.value}
              href={href}
              scroll={false}
              className={`press shrink-0 rounded-pill px-3.5 py-1.5 text-[12px] tracking-tight ${
                active
                  ? "bg-ink text-white"
                  : "bg-surface text-ink-2 hover:text-ink"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {/* 搜索 */}
      <form action="/admin/orders" className="mb-5">
        {statusFilter !== "ALL" && (
          <input type="hidden" name="status" value={statusFilter} />
        )}
        <input
          name="q"
          defaultValue={query}
          placeholder="搜索订单号或手机号"
          className="w-full rounded-xl bg-surface px-4 py-2.5 text-[13px] tracking-tight text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
        />
      </form>

      {orders.length === 0 ? (
        <p className="rounded-2xl bg-surface px-4 py-12 text-center text-[13px] tracking-tight text-ink-3">
          没有符合条件的订单
        </p>
      ) : (
        <ul className="divide-y divide-hairline/50">
          {orders.map((o) => (
            <li key={o.id} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="press min-w-0 flex-1"
                >
                  <div className="flex items-center gap-2">
                    <p className="tabular text-[14px] font-medium tracking-tight text-ink">
                      {o.orderNo}
                    </p>
                    <OrderStatusBadge status={o.status} size="sm" />
                  </div>
                  <p className="mt-1 truncate text-[12px] tracking-tight text-ink-3">
                    {o.summary} · {o.itemCount} 件
                  </p>
                  <p className="mt-0.5 text-[11px] tracking-tight text-ink-3">
                    {o.pickupNo ? `取货号 ${o.pickupNo}` : "无取货号"}
                    {o.guestPhone && ` · ${o.guestPhone.slice(0, 3)}****${o.guestPhone.slice(-4)}`}
                    {" · "}
                    {new Date(o.createdAt).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="tabular text-[15px] font-semibold tracking-tight text-ink">
                    {formatPrice(o.totalCents)}
                  </span>
                  <OrderActions orderId={o.id} status={o.status} size="sm" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-center text-[11px] tracking-tight text-ink-3">
        共 {orders.length} 笔（最多显示 100 笔）
      </p>
    </>
  );
}

function OrdersSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />
      ))}
    </div>
  );
}
