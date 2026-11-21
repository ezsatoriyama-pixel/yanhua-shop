"use client";

import Image from "next/image";
import { formatPrice } from "@/lib/sku";

export type CartLineData = {
  id: string;
  nameSnapshot: string;
  specTextSnapshot: string;
  /** 加入购物车时的快照价 —— 不是商品当前价 */
  priceSnapshotCents: number;
  quantity: number;
  imageSnapshot: string | null;
  /** 当前 SKU 库存，用于卡住数量上限 */
  maxStock: number;
  /** 商品已下架 / SKU 停用时为 false，本行不参与结算 */
  available?: boolean;
};

/**
 * 购物车行 —— Apple 商店购物袋的行样式：
 *  缩略图 + 两行文字 + 右侧金额，分隔用极浅横线，
 *  数量控件是圆形轻描边按钮。
 */
export function CartLine({
  line,
  onQuantityChange,
  onRemove,
  pending = false,
}: {
  line: CartLineData;
  onQuantityChange: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  pending?: boolean;
}) {
  const unavailable = line.available === false;
  const canDec = line.quantity > 1 && !pending && !unavailable;
  const canInc = line.quantity < line.maxStock && !pending && !unavailable;

  return (
    <div
      className={`flex gap-4 py-5 ${unavailable ? "opacity-45" : ""}`}
      aria-busy={pending}
    >
      <div className="relative size-[72px] shrink-0 overflow-hidden rounded-xl bg-surface">
        <Image
          src={line.imageSnapshot || "/placeholder.svg"}
          alt=""
          fill
          sizes="72px"
          className="object-cover"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium tracking-tight text-ink">
              {line.nameSnapshot}
            </p>
            {line.specTextSnapshot && (
              <p className="mt-0.5 truncate text-[12px] tracking-tight text-ink-3">
                {line.specTextSnapshot}
              </p>
            )}
            {unavailable && (
              <p className="mt-1 text-[11px] font-medium tracking-tight text-danger">
                已下架，不参与结算
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(line.id)}
            disabled={pending}
            className="press shrink-0 rounded-pill px-2 py-1 text-[12px] tracking-tight text-ink-3 hover:text-danger disabled:opacity-40"
            aria-label={`删除 ${line.nameSnapshot}`}
          >
            移除
          </button>
        </div>

        <div className="mt-auto flex items-end justify-between pt-3">
          <span className="tabular text-[15px] font-medium tracking-tight text-ink">
            {formatPrice(line.priceSnapshotCents * line.quantity)}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onQuantityChange(line.id, line.quantity - 1)}
              disabled={!canDec}
              className="press grid size-8 place-items-center rounded-full text-[16px] text-ink ring-1 ring-hairline disabled:text-ink-3/40 disabled:ring-hairline/50"
              aria-label="减少数量"
            >
              −
            </button>
            <span className="tabular w-7 text-center text-[14px] font-medium">
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => onQuantityChange(line.id, line.quantity + 1)}
              disabled={!canInc}
              className="press grid size-8 place-items-center rounded-full text-[16px] text-ink ring-1 ring-hairline disabled:text-ink-3/40 disabled:ring-hairline/50"
              aria-label="增加数量"
            >
              +
            </button>
          </div>
        </div>

        {!unavailable && line.quantity >= line.maxStock && (
          <p className="mt-2 text-right text-[11px] tracking-tight text-ink-3">
            仅剩 {line.maxStock} 件
          </p>
        )}
      </div>
    </div>
  );
}
