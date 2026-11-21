import "server-only";

import { prisma } from "@/lib/prisma";
import type { Viewer } from "@/lib/viewer";

/**
 * 订单查询。
 *
 * 归属条件集中在此处构造：
 *   登录用户 → userId；游客 → sessionId。
 * 两者都没有时返回空数组，绝不返回全表。
 */

export type OrderSummary = {
  id: string;
  orderNo: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  totalCents: number;
  pickupNo: string | null;
  createdAt: Date;
  itemCount: number;
  firstItemName: string;
};

function ownerFilter(viewer: Viewer) {
  const or = [
    ...(viewer.userId ? [{ userId: viewer.userId }] : []),
    ...(viewer.sessionId ? [{ sessionId: viewer.sessionId }] : []),
  ];
  // 没有任何身份 → 匹配不到任何行
  if (or.length === 0) return { id: "__no_viewer__" };
  return { OR: or };
}

export async function getOrders(viewer: Viewer): Promise<OrderSummary[]> {
  const orders = await prisma.order.findMany({
    where: ownerFilter(viewer),
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      orderNo: true,
      status: true,
      totalCents: true,
      pickupNo: true,
      createdAt: true,
      items: {
        select: { nameSnapshot: true, quantity: true },
      },
    },
  });

  return orders.map((o) => ({
    id: o.id,
    orderNo: o.orderNo,
    status: o.status,
    totalCents: o.totalCents,
    pickupNo: o.pickupNo,
    createdAt: o.createdAt,
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    firstItemName: o.items[0]?.nameSnapshot ?? "",
  }));
}
