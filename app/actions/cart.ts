"use server";

/**
 * 购物车 Server Actions —— 阶段三实现
 *
 * 安全边界（每一条都对应硬约束 4）：
 *  1. 前端只传 skuId / cartItemId / quantity，**永远不传价格**
 *  2. 价格快照由服务端查 sku.priceCents 写入，前端传什么都无效
 *  3. 所有更新/删除都带归属条件（userId 或 sessionId），防越权
 *  4. 数量上限取 SKU 当前 stock，不信任前端算出的上限
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { cartOwnerWhere, getOrCreateViewer, getViewer } from "@/lib/viewer";

/** 统一的 action 返回结构，前端只依赖这个形状 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message: string };

export type ActionErrorCode =
  | "NOT_AUTHENTICATED"
  | "SKU_NOT_FOUND"
  | "PRODUCT_UNAVAILABLE"
  | "INSUFFICIENT_STOCK"
  | "CART_ITEM_NOT_FOUND"
  | "SLOT_FULL"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "INTERNAL";

/** 单次加购数量上限，防止误操作把库存一次性拉空 */
const MAX_QUANTITY_PER_ADD = 99;

/**
 * 加入购物车。
 *
 * @param skuId    规格单元 id
 * @param quantity 数量（服务端会夹紧到 [1, sku.stock]）
 *
 * 快照规则：写入时的 sku.priceCents / product.title / sku.specText / sku.image
 * 一旦写入不再随商品变化更新 —— 这就是"价格快照"。
 */
export async function addToCart(
  skuId: string,
  quantity: number,
): Promise<ActionResult<{ itemCount: number }>> {
  try {
    // ── 1. 入参校验 ──
    if (!skuId || typeof skuId !== "string") {
      return { ok: false, code: "VALIDATION_ERROR", message: "参数错误：缺少 skuId" };
    }
    const qty = Math.trunc(Number(quantity));
    if (!Number.isFinite(qty) || qty < 1) {
      return { ok: false, code: "VALIDATION_ERROR", message: "数量必须是大于 0 的整数" };
    }
    if (qty > MAX_QUANTITY_PER_ADD) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `单次最多添加 ${MAX_QUANTITY_PER_ADD} 件`,
      };
    }

    // ── 2. 服务端取真实 SKU（价格与库存的唯一来源）──
    const sku = await prisma.sku.findFirst({
      where: { id: skuId, isActive: true, product: { status: "ACTIVE" } },
      select: {
        id: true,
        priceCents: true,
        specText: true,
        stock: true,
        image: true,
        product: { select: { title: true, coverImage: true } },
      },
    });

    if (!sku) {
      return {
        ok: false,
        code: "SKU_NOT_FOUND",
        message: "该规格不存在或已下架",
      };
    }
    if (sku.stock <= 0) {
      return { ok: false, code: "INSUFFICIENT_STOCK", message: "该规格已售罄" };
    }

    // ── 3. 身份（游客首发会下发 sid cookie）──
    const viewer = await getOrCreateViewer();
    const owner = cartOwnerWhere(viewer);

    // ── 4. 同身份同 SKU 合并 ──
    const existing =
      (await prisma.cartItem.findFirst({
        where: { ...owner, skuId: sku.id },
        select: { id: true, quantity: true },
      })) ?? null;

    const finalQty = Math.min((existing?.quantity ?? 0) + qty, sku.stock);

    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: finalQty },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          sessionId: viewer.sessionId,
          userId: viewer.userId,
          skuId: sku.id,
          quantity: finalQty,
          // ── 快照：此刻冻结 ──
          priceSnapshotCents: sku.priceCents,
          nameSnapshot: sku.product.title,
          specTextSnapshot: sku.specText,
          imageSnapshot: sku.image ?? sku.product.coverImage,
        },
      });
    }

    revalidatePath("/cart");
    revalidatePath("/");

    const total = await prisma.cartItem.aggregate({
      where: owner,
      _sum: { quantity: true },
    });

    return { ok: true, data: { itemCount: total._sum.quantity ?? 0 } };
  } catch (error) {
    console.error("[addToCart]", error);
    return { ok: false, code: "INTERNAL", message: "加入购物车失败，请重试" };
  }
}

