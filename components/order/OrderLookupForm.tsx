"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lookupOrderByPhone } from "@/app/actions/order";

/**
 * 查单表单 —— Apple 表单语言：
 *  浅灰填充输入框、无描边、聚焦时 Apple 蓝细环。
 */
export function OrderLookupForm() {
  const router = useRouter();
  const [orderNo, setOrderNo] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!orderNo.trim()) {
      setError("请填写订单号");
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      setError("请填写 11 位手机号");
      return;
    }

    startTransition(async () => {
      const result = await lookupOrderByPhone(orderNo.trim(), phone);
      if (result.ok) {
        router.push(`/orders/${result.data.orderId}`);
        return;
      }
      setError(result.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="px-5 pb-8">
      <p className="mb-6 text-[13px] leading-relaxed tracking-tight text-ink-2">
        换设备或清空浏览器后，用订单号和下单手机号即可找回订单。
      </p>

      <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
        订单号
      </label>
      <input
        value={orderNo}
        onChange={(e) => setOrderNo(e.target.value)}
        placeholder="如 20261119-0001"
        className="tabular w-full rounded-xl bg-surface px-4 py-3 text-[15px] tracking-tight text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
      />

      <label className="mb-2 mt-6 block text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
        下单手机号
      </label>
      <input
        type="tel"
        inputMode="numeric"
        value={phone}
        onChange={(e) =>
          setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))
        }
        placeholder="11 位手机号"
        className="tabular w-full rounded-xl bg-surface px-4 py-3 text-[15px] tracking-tight text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
      />

      {error && (
        <p className="mt-4 rounded-xl bg-[#fdecec] px-3.5 py-2.5 text-[12px] leading-relaxed tracking-tight text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="press mt-7 w-full rounded-pill bg-accent py-3.5 text-[15px] font-medium tracking-tight text-white hover:bg-accent-hover disabled:bg-surface disabled:text-ink-3"
      >
        {pending ? "查询中…" : "查询订单"}
      </button>
    </form>
  );
}
