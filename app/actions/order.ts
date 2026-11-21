"use server";

/**
 * 订单 Server Actions —— 阶段三实现
 *
 * createOrder 是整个系统的最高风险点，四道防线缺一不可：
 *
 *  ① 幂等     requestId 唯一索引 + 事务内先查后建，重复提交只产生一单
 *  ② 计价     只读服务端 SKU 当前价，前端传来的任何金额被无条件忽略
 *  ③ 防超卖   updateMany({ stock: { gte: qty } }, { decrement }) 条件扣减，
 *             count === 0 即抛错回滚 —— 这是唯一可靠的防超卖手段
 *  ④ 归属     所有读写都带 userId / sessionId 条件
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { cartOwnerWhere, getOrCreateViewer } from "@/lib/viewer";
import type { ActionResult } from "./cart";

export type CreateOrderInput = {
  requestId: string;
  cartItemIds: string[];
  pickupSlotId: string;
  phone: string;
  remark?: string;
};

export type CreateOrderResult = {
  orderId: string;
  orderNo: string;
  pickupNo: string;
  totalCents: number;
  /** true 表示本次是幂等命中，未新建订单 */
  idempotentReplay: boolean;
};

/** 单笔订单最多 50 行，防止恶意构造超大载荷 */
const MAX_LINES = 50;