/**
 * 修改购物车数量。quantity <= 0 视为删除该行。
 *
 * 归属条件写在 where 里，属于他人的 cartItemId 会命中 CART_ITEM_NOT_FOUND，
 * 不会泄露"这一行是否存在"。
 */
export async function updateCartItemQuantity(
  cartItemId: string,
  quantity: number,
): Promise<ActionResult<{ quantity: number }>> {
  try {
    if (!cartItemId) {
      return { ok: false, code: "VALIDATION_ERROR", message: "参数错误：缺少 cartItemId" };
    }
    const qty = Math.trunc(Number(quantity));
    if (!Number.isFinite(qty)) {
      return { ok: false, code: "VALIDATION_ERROR", message: "数量不合法" };
    }

    const viewer = await getViewer();
    const owner = cartOwnerWhere(viewer);

    // 连 SKU 库存一起取，用于夹紧上限
    const item = await prisma.cartItem.findFirst({
      where: { id: cartItemId, ...owner },
      select: { id: true, sku: { select: { stock: true, isActive: true } } },
    });

    if (!item) {
      return { ok: false, code: "CART_ITEM_NOT_FOUND", message: "购物车项不存在" };
    }

    // ── 数量 ≤ 0：删除 ──
    if (qty <= 0) {
      await prisma.cartItem.delete({ where: { id: item.id } });
      revalidatePath("/cart");
      return { ok: true, data: { quantity: 0 } };
    }

    if (!item.sku.isActive) {
      return { ok: false, code: "PRODUCT_UNAVAILABLE", message: "该规格已下架" };
    }
    if (item.sku.stock <= 0) {
      return { ok: false, code: "INSUFFICIENT_STOCK", message: "该规格已售罄" };
    }

    // 夹紧到 [1, stock]，不报错而是静默修正 —— 移动端误触太多
    const finalQty = Math.min(qty, item.sku.stock);

    await prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: finalQty },
    });

    revalidatePath("/cart");
    return { ok: true, data: { quantity: finalQty } };
  } catch (error) {
    console.error("[updateCartItemQuantity]", error);
    return { ok: false, code: "INTERNAL", message: "修改数量失败，请重试" };
  }
}

/** 删除购物车行 */
export async function removeCartItem(
  cartItemId: string,
): Promise<ActionResult<{ removed: true }>> {
  try {
    if (!cartItemId) {
      return { ok: false, code: "VALIDATION_ERROR", message: "参数错误" };
    }
    const viewer = await getViewer();
    const owner = cartOwnerWhere(viewer);

    // deleteMany 而非 delete：带归属条件且不抛 P2025，
    // 删不到就直接返回失败，不区分"不存在/无权限"
    const result = await prisma.cartItem.deleteMany({
      where: { id: cartItemId, ...owner },
    });

    if (result.count === 0) {
      return { ok: false, code: "CART_ITEM_NOT_FOUND", message: "购物车项不存在" };
    }

    revalidatePath("/cart");
    return { ok: true, data: { removed: true } };
  } catch (error) {
    console.error("[removeCartItem]", error);
    return { ok: false, code: "INTERNAL", message: "删除失败，请重试" };
  }
}

/**
 * 获取购物车汇总（供客户端刷新角标用）。
 */
export async function getCartSummary(): Promise<
  ActionResult<{ itemCount: number; totalCents: number }>
> {
  try {
    const viewer = await getViewer();
    const items = await prisma.cartItem.findMany({
      where: cartOwnerWhere(viewer),
      select: { quantity: true, priceSnapshotCents: true },
    });
    return {
      ok: true,
      data: {
        itemCount: items.reduce((s, i) => s + i.quantity, 0),
        totalCents: items.reduce(
          (s, i) => s + i.priceSnapshotCents * i.quantity,
          0,
        ),
      },
    };
  } catch (error) {
    console.error("[getCartSummary]", error);
    return { ok: false, code: "INTERNAL", message: "读取购物车失败" };
  }
}
