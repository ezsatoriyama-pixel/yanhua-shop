"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateSkuPrice,
  updateSkuStock,
  setSkuActive,
  setProductStatus,
} from "@/app/actions/admin-products";

/** 内联可编辑的数字单元格：点进去改，失焦或回车保存 */
function InlineNumber({
  value,
  onSave,
  suffix,
  step = 1,
  min = 0,
}: {
  value: number;
  onSave: (v: number) => Promise<{ ok: boolean; message?: string }>;
  suffix?: string;
  step?: number;
  min?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function commit() {
    setEditing(false);
    const num = Number(draft);
    if (!Number.isFinite(num) || num < min || num === value) {
      setDraft(String(value));
      return;
    }
    startTransition(async () => {
      const r = await onSave(num);
      if (!r.ok) {
        setErr(r.message ?? "保存失败");
        setDraft(String(value));
      } else {
        setErr(null);
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        className="press tabular rounded-md px-1.5 py-0.5 text-[13px] text-ink hover:bg-surface"
        title="点击修改"
      >
        {pending ? "…" : value}
        {suffix && <span className="text-[11px] text-ink-3">{suffix}</span>}
        {err && <span className="ml-1 text-[10px] text-danger">!</span>}
      </button>
    );
  }

  return (
    <input
      autoFocus
      type="number"
      step={step}
      min={min}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(String(value));
          setEditing(false);
        }
      }}
      className="tabular w-20 rounded-md bg-surface px-1.5 py-0.5 text-[13px] text-ink outline-none ring-[1.5px] ring-accent"
    />
  );
}

/** SKU 行 */
export function SkuRow({
  sku,
}: {
  sku: {
    id: string;
    specText: string;
    priceCents: number;
    stock: number;
    isActive: boolean;
  };
}) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="min-w-0 flex-1">
        <span
          className={`text-[12px] tracking-tight ${sku.isActive ? "text-ink" : "text-ink-3 line-through"}`}
        >
          {sku.specText || "默认规格"}
        </span>
        {!sku.isActive && (
          <span className="ml-1.5 text-[10px] text-ink-3">已停用</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <InlineNumber
          value={sku.priceCents / 100}
          step={0.01}
          onSave={async (v) => updateSkuPrice(sku.id, v)}
          suffix=" 元"
        />
        <span className="text-ink-3">/</span>
        <InlineNumber
          value={sku.stock}
          onSave={async (v) => updateSkuStock(sku.id, v)}
          suffix=" 件"
        />
        <button
          type="button"
          onClick={async () => {
            await setSkuActive(sku.id, !sku.isActive);
            router.refresh();
          }}
          className="press ml-1 rounded-pill px-2 py-0.5 text-[10px] tracking-tight text-ink-3 hover:bg-surface hover:text-ink"
        >
          {sku.isActive ? "停用" : "启用"}
        </button>
      </div>
    </div>
  );
}

/** 商品上下架切换 */
export function ProductStatusToggle({
  productId,
  status,
}: {
  productId: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const next = status === "ACTIVE" ? "DRAFT" : "ACTIVE";
  const label =
    status === "ACTIVE" ? "下架" : status === "ARCHIVED" ? "恢复上架" : "上架";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setProductStatus(productId, next);
          router.refresh();
        })
      }
      className={`press rounded-pill px-3 py-1 text-[11px] font-medium tracking-tight disabled:opacity-40 ${
        status === "ACTIVE"
          ? "bg-surface text-ink-2"
          : "bg-accent text-white hover:bg-accent-hover"
      }`}
    >
      {pending ? "…" : label}
    </button>
  );
}
