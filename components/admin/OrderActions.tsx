"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateOrderStatus } from "@/app/actions/admin-orders";
import type { OrderStatus } from "@prisma/client";

/**
 * 订单状态操作按钮。
 * 只渲染当前状态允许的下一步（状态机在服务端再次校验）。
 */
export function OrderActions({
  orderId,
  status,
  size = "md",
}: {
  orderId: string;
  status: OrderStatus;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const actions: { next: OrderStatus; label: string; tone: "primary" | "danger" }[] = [];
  if (status === "PENDING") {
    actions.push({ next: "CONFIRMED", label: "确认", tone: "primary" });
    actions.push({ next: "CANCELLED", label: "取消", tone: "danger" });
  } else if (status === "CONFIRMED") {
    actions.push({ next: "COMPLETED", label: "完成", tone: "primary" });
    actions.push({ next: "CANCELLED", label: "取消", tone: "danger" });
  }

  if (actions.length === 0) return null;

  function run(next: OrderStatus) {
    setError(null);
    if (next === "CANCELLED" && !confirm("取消订单会回补库存，确定吗？")) {
      return;
    }
    startTransition(async () => {
      const result = await adminUpdateOrderStatus(orderId, next);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  const pad = size === "sm" ? "px-3 py-1" : "px-4 py-1.5";
  const text = size === "sm" ? "text-[11px]" : "text-[12px]";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        {actions.map((a) => (
          <button
            key={a.next}
            type="button"
            disabled={pending}
            onClick={() => run(a.next)}
            className={`press rounded-pill ${pad} ${text} font-medium tracking-tight disabled:opacity-40 ${
              a.tone === "primary"
                ? "bg-accent text-white hover:bg-accent-hover"
                : "bg-[#fdecec] text-danger"
            }`}
          >
            {pending ? "…" : a.label}
          </button>
        ))}
      </div>
      {error && (
        <span className="text-[10px] tracking-tight text-danger">{error}</span>
      )}
    </div>
  );
}
