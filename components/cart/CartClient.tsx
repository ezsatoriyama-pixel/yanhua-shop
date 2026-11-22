"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { EmptyState } from "@/components/common/EmptyState";
import { formatPrice } from "@/lib/sku";
import {
  readCart,
  updateQuantity,
  removeItem,
  clearCart,
  cartTotal,
  cartCount,
  type CartItem,
} from "@/lib/cart-storage";

/**
 * 购物车页（静态版本地存储）
 */
export function CartClient() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setItems(readCart());
    setReady(true);

    const sync = () => setItems(readCart());
    window.addEventListener("cart-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("cart-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!ready) {
    return (
      <div className="space-y-4 px-5 py-6">
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
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="购物车是空的"
        description="挑几样喜欢的，选好规格就能加入购物车。"
        actionLabel="去选购"
        actionHref="/"
      />
    );
  }

  const total = cartTotal(items);
  const count = cartCount(items);

  return (
    <div className="px-5 pb-8">
      <div className="divide-y divide-hairline/50">
        {items.map((it) => (
          <div key={it.skuId} className="flex gap-4 py-5">
            <div className="relative size-[72px] shrink-0 overflow-hidden rounded-xl bg-surface">
              <Image
                src={it.imageSnapshot || "/placeholder.svg"}
                alt=""
                fill
                sizes="72px"
                className="object-cover"
                unoptimized
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/product/${it.productSlug}/`}
                    className="block truncate text-[15px] font-medium tracking-tight text-ink hover:underline"
                  >
                    {it.nameSnapshot}
                  </Link>
                  {it.specTextSnapshot && (
                    <p className="mt-0.5 truncate text-[12px] tracking-tight text-ink-3">
                      {it.specTextSnapshot}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setItems(removeItem(it.skuId))}
                  className="press shrink-0 rounded-pill px-2 py-1 text-[12px] tracking-tight text-ink-3 hover:text-danger"
                >
                  移除
                </button>
              </div>

              <div className="mt-auto flex items-end justify-between pt-3">
                <span className="tabular text-[15px] font-medium tracking-tight text-ink">
                  {formatPrice(it.priceSnapshotCents * it.quantity)}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setItems(updateQuantity(it.skuId, it.quantity - 1))
                    }
                    disabled={it.quantity <= 1}
                    className="press grid size-8 place-items-center rounded-full text-[16px] text-ink ring-1 ring-hairline disabled:text-ink-3/40"
                    aria-label="减少数量"
                  >
                    −
                  </button>
                  <span className="tabular w-7 text-center text-[14px] font-medium">
                    {it.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setItems(updateQuantity(it.skuId, it.quantity + 1))
                    }
                    disabled={it.quantity >= it.maxStock}
                    className="press grid size-8 place-items-center rounded-full text-[16px] text-ink ring-1 ring-hairline disabled:text-ink-3/40"
                    aria-label="增加数量"
                  >
                    +
                  </button>
                </div>
              </div>

              {it.quantity >= it.maxStock && (
                <p className="mt-2 text-right text-[11px] tracking-tight text-ink-3">
                  仅剩 {it.maxStock} 件
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 border-t border-hairline/60 pt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] tracking-tight text-ink-2">
            合计（{count} 件）
          </span>
          <span className="tabular tracking-display text-[28px] font-semibold text-ink">
            {formatPrice(total)}
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="rounded-xl bg-[#fff4e5] px-3.5 py-3 text-[12px] leading-relaxed tracking-tight text-warn">
          这是展示版：购物车保存在你当前浏览器里，清空浏览器数据会丢失，也不能在线下单。
          如需购买请联系店主，或到店选购。
        </div>

        <button
          type="button"
          onClick={() => {
            if (confirm("确定清空购物车？")) {
              clearCart();
              setItems([]);
            }
          }}
          className="press w-full rounded-pill bg-surface py-3 text-[14px] font-medium tracking-tight text-ink-2"
        >
          清空购物车
        </button>

        <Link
          href="/"
          className="press block rounded-pill bg-accent py-3.5 text-center text-[15px] font-medium tracking-tight text-white hover:bg-accent-hover"
        >
          继续选购
        </Link>
      </div>
    </div>
  );
}

/** 底栏角标用 */
export function CartBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(cartCount(readCart()));
    sync();
    window.addEventListener("cart-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("cart-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (count === 0) return null;

  return (
    <span className="absolute -right-1 -top-1 grid min-w-[16px] place-items-center rounded-full bg-danger px-1 text-[9px] font-medium leading-[16px] text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
