"use server";

/**
 * 订单管理 Server Actions（后台专用）
 *
 * 状态机（只允许这些迁移，其余一律拒绝）：
 *   PENDING  → CONFIRMED | CANCELLED
 *   CONFIRMED → COMPLETED | CANCELLED
 *   COMPLETED → （终态）
 *   CANCELLED → （终态）
 *
 * 取消订单会**回补库存**并释放取餐时段占用 ——
 * 这是最容易漏的一步，漏了库存就永久性减少了。
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import type { OrderStatus } from "@prisma/client";
import type { AdminResult } from "./admin-products";

/** 合法迁移表 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export async function adminUpdateOrderStatus(
  orderId: string,
  next: OrderStatus,
): Promise<AdminResult<{ status: string }>> {
  try {
    await requireAdminAction();
  } catch {
    return { ok: false, message: "无权限" };
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        items: { select: { skuId: true, quantity: true } },
        pickupDate: true,
        pickupSlotStart: true,
      },
    });
    if (!order) return { ok: false, message: "订单不存在" };

    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(next)) {
      return {
        ok: false,
        message: `不能从「${order.status}」变更为「${next}」`,
      };
    }

    await prisma.$transaction(async (tx) => {
      // 取消订单：回补库存 + 释放时段
      if (next === "CANCELLED") {
        for (const item of order.items) {
          if (!item.skuId) continue;
          await tx.sku.update({
            where: { id: item.skuId },
            data: { stock: { increment: item.quantity } },
          });
        }

        // 释放时段占用（按 date + startTime 定位）
        if (order.pickupDate && order.pickupSlotStart) {
          const startTime = order.pickupSlotStart.toTimeString().slice(0, 5);
          await tx.pickupSlot.updateMany({
            where: { date: order.pickupDate, startTime, booked: { gt: 0 } },
            data: { booked: { decrement: 1 } },
          });
        }
      }

      const now = new Date();
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: next,
          ...(next === "CONFIRMED" ? { confirmedAt: now } : {}),
          ...(next === "COMPLETED" ? { completedAt: now } : {}),
          ...(next === "CANCELLED" ? { cancelledAt: now } : {}),
        },
      });
    });

    revalidatePath("/admin");
    revalidatePath("/admin/orders");
    revalidatePath("/orders");
    return { ok: true, data: { status: next } };
  } catch (error) {
    console.error("[adminUpdateOrderStatus]", error);
    return { ok: false, message: "操作失败，请重试" };
  }
}
