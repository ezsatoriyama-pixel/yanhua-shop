"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CartLine } from "@/components/cart/CartLine";
import { EmptyState } from "@/components/common/EmptyState";
import { formatPrice } from "@/lib/sku";
import { updateCartItemQuantity, removeCartItem } from "@/app/actions/cart";
import type { CartLineView } from "@/lib/queries/cart";

/**
 * 购物车视图 —— Apple 商店购物袋结构：
 *  顶部「购物袋」大标题 → 商品行（细线分隔）→ 合计区 → 蓝色胶囊结算按钮
 * 金额用大号紧字距，Apple 习惯把总数做得比明细更醒目。
 */
export function CartView({
  initialLines,
  hasUnavailable,
}: {
  initialLines: CartLineView[];
  hasUnavailable: boolean;
}) {
  const [lines, setLines] = useState(initialLines);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const availableLines = lines.filter((l) => l.available !== false);
  const totalCents = availableLines.reduce(
    (sum, l) => sum + l.priceSnapshotCents * l.quantity,
    0,
  );
  const totalCount = availableLines.reduce((sum, l) => sum + l.quantity, 0);

  function handleQuantityChange(id: string, quantity: number) {
    const snapshot = lines;
    setLines((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, quantity: Math.max(1, Math.min(quantity, l.maxStock)) }
          : l,
      ),
    );
    setPendingId(id);
    setError(null);

    startTransition(async () => {
      const result = await updateCartItemQuantity(id, quantity);
      setPendingId(null);
      if (!result.ok) {
        setLines(snapshot);
        setError(result.message);
        return;
      }
      if (result.data.quantity !== quantity && result.data.quantity > 0) {
        setLines((prev) =>
          prev.map((l) =>
            l.id === id ? { ...l, quantity: result.data.quantity } : l,
          ),
        );
      }
    });
  }

  function handleRemove(id: string) {
    const snapshot = lines;
    setLines((prev) => prev.filter((l) => l.id !== id));
    setPendingId(id);
    setError(null);

    startTransition(async () => {
      const result = await removeCartItem(id);
      setPendingId(null);
      if (!result.ok) {
        setLines(snapshot);
        setError(result.message);
      }
    });
  }

  if (lines.length === 0) {
    return (
      <EmptyState
        title="购物袋是空的"
        description="挑几样喜欢的，选好规格就能下单。"
        actionLabel="去选购"
        actionHref="/"
      />
    );
  }

  return (
    <div className="px-5 pb-8">
      {hasUnavailable && (
        <p className="mb-3 rounded-xl bg-[#fff4e5] px-3.5 py-2.5 text-[12px] leading-relaxed tracking-tight text-warn">
          部分商品已下架或售罄，不参与结算。请移除后再提交。
        </p>
      )}
      {error && (
        <p className="mb-3 rounded-xl bg-[#fdecec] px-3.5 py-2.5 text-[12px] leading-relaxed tracking-tight text-danger">
          {error}
        </p>
      )}

      <div className="divide-y divide-hairline/50">
        {lines.map((line) => (
          <CartLine
            key={line.id}
            line={line}
            onQuantityChange={handleQuantityChange}
            onRemove={handleRemove}
            pending={pendingId === line.id}
          />
        ))}
      </div>

      {/* 合计：Apple 把总价放大并右对齐 */}
      <div className="mt-2 border-t border-hairline/60 pt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] tracking-tight text-ink-2">
            合计（{totalCount} 件）
          </span>
          <span className="tabular tracking-display text-[28px] font-semibold text-ink">
            {formatPrice(totalCents)}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed tracking-tight text-ink-3">
          按加入购物袋时的价格计算，最终金额下单时由服务端确认。
        </p>
      </div>

      <div className="mt-6">
        {totalCount === 0 ? (
          <div className="rounded-pill bg-surface py-3.5 text-center text-[15px] font-medium tracking-tight text-ink-3">
            没有可结算商品
          </div>
        ) : (
          <Link
            href="/checkout"
            className="press block rounded-pill bg-accent py-3.5 text-center text-[15px] font-medium tracking-tight text-white hover:bg-accent-hover"
          >
            去结算
          </Link>
        )}
      </div>
    </div>
  );
}