/** 业务错误：在事务内抛出以触发回滚 */
class OrderError extends Error {
  constructor(
    public code:
      | "VALIDATION_ERROR"
      | "CART_ITEM_NOT_FOUND"
      | "PRODUCT_UNAVAILABLE"
      | "INSUFFICIENT_STOCK"
      | "SLOT_FULL"
      | "CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

/** 生成当日序号并格式化取货号：A001 */
async function nextPickupNo(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  dateKey: string,
): Promise<{ pickupNo: string; seq: number }> {
  const key = `pickup:${dateKey}`;
  // upsert + increment 是原子操作，并发下不会取到同一个号
  const counter = await tx.dailyCounter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  return {
    pickupNo: `A${String(counter.value).padStart(3, "0")}`,
    seq: counter.value,
  };
}

/** 生成人可读订单号：20261119-0007 */
async function nextOrderNo(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  dateKey: string,
): Promise<string> {
  const key = `order:${dateKey}`;
  const counter = await tx.dailyCounter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  return `${dateKey}-${String(counter.value).padStart(4, "0")}`;
}

function dateKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * 创建订单。
 *
 * 入参**不包含、也不接受**任何价格字段。
 */
export async function createOrder(
  input: CreateOrderInput,
): Promise<ActionResult<CreateOrderResult>> {
  try {
    // ── 0. 基础校验 ──
    const requestId = String(input?.requestId ?? "").trim();
    if (!requestId || requestId.length < 8 || requestId.length > 100) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "请求标识无效，请刷新页面后重试",
      };
    }
    const phone = String(input?.phone ?? "").trim();
    if (!/^1\d{10}$/.test(phone)) {
      return { ok: false, code: "VALIDATION_ERROR", message: "请填写正确的 11 位手机号" };
    }
    const slotId = String(input?.pickupSlotId ?? "").trim();
    if (!slotId) {
      return { ok: false, code: "VALIDATION_ERROR", message: "请选择取货时段" };
    }
    const rawIds = Array.isArray(input?.cartItemIds) ? input.cartItemIds : [];
    if (rawIds.length === 0) {
      return { ok: false, code: "VALIDATION_ERROR", message: "没有可结算的商品" };
    }
    if (rawIds.length > MAX_LINES) {
      return { ok: false, code: "VALIDATION_ERROR", message: "单笔订单商品种类过多" };
    }
    const cartItemIds = rawIds.map((x) => String(x));
    const remark = input?.remark ? String(input.remark).slice(0, 200) : null;

    // ── ① 幂等：先查（快路径）──
    const existing = await prisma.order.findUnique({
      where: { requestId },
      select: {
        id: true,
        orderNo: true,
        pickupNo: true,
        totalCents: true,
      },
    });
    if (existing) {
      return {
        ok: true,
        data: {
          orderId: existing.id,
          orderNo: existing.orderNo,
          pickupNo: existing.pickupNo ?? "",
          totalCents: existing.totalCents,
          idempotentReplay: true,
        },
      };
    }

    // ── 身份 ──
    const viewer = await getOrCreateViewer();
    const owner = cartOwnerWhere(viewer);

    // ── ② 服务端重读购物车（不信任前端任何金额）──
    const cartItems = await prisma.cartItem.findMany({
      where: { id: { in: cartItemIds }, ...owner },
      select: {
        id: true,
        quantity: true,
        sku: {
          select: {
            id: true,
            priceCents: true,
            specText: true,
            stock: true,
            isActive: true,
            image: true,
            product: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });

    if (cartItems.length !== cartItemIds.length) {
      return {
        ok: false,
        code: "CART_ITEM_NOT_FOUND",
        message: "部分商品已不在购物车，请返回购物车刷新",
      };
    }

    // ── 校验商品可售 + 库存 ──
    for (const it of cartItems) {
      if (!it.sku.isActive || it.sku.product.status !== "ACTIVE") {
        throw new OrderError("PRODUCT_UNAVAILABLE", `「${it.sku.product.title}」已下架`);
      }
      if (it.quantity <= 0) {
        throw new OrderError("VALIDATION_ERROR", "商品数量异常");
      }
      if (it.sku.stock < it.quantity) {
        throw new OrderError(
          "INSUFFICIENT_STOCK",
          `「${it.sku.product.title}」（${it.sku.specText}）仅剩 ${it.sku.stock} 件`,
        );
      }
    }

    // ── ③ 计价：唯一价格来源是 SKU 当前价 ──
    const itemsTotalCents = cartItems.reduce(
      (sum, it) => sum + it.sku.priceCents * it.quantity,
      0,
    );
    const deliveryFeeCents = 0; // P0 自取，无运费
    const totalCents = itemsTotalCents + deliveryFeeCents;

    // ── 取货时段与门店（事务外先读，事务内再条件占用）──
    const slot = await prisma.pickupSlot.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        capacity: true,
        booked: true,
        isActive: true,
      },
    });
    if (!slot || !slot.isActive) {
      return { ok: false, code: "VALIDATION_ERROR", message: "取货时段不可用，请重新选择" };
    }

    const store = await prisma.store.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { name: true, address: true, phone: true },
    });

    const now = new Date();
    const key = dateKeyOf(now);

    // ── ④ 事务 ──
    const order = await prisma.$transaction(async (tx) => {
      // 4a. 条件扣库存 —— 防超卖核心
      for (const it of cartItems) {
        const updated = await tx.sku.updateMany({
          where: { id: it.sku.id, stock: { gte: it.quantity } },
          data: { stock: { decrement: it.quantity } },
        });
        if (updated.count === 0) {
          // 并发下被别人抢先扣完
          throw new OrderError(
            "INSUFFICIENT_STOCK",
            `「${it.sku.product.title}」（${it.sku.specText}）库存不足，请调整数量`,
          );
        }
      }

      // 4b. 占时段（capacity 为 null 表示不限）
      if (slot.capacity !== null) {
        const booked = await tx.pickupSlot.updateMany({
          where: { id: slot.id, booked: { lt: slot.capacity } },
          data: { booked: { increment: 1 } },
        });
        if (booked.count === 0) {
          throw new OrderError("SLOT_FULL", "该取货时段已约满，请选择其他时段");
        }
      } else {
        await tx.pickupSlot.update({
          where: { id: slot.id },
          data: { booked: { increment: 1 } },
        });
      }

      // 4c. 取货号 + 订单号（按日重置）
      const { pickupNo } = await nextPickupNo(tx, key);
      const orderNo = await nextOrderNo(tx, key);

      // 4d. 创建订单 + 订单行（全部快照）
      const created = await tx.order.create({
        data: {
          orderNo,
          status: "PENDING",
          fulfillmentType: "PICKUP",
          userId: viewer.userId,
          sessionId: viewer.sessionId,
          guestPhone: phone,
          itemsTotalCents,
          deliveryFeeCents,
          totalCents,
          remark,
          pickupNo,
          pickupDate: slot.date,
          pickupSlotStart: new Date(`${slot.date.toISOString().slice(0, 10)}T${slot.startTime}:00`),
          pickupSlotEnd: new Date(`${slot.date.toISOString().slice(0, 10)}T${slot.endTime}:00`),
          storeNameSnapshot: store?.name ?? null,
          storeAddressSnapshot: store?.address ?? null,
          storePhoneSnapshot: store?.phone ?? null,
          requestId,
          items: {
            create: cartItems.map((it) => ({
              skuId: it.sku.id,
              productId: it.sku.product.id,
              nameSnapshot: it.sku.product.title,
              specTextSnapshot: it.sku.specText,
              imageSnapshot: it.sku.image,
              unitPriceCents: it.sku.priceCents,
              quantity: it.quantity,
              lineTotalCents: it.sku.priceCents * it.quantity,
            })),
          },
        },
        select: { id: true, orderNo: true, pickupNo: true, totalCents: true },
      });

      // 4e. 清空已结算的购物车行（带归属条件）
      await tx.cartItem.deleteMany({
        where: { id: { in: cartItems.map((i) => i.id) }, ...owner },
      });

      return created;
    });

    revalidatePath("/orders");
    revalidatePath("/cart");
    revalidatePath("/");

    return {
      ok: true,
      data: {
        orderId: order.id,
        orderNo: order.orderNo,
        pickupNo: order.pickupNo ?? "",
        totalCents: order.totalCents,
        idempotentReplay: false,
      },
    };
  } catch (error) {
    // ── 业务错误：转成结构化返回 ──
    if (error instanceof OrderError) {
      return { ok: false, code: error.code, message: error.message };
    }

    // ── ① 幂等兜底：并发重复提交撞唯一索引 ──
    // Prisma 唯一约束冲突为 P2002；此时返回已存在的那一单，而不是报错
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const requestId = String(input?.requestId ?? "").trim();
      const replay = await prisma.order.findUnique({
        where: { requestId },
        select: { id: true, orderNo: true, pickupNo: true, totalCents: true },
      });
      if (replay) {
        return {
          ok: true,
          data: {
            orderId: replay.id,
            orderNo: replay.orderNo,
            pickupNo: replay.pickupNo ?? "",
            totalCents: replay.totalCents,
            idempotentReplay: true,
          },
        };
      }
    }

    console.error("[createOrder]", error);
    return { ok: false, code: "INTERNAL", message: "下单失败，请稍后重试" };
  }
}

