import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/sku";
import { OrderStatusBadge } from "@/components/order/OrderStatusBadge";
import { OrderActions } from "@/components/admin/OrderActions";

export const metadata = { title: "订单详情" };

/**
 * 后台订单详情。
 * 与前台不同：不过滤归属，管理员能看任何订单。
 * 鉴权由 /admin/layout.tsx 与各 action 负责。
 */
export default function AdminOrderDetailPage({
  params,
}: PageProps<"/admin/orders/[id]">) {
  return (
    <div>
      <div className="mb-3">
        <Link href="/admin/orders" className="press text-[13px] text-accent">
          ← 订单
        </Link>
      </div>
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent params={params} />
      </Suspense>
    </div>
  );
}

async function DetailContent({
  params,
}: Pick<PageProps<"/admin/orders/[id]">, "params">) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!order) notFound();

  const slotText =
    order.pickupSlotStart && order.pickupSlotEnd
      ? `${new Date(order.pickupSlotStart).toLocaleDateString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
        })} ${new Date(order.pickupSlotStart).toTimeString().slice(0, 5)}–${new Date(
          order.pickupSlotEnd,
        )
          .toTimeString()
          .slice(0, 5)}`
      : "—";

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="tabular tracking-display text-[24px] font-semibold text-ink">
            {order.orderNo}
          </h1>
          <div className="mt-1.5 flex items-center gap-2">
            <OrderStatusBadge status={order.status} />
            {order.pickupNo && (
              <span className="rounded-pill bg-surface px-2 py-0.5 text-[11px] tracking-tight text-ink-2">
                取货号 {order.pickupNo}
              </span>
            )}
          </div>
        </div>
        <OrderActions orderId={order.id} status={order.status} />
      </div>

      <dl className="divide-y divide-hairline/50 border-y border-hairline/50">
        <Row
          label="下单时间"
          value={new Date(order.createdAt).toLocaleString("zh-CN")}
        />
        <Row label="取货时间" value={slotText} />
        <Row label="门店" value={order.storeNameSnapshot ?? "—"} />
        <Row
          label="联系手机"
          value={
            order.guestPhone
              ? `${order.guestPhone.slice(0, 3)}****${order.guestPhone.slice(-4)}`
              : "—"
          }
        />
        {order.remark && <Row label="备注" value={order.remark} />}
        <Row
          label="订单来源"
          value={order.userId ? "登录用户" : "游客下单"}
        />
      </dl>

      <section className="pt-6">
        <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
          商品明细
        </h2>
        <ul className="space-y-3.5">
          {order.items.map((it) => (
            <li key={it.id} className="flex gap-3">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-surface">
                <Image
                  src={it.imageSnapshot || "/placeholder.svg"}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] tracking-tight text-ink">
                  {it.nameSnapshot}
                </p>
                <p className="text-[11px] tracking-tight text-ink-3">
                  {it.specTextSnapshot}
                  {it.specTextSnapshot ? " · " : ""}
                  {formatPrice(it.unitPriceCents)} × {it.quantity}
                </p>
              </div>
              <span className="tabular shrink-0 text-[13px] font-medium text-ink">
                {formatPrice(it.lineTotalCents)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex items-baseline justify-between border-t border-hairline/60 pt-4">
          <span className="text-[13px] tracking-tight text-ink-2">合计</span>
          <span className="tabular tracking-display text-[24px] font-semibold text-ink">
            {formatPrice(order.totalCents)}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed tracking-tight text-ink-3">
          金额为下单瞬间的快照，不受后续改价影响。取消订单会自动回补库存。
        </p>
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[12px] tracking-tight text-ink-2">{label}</dt>
      <dd className="text-right text-[12px] tracking-tight text-ink">{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-10 w-48 animate-pulse rounded bg-surface" />
      <div className="h-40 animate-pulse rounded-xl bg-surface" />
    </div>
  );
}
