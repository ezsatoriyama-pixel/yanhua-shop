import "server-only";

import { prisma } from "@/lib/prisma";
import { cartOwnerWhere, type Viewer } from "@/lib/viewer";

/**
 * 结算数据访问层。
 *
 * 关键：结算页展示的金额由**服务端用 SKU 当前价重算**，
 * 不使用购物车快照价 —— 快照只用于「加入时的价格」提示与下单兜底比对。
 *
 * 前端传来的任何金额都不会进入这里。
 */

export type CheckoutLine = {
  cartItemId: string;
  skuId: string;
  name: string;
  specText: string;
  image: string | null;
  quantity: number;
  /** SKU 当前价（结算计价依据） */
  unitPriceCents: number;
  lineTotalCents: number;
  /** 加入购物车时的快照价，用于「价格已变化」提示 */
  snapshotPriceCents: number;
  priceChanged: boolean;
  /** 本行是否可结算 */
  available: boolean;
  unavailableReason: string | null;
};

export type CheckoutData = {
  lines: CheckoutLine[];
  totalCents: number;
  /** 是否存在价格变化 / 失效行，需要用户确认 */
  needsAttention: boolean;
  slots: {
    id: string;
    label: string;
    remaining: number | null;
    disabled: boolean;
  }[];
  store: { name: string; address: string; phone: string } | null;
};

/**
 * 把 PickupSlot.date 归一化为「本地日期」的 YYYY-MM-DD。
 *
 * ⚠️ 坑：Prisma 的 @db.Date 字段在 UTC 下取回是当天 00:00Z，
 * 直接用 toISOString() 在 UTC+8 会正确，但在 UTC-x 时区会前移一天。
 * 这里统一用本地年月日拼接，避免时区错位。
 */
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 今天的本地 00:00 */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function timeLabel(date: Date, start: string, end: string): string {
  const today = startOfToday();
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);

  if (diff === 0) return `今天 ${start}-${end}`;
  if (diff === 1) return `明天 ${start}-${end}`;

  // 其他日期用绝对日期，避免"今天"标签被误用到过去的日期
  return `${d.getMonth() + 1}/${d.getDate()} ${start}-${end}`;
}

export async function getCheckoutData(
  viewer: Viewer,
  selectedIds?: string[],
): Promise<CheckoutData> {
  const items = await prisma.cartItem.findMany({
    where: {
      ...cartOwnerWhere(viewer),
      // 只结算指定项；不指定则结算全部（仍受归属条件约束）
      ...(selectedIds && selectedIds.length > 0 ? { id: { in: selectedIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      quantity: true,
      priceSnapshotCents: true,
      sku: {
        select: {
          id: true,
          priceCents: true,
          specText: true,
          stock: true,
          isActive: true,
          image: true,
          product: {
            select: { title: true, coverImage: true, status: true },
          },
        },
      },
    },
  });

  const lines: CheckoutLine[] = items.map((it) => {
    const sku = it.sku;
    const available = sku.isActive && sku.product.status === "ACTIVE" && sku.stock >= it.quantity;
    let reason: string | null = null;
    if (!sku.isActive || sku.product.status !== "ACTIVE") reason = "商品已下架";
    else if (sku.stock <= 0) reason = "已售罄";
    else if (sku.stock < it.quantity) reason = `库存仅剩 ${sku.stock} 件`;

    return {
      cartItemId: it.id,
      skuId: sku.id,
      name: sku.product.title,
      specText: sku.specText,
      image: sku.image ?? sku.product.coverImage,
      quantity: it.quantity,
      unitPriceCents: sku.priceCents,
      lineTotalCents: sku.priceCents * it.quantity,
      snapshotPriceCents: it.priceSnapshotCents,
      priceChanged: sku.priceCents !== it.priceSnapshotCents,
      available,
      unavailableReason: reason,
    };
  });

  const usable = lines.filter((l) => l.available);

  // ── 取货时段：只保留今天与明天，过滤掉已过期与更远的 ──
  const today = startOfToday();
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  const slotRows = await prisma.pickupSlot.findMany({
    where: {
      isActive: true,
      // 只取今天 00:00 起的日期，历史日期一律排除
      date: { gte: today, lt: dayAfterTomorrow },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      capacity: true,
      booked: true,
    },
  });

  // 双重保险：按本地日期再过滤一次，并去除重复的 (date,startTime)
  const seen = new Set<string>();
  const validRows = slotRows.filter((s) => {
    const dayKey = localDayKey(new Date(s.date));
    if (dayKey < localDayKey(today)) return false;
    const uniq = `${dayKey}#${s.startTime}`;
    if (seen.has(uniq)) return false;
    seen.add(uniq);
    return true;
  });

  const slots = validRows.map((s) => {
    const remaining =
      s.capacity === null ? null : Math.max(0, s.capacity - s.booked);
    return {
      id: s.id,
      label: timeLabel(new Date(s.date), s.startTime, s.endTime),
      remaining,
      // capacity 为 null 表示不限；有值且剩余 0 则禁用
      disabled: remaining !== null && remaining <= 0,
    };
  });

  const store = await prisma.store.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { name: true, address: true, phone: true },
  });

  return {
    lines,
    totalCents: usable.reduce((s, l) => s + l.lineTotalCents, 0),
    needsAttention:
      usable.length !== lines.length || usable.some((l) => l.priceChanged),
    slots,
    store,
  };
}