/* ─────────────────────────── 查询 ─────────────────────────── */

/**
 * 订单详情（带归属校验）。
 *
 * 查不到一律返回 null，由页面 notFound() —— 不区分"不存在"与"无权限"，
 * 避免通过响应差异探测他人订单。
 */
export async function getOrderForViewer(orderId: string) {
  const { getViewer } = await import("@/lib/viewer");
  const viewer = await getViewer();

  if (!viewer.userId && !viewer.sessionId) return null;

  return prisma.order.findFirst({
    where: {
      id: orderId,
      OR: [
        ...(viewer.userId ? [{ userId: viewer.userId }] : []),
        ...(viewer.sessionId ? [{ sessionId: viewer.sessionId }] : []),
      ],
    },
    select: {
      id: true,
      orderNo: true,
      status: true,
      totalCents: true,
      itemsTotalCents: true,
      deliveryFeeCents: true,
      remark: true,
      pickupNo: true,
      pickupSlotStart: true,
      pickupSlotEnd: true,
      storeNameSnapshot: true,
      storeAddressSnapshot: true,
      storePhoneSnapshot: true,
      guestPhone: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          nameSnapshot: true,
          specTextSnapshot: true,
          imageSnapshot: true,
          unitPriceCents: true,
          quantity: true,
          lineTotalCents: true,
        },
      },
    },
  });
}

/**
 * 游客查单：订单号 + 手机号双因子。
 * 两者必须同时匹配，仅凭订单号无法枚举。
 */
export async function lookupOrderByPhone(
  orderNo: string,
  phone: string,
): Promise<ActionResult<{ orderId: string }>> {
  try {
    const no = String(orderNo ?? "").trim();
    const ph = String(phone ?? "").trim();
    if (!no || !/^1\d{10}$/.test(ph)) {
      return { ok: false, code: "VALIDATION_ERROR", message: "请填写订单号和 11 位手机号" };
    }

    const order = await prisma.order.findFirst({
      where: { orderNo: no, guestPhone: ph },
      select: { id: true },
    });

    if (!order) {
      // 统一文案，不透露"订单号存在但手机号不对"
      return { ok: false, code: "VALIDATION_ERROR", message: "订单号与手机号不匹配" };
    }

    return { ok: true, data: { orderId: order.id } };
  } catch (error) {
    console.error("[lookupOrderByPhone]", error);
    return { ok: false, code: "INTERNAL", message: "查询失败，请重试" };
  }
}

/**
 * 变更订单状态（P1 管理端使用；此处保留签名）。
 * 合法迁移：PENDING → CONFIRMED → COMPLETED；任意 → CANCELLED。
 */
export async function updateOrderStatus(
  orderId: string,
  nextStatus: "CONFIRMED" | "COMPLETED" | "CANCELLED",
): Promise<ActionResult<{ orderId: string; status: string }>> {
  void orderId;
  void nextStatus;
  return {
    ok: false,
    code: "INTERNAL",
    message: "管理端状态流转将在 P1 实现（需先完成 /admin 服务端鉴权）",
  };
}
