import type { OrderStatus } from "@prisma/client";

const STATUS_META: Record<
  OrderStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "待处理",
    className: "bg-[#fff4e5] text-warn",
  },
  CONFIRMED: {
    label: "已确认",
    className: "bg-[#e8f2fd] text-accent",
  },
  COMPLETED: {
    label: "已完成",
    className: "bg-[#e8f8ee] text-success",
  },
  CANCELLED: {
    label: "已取消",
    className: "bg-surface text-ink-3",
  },
};

/**
 * 订单状态徽章 —— Apple 标签风格：
 * 无描边、浅色底、紧字距小字。颜色只表达语义，不做装饰。
 */
export function OrderStatusBadge({
  status,
  size = "md",
}: {
  status: OrderStatus;
  size?: "sm" | "md";
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-pill font-medium tracking-tight ${
        meta.className
      } ${size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"}`}
    >
      {meta.label}
    </span>
  );
}

export function orderStatusLabel(status: OrderStatus): string {
  return STATUS_META[status].label;
}
