import "server-only";

import { prisma } from "@/lib/prisma";
import { cartOwnerWhere, type Viewer } from "@/lib/viewer";
import type { CartLineData } from "@/components/cart/CartLine";

/**
 * 购物车数据访问层。
 *
 * 读取时同时带出 SKU 的**当前**库存与商品状态，用于：
 *  - 数量上限（maxStock）
 *  - 标记「已下架 / 售罄」行，使其不参与结算
 *
 * 注意：展示价用 CartItem 的快照价，**不是** SKU 当前价。
 * 当前价只在结算时由服务端重新取用（见 lib/queries/checkout.ts）。
 */

export type CartLineView = CartLineData & {
  /** SKU 当前是否可售（商品 ACTIVE 且 SKU isActive） */
  available: boolean;
};

export type CartView = {
  lines: CartLineView[];
  /** 可结算行的合计（快照价） */
  totalCents: number;
  /** 可结算件数 */
  itemCount: number;
  /** 是否存在失效行（用于页面顶部提示） */
  hasUnavailable: boolean;
};

export async function getCartView(viewer: Viewer): Promise<CartView> {
  const items = await prisma.cartItem.findMany({
    where: cartOwnerWhere(viewer),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      quantity: true,
      priceSnapshotCents: true,
      nameSnapshot: true,
      specTextSnapshot: true,
      imageSnapshot: true,
      sku: {
        select: {
          stock: true,
          isActive: true,
          product: { select: { status: true } },
        },
      },
    },
  });

  const lines: CartLineView[] = items.map((it) => {
    const available =
      it.sku.isActive && it.sku.product.status === "ACTIVE" && it.sku.stock > 0;
    return {
      id: it.id,
      nameSnapshot: it.nameSnapshot,
      specTextSnapshot: it.specTextSnapshot,
      priceSnapshotCents: it.priceSnapshotCents,
      quantity: it.quantity,
      imageSnapshot: it.imageSnapshot,
      // 上限至少为 1，避免库存为 0 时数量控件显示异常
      maxStock: Math.max(1, it.sku.stock),
      available,
    };
  });

  const active = lines.filter((l) => l.available);
  return {
    lines,
    totalCents: active.reduce(
      (sum, l) => sum + l.priceSnapshotCents * l.quantity,
      0,
    ),
    itemCount: active.reduce((sum, l) => sum + l.quantity, 0),
    hasUnavailable: lines.length !== active.length,
  };
}

/** 底部 Tab 角标用：只取件数，尽量轻量 */
export async function getCartCount(viewer: Viewer): Promise<number> {
  const result = await prisma.cartItem.aggregate({
    where: cartOwnerWhere(viewer),
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}
