"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { buildSpecKey, formatPrice, DEFAULT_SPEC_KEY } from "@/lib/sku";
import type { SpecSelection } from "@/lib/sku";
import { addToCart } from "@/lib/cart-storage";

export type SelectorSku = {
  id: string;
  specKey: string;
  specText: string;
  optionValues: Record<string, string>;
  priceCents: number;
  stock: number;
  image: string | null;
};

export type SpecGroup = {
  name: string;
  values: string[];
};

/**
 * 规格选择器（静态版）
 *
 * 与数据库版的唯一区别：加入购物车写入 localStorage，不调 Server Action。
 * 规格匹配逻辑完全保留：用 buildSpecKey 在 Map 里 O(1) 命中唯一 SKU。
 */
export function SkuSelector({
  skus,
  groups,
  productSlug,
  productTitle,
  coverImage,
}: {
  skus: SelectorSku[];
  groups: SpecGroup[];
  productSlug: string;
  productTitle: string;
  coverImage: string;
}) {
  const isSingleSku = groups.length === 0;
  const singleSku = skus.find((s) => s.specKey === DEFAULT_SPEC_KEY) ?? skus[0];

  const [selection, setSelection] = useState<SpecSelection>(() => {
    if (isSingleSku && singleSku) return singleSku.optionValues;
    return {};
  });
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"ok" | "error">("ok");

  const skuByKey = useMemo(
    () => new Map(skus.map((s) => [s.specKey, s])),
    [skus],
  );

  const currentKey = isSingleSku
    ? (singleSku?.specKey ?? "")
    : Object.keys(selection).length === groups.length
      ? buildSpecKey(selection)
      : "";

  const matched = currentKey ? (skuByKey.get(currentKey) ?? null) : null;

  /** 某规格值是否可选：代入后其余组遍历取值，有任一组合有货即可行 */
  function isValueAvailable(groupName: string, value: string): boolean {
    const base: SpecSelection = { ...selection, [groupName]: value };
    const unresolved = groups.filter((g) => !base[g.name]);

    if (unresolved.length === 0) {
      const sku = skuByKey.get(buildSpecKey(base));
      return Boolean(sku && sku.stock > 0);
    }

    let combos: SpecSelection[] = [base];
    for (const g of unresolved) {
      const next: SpecSelection[] = [];
      for (const c of combos) {
        for (const v of g.values) next.push({ ...c, [g.name]: v });
      }
      combos = next;
    }

    return combos.some((c) => {
      const sku = skuByKey.get(buildSpecKey(c));
      return Boolean(sku && sku.stock > 0);
    });
  }

  function pick(groupName: string, value: string) {
    setMessage(null);
    setSelection((prev) => ({ ...prev, [groupName]: value }));
    setQuantity(1);
  }

  const soldOut = matched ? matched.stock <= 0 : false;
  const canAdd = Boolean(matched) && !soldOut;

  function handleAdd() {
    if (!matched) return;
    addToCart({
      skuId: matched.id,
      productSlug,
      nameSnapshot: productTitle,
      specTextSnapshot: matched.specText,
      imageSnapshot: matched.image ?? coverImage,
      priceSnapshotCents: matched.priceCents,
      maxStock: matched.stock,
      quantity,
    });
    setMessageKind("ok");
    setMessage(`已加入购物车（${quantity} 件）`);
  }

  return (
    <section>
      {!isSingleSku && (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.name}>
              <p className="mb-2.5 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
                {group.name}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.values.map((value) => {
                  const selected = selection[group.name] === value;
                  const available = isValueAvailable(group.name, value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => pick(group.name, value)}
                      aria-pressed={selected}
                      className={`press rounded-xl px-4 py-2.5 text-[14px] tracking-tight transition-all ${
                        selected
                          ? "bg-surface font-medium text-ink ring-[1.5px] ring-ink"
                          : available
                            ? "bg-canvas text-ink ring-1 ring-hairline hover:ring-ink-3"
                            : "cursor-not-allowed bg-canvas text-ink-3/70 ring-1 ring-hairline/60 line-through"
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-end justify-between border-t border-hairline/60 pt-5">
        <div>
          {matched ? (
            <>
              <p className="tabular text-[28px] font-semibold tracking-display text-ink">
                {formatPrice(matched.priceCents)}
              </p>
              <p className="mt-1 text-[12px] tracking-tight text-ink-2">
                {matched.specText || "默认规格"}
                {soldOut ? (
                  <span className="ml-1.5 text-danger">已售罄</span>
                ) : (
                  <span className="ml-1.5 text-ink-3">· 库存 {matched.stock}</span>
                )}
              </p>
            </>
          ) : (
            <p className="text-[14px] tracking-tight text-ink-3">请选择完整规格</p>
          )}
        </div>

        {matched && (
          <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface">
            <Image
              src={matched.image || coverImage}
              alt=""
              fill
              sizes="56px"
              className="object-cover"
              unoptimized
            />
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-[13px] tracking-tight text-ink-2">数量</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            className="press grid size-9 place-items-center rounded-full text-[17px] text-ink ring-1 ring-hairline disabled:text-ink-3/50 disabled:ring-hairline/50"
            aria-label="减少数量"
          >
            −
          </button>
          <span className="tabular w-9 text-center text-[15px] font-medium">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(matched?.stock ?? 1, q + 1))}
            disabled={!matched || quantity >= matched.stock}
            className="press grid size-9 place-items-center rounded-full text-[17px] text-ink ring-1 ring-hairline disabled:text-ink-3/50 disabled:ring-hairline/50"
            aria-label="增加数量"
          >
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={!canAdd}
        className="press mt-5 w-full rounded-pill bg-accent py-3.5 text-[15px] font-medium tracking-tight text-white hover:bg-accent-hover disabled:bg-surface disabled:text-ink-3"
      >
        {soldOut ? "已售罄" : !matched ? "请选择规格" : "加入购物车"}
      </button>

      {message && (
        <div
          className={`mt-3 flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-[12px] tracking-tight ${
            messageKind === "ok"
              ? "bg-[#e8f8ee] text-[#00693a]"
              : "bg-[#fdecec] text-danger"
          }`}
        >
          <span>{message}</span>
          {messageKind === "ok" && (
            <Link
              href="/cart/"
              className="shrink-0 font-medium underline underline-offset-2"
            >
              去看购物车
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
