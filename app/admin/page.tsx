import { Suspense } from "react";
import Link from "next/link";
import { getAdminStats, getAdminOrders } from "@/lib/admin/queries";
import { formatPrice } from "@/lib/sku";
import { OrderStatusBadge } from "@/components/order/OrderStatusBadge";

export const metadata = { title: "概览" };

export default function AdminHomePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const [stats, recentOrders] = await Promise.all([
    getAdminStats(),
    getAdminOrders(),
  ]);

  const today = recentOrders.filter(
    (o) => new Date(o.createdAt).toDateString() === new Date().toDateString(),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="tracking-display text-[26px] font-semibold text-ink">
          概览
        </h1>
        <p className="mt-1 text-[13px] tracking-tight text-ink-3">
          {new Date().toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </p>
      </div>

      {/* 关键指标 */}
      <section className="grid grid-cols-2 gap-3">
        <Stat
          label="待处理订单"
          value={String(stats.pendingOrders)}
          hint="需要确认"
          highlight={stats.pendingOrders > 0}
          href="/admin/orders?status=PENDING"
        />
        <Stat
          label="今日营业额"
          value={formatPrice(stats.todayRevenueCents)}
          hint={`${stats.todayOrders} 单`}
        />
        <Stat
          label="在售商品"
          value={String(stats.activeProducts)}
          hint="已上架"
          href="/admin/products?status=ACTIVE"
        />
        <Stat
          label="库存告急"
          value={String(stats.lowStockSkus)}
          hint="≤ 5 件"
          highlight={stats.lowStockSkus > 0}
          href="/admin/products"
        />
      </section>

      {/* 快捷操作 */}
      <section>
        <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
          快捷操作
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <QuickLink href="/admin/products/new" label="添加商品" primary />
          <QuickLink href="/admin/orders?status=PENDING" label="处理订单" />
        </div>
      </section>

      {/* 最近订单 */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
            最近订单
          </h2>
          <Link href="/admin/orders" className="text-[12px] text-accent">
            全部
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <p className="rounded-2xl bg-surface px-4 py-8 text-center text-[13px] tracking-tight text-ink-3">
            还没有订单
          </p>
        ) : (
          <ul className="divide-y divide-hairline/50">
            {recentOrders.slice(0, 5).map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="press flex items-center justify-between gap-3 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="tabular text-[13px] tracking-tight text-ink">
                      {o.orderNo}
                      {o.pickupNo && (
                        <span className="ml-2 text-ink-3">{o.pickupNo}</span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] tracking-tight text-ink-3">
                      {o.summary} · {o.itemCount} 件
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <OrderStatusBadge status={o.status} size="sm" />
                    <span className="tabular text-[13px] font-medium text-ink">
                      {formatPrice(o.totalCents)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {today.length > 0 && (
        <p className="text-center text-[11px] tracking-tight text-ink-3">
          今日已产生 {today.length} 笔订单
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  highlight,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
  href?: string;
}) {
  const inner = (
    <div
      className={`rounded-2xl p-4 ${highlight ? "bg-[#fff4e5]" : "bg-surface"}`}
    >
      <p className="text-[11px] tracking-tight text-ink-3">{label}</p>
      <p
        className={`tabular mt-1.5 text-[24px] font-semibold tracking-display ${highlight ? "text-warn" : "text-ink"}`}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[11px] tracking-tight text-ink-3">{hint}</p>
      )}
    </div>
  );

  return href ? (
    <Link href={href} className="press block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function QuickLink({
  href,
  label,
  primary,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`press block rounded-pill py-3 text-center text-[14px] font-medium tracking-tight ${
        primary
          ? "bg-accent text-white hover:bg-accent-hover"
          : "bg-surface text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-9 w-32 animate-pulse rounded bg-surface" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface" />
        ))}
      </div>
    </div>
  );
}
