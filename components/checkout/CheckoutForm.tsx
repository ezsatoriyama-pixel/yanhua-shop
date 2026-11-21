"use client";

import { useRef, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/sku";
import { createOrder } from "@/app/actions/order";
import type { CheckoutLine } from "@/lib/queries/checkout";

export type PickupSlotOption = {
  id: string;
  label: string;
  remaining: number | null;
  disabled: boolean;
};

/**
 * 结算表单 —— Apple 结账页结构：
 *  分组（取货门店 / 时间段 / 联系方式 / 订单明细），
 *  每组用「小号灰色标题 + 内容」排版，组之间靠留白分隔，不用卡片。
 *
 * 幂等：requestId 只生成一次并存在 useRef，失败重试复用。
 * 绝不发送任何价格字段。
 */
export function CheckoutForm({
  lines,
  slots,
  store,
  needsAttention,
}: {
  lines: CheckoutLine[];
  slots: PickupSlotOption[];
  store: { name: string; address: string; phone: string } | null;
  needsAttention: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState("");
  const [remark, setRemark] = useState("");
  const [slotId, setSlotId] = useState<string>(
    slots.find((s) => !s.disabled)?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef<string | null>(null);
  function getRequestId(): string {
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    return requestIdRef.current;
  }

  const usable = lines.filter((l) => l.available);
  const totalCents = usable.reduce((s, l) => s + l.lineTotalCents, 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^1\d{10}$/.test(phone)) {
      setError("请填写 11 位手机号，取货叫号需要联系你");
      return;
    }
    if (!slotId) {
      setError("请选择取货时间段");
      return;
    }
    if (usable.length === 0) {
      setError("没有可结算的商品，请返回购物袋调整");
      return;
    }

    startTransition(async () => {
      const result = await createOrder({
        requestId: getRequestId(),
        cartItemIds: usable.map((l) => l.cartItemId),
        pickupSlotId: slotId,
        phone,
        remark: remark || undefined,
      });

      if (result.ok) {
        router.push(`/orders/${result.data.orderId}`);
        return;
      }
      setError(result.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="px-5 pb-8">
      {needsAttention && (
        <p className="mb-5 rounded-xl bg-[#fff4e5] px-3.5 py-2.5 text-[12px] leading-relaxed tracking-tight text-warn">
          部分商品价格有变化或已失效，金额已按当前价格重算，请确认后再提交。
        </p>
      )}

      {/* 取货门店 */}
      <Group title="取货门店">
        <p className="text-[15px] font-medium tracking-tight text-ink">
          {store?.name ?? "门店信息未配置"}
        </p>
        {store && (
          <p className="mt-1 text-[12px] leading-relaxed tracking-tight text-ink-2">
            {store.address}
            <br />
            {store.phone}
          </p>
        )}
      </Group>

      {/* 时间段 */}
      <Group title="取货时间">
        {slots.length === 0 ? (
          <p className="text-[13px] tracking-tight text-ink-3">
            暂无可选时间段，请联系店主。
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((slot) => {
              const active = slotId === slot.id;
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setSlotId(slot.id)}
                  disabled={slot.disabled}
                  aria-pressed={active}
                  className={`press rounded-xl px-2 py-2.5 text-[12px] tracking-tight transition-all ${
                    active
                      ? "bg-surface font-medium text-ink ring-[1.5px] ring-ink"
                      : slot.disabled
                        ? "cursor-not-allowed bg-canvas text-ink-3/60 ring-1 ring-hairline/60"
                        : "bg-canvas text-ink ring-1 ring-hairline hover:ring-ink-3"
                  }`}
                >
                  <span className="block">{slot.label}</span>
                  <span className="mt-0.5 block text-[10px] text-ink-3">
                    {slot.disabled
                      ? "已约满"
                      : slot.remaining === null
                        ? "不限"
                        : `余 ${slot.remaining}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Group>

      {/* 联系方式 */}
      <Group title="联系方式">
        <input
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) =>
            setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))
          }
          placeholder="11 位手机号"
          className="w-full rounded-xl bg-surface px-4 py-3 text-[15px] tracking-tight text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
        />
        <textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value.slice(0, 100))}
          rows={2}
          placeholder="备注（可选）：需要礼盒包装、到店请电话联系"
          className="mt-2.5 w-full resize-none rounded-xl bg-surface px-4 py-3 text-[14px] tracking-tight text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
        />
      </Group>

      {/* 明细 */}
      <Group title="订单明细">
        <ul className="space-y-3">
          {lines.map((l) => (
            <li key={l.cartItemId} className="flex justify-between gap-4">
              <span className="min-w-0">
                <span className="block truncate text-[14px] tracking-tight text-ink">
                  {l.name}
                </span>
                <span className="text-[12px] tracking-tight text-ink-3">
                  {l.specText}
                  {l.specText ? " · " : ""}×{l.quantity}
                </span>
                {!l.available && (
                  <span className="mt-0.5 block text-[11px] tracking-tight text-danger">
                    {l.unavailableReason}，不参与结算
                  </span>
                )}
                {l.available && l.priceChanged && (
                  <span className="mt-0.5 block text-[11px] tracking-tight text-warn">
                    价格已从 {formatPrice(l.snapshotPriceCents)} 调整为{" "}
                    {formatPrice(l.unitPriceCents)}
                  </span>
                )}
              </span>
              <span className="tabular shrink-0 text-[14px] tracking-tight text-ink">
                {formatPrice(l.lineTotalCents)}
              </span>
            </li>
          ))}
        </ul>
      </Group>

      {/* 总计 */}
      <div className="mt-2 border-t border-hairline/60 pt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] tracking-tight text-ink-2">应付金额</span>
          <span className="tabular tracking-display text-[28px] font-semibold text-ink">
            {formatPrice(totalCents)}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed tracking-tight text-ink-3">
          暂不支持在线支付，提交后订单为「待处理」，到店付款取货。
        </p>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-[#fdecec] px-3.5 py-2.5 text-[12px] leading-relaxed tracking-tight text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || usable.length === 0}
        className="press mt-6 w-full rounded-pill bg-accent py-3.5 text-[15px] font-medium tracking-tight text-white hover:bg-accent-hover disabled:bg-surface disabled:text-ink-3"
      >
        {pending ? "提交中…" : "提交订单"}
      </button>

      <p className="mt-3 text-center text-[11px] tracking-tight text-ink-3">
        金额以服务端确认结果为准
      </p>
    </form>
  );
}

/** Apple 结账页的分组：小写标题 + 内容，无卡片无描边 */
function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
        {title}
      </h2>
      {children}
    </section>
  );
}
