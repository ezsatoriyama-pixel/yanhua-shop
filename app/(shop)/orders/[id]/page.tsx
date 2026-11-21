import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { OrderStatusBadge } from "@/components/order/OrderStatusBadge";
import { formatPrice } from "@/lib/sku";
import { getOrderForViewer } from "@/app/actions/order";

/**
 * 订单详情 —— Apple 订单确认页结构：
 *  取货号作为绝对主角（超大字号居中）→ 信息列表 → 商品明细 → 合计
 *  信息列表用「左灰右黑」两列对齐，行间极细线。
 */
export default function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  return (
    <div>
      <div className="px-5 py-2.5">
        <Link
          href="/orders"
          className="press inline-flex items-center gap-1 text-[13px] tracking-tight text-accent"
        >
          <ChevronLeft />
          订单
        </Link>
      </div>
      <Suspense fallback={<OrderDetailSkeleton />}>
        <OrderDetail params={params} />
      </Suspense>
    </div>
  );
}

async function OrderDetail({
  params,
}: Pick<PageProps<"/orders/[id]">, "params">) {
  const { id } = await params;
  const order = await getOrderForViewer(id);

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

  const hasPickup = Boolean(order.pickupNo) && order.status !== "CANCELLED";

  return (
    <div className="pb-8">
      {/* 取货号：主角 */}
      <section className="px-5 pb-8 pt-4 text-center">
        {hasPickup ? (
          <>
            <p className="text-[12px] uppercase tracking-[0.08em] text-ink-3">
              到店报此号取货
            </p>
            <p className="tabular tracking-display mt-2 text-[64px] font-semibold leading-none text-ink">
              {order.pickupNo}
            </p>
            <p className="mt-3 text-[13px] tracking-tight text-ink-2">
              {slotText}
            </p>
          </>
        ) : (
          <p className="py-8 text-[14px] tracking-tight text-ink-3">
            {order.status === "CANCELLED"
              ? "订单已取消，无取货号"
              : "订单确认后生成取货号"}
          </p>
        )}
      </section>

      {/* 状态 */}
      <div className="flex items-center justify-between border-y border-hairline/50 bg-surface px-5 py-3.5">
        <span className="text-[13px] tracking-tight text-ink-2">当前状态</span>
        <OrderStatusBadge status={order.status} />
      </div>

      {/* 信息列表 */}
      <dl className="divide-y divide-hairline/50 px-5">
        <Row label="订单号" value={order.orderNo} mono />
        <Row
          label="下单时间"
          value={new Date(order.createdAt).toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        />
        <Row label="取货时间" value={slotText} />
        <Row label="门店" value={order.storeNameSnapshot ?? "—"} />
        {order.guestPhone && (
          <Row
            label="手机"
            value={`${order.guestPhone.slice(0, 3)}****${order.guestPhone.slice(-4)}`}
          />
        )}
        {order.remark && <Row label="备注" value={order.remark} />}
      </dl>

      {/* 商品 */}
      <section className="px-5 pt-8">
        <h2 className="mb-4 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
          商品明细
        </h2>
        <ul className="space-y-4">
          {order.items.map((it) => (
            <li key={it.id} className="flex gap-3.5">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface">
                <Image
                  src={it.imageSnapshot || "/placeholder.svg"}
                  alt=""
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium tracking-tight text-ink">
                  {it.nameSnapshot}
                </p>
                <p className="mt-0.5 text-[12px] tracking-tight text-ink-3">
                  {it.specTextSnapshot}
                  {it.specTextSnapshot ? " · " : ""}×{it.quantity}
                </p>
              </div>
              <span className="tabular shrink-0 text-[14px] font-medium tracking-tight text-ink">
                {formatPrice(it.lineTotalCents)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-baseline justify-between border-t border-hairline/60 pt-5">
          <span className="text-[13px] tracking-tight text-ink-2">合计</span>
          <span className="tabular tracking-display text-[28px] font-semibold text-ink">
            {formatPrice(order.totalCents)}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed tracking-tight text-ink-3">
          金额与商品信息为下单瞬间的记录，后续改价不影响本单。
        </p>
      </section>
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 6 9 12l5.5 6" />
    </svg>
  );
}

function OrderDetailSkeleton() {
  return (
    <div className="px-5">
      <div className="mx-auto h-16 w-32 animate-pulse rounded-xl bg-surface" />
      <div className="mt-8 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-surface" />
        ))}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="shrink-0 text-[13px] tracking-tight text-ink-2">{label}</dt>
      <dd
        className={`text-right text-[13px] tracking-tight text-ink ${mono ? "tabular" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
