import "server-only";

import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import type { OrderStatus, ProductStatus } from "@prisma/client";

/**
 * 后台数据查询。
 *
 * 与前台查询的关键区别：不过滤 status，管理员必须能看到草稿与归档商品。
 * 这些函数只能在 /admin 下调用，鉴权由页面与 action 各自负责。
 *
 * ⚠️ 所有导出函数第一步都 `await connection()`：
 *   后台数据依赖登录态与"今天"这类运行时值，
 *   Cache Components 不允许在预渲染阶段执行它们。
 *   connection() 明确把执行推迟到请求时。
 */

export async function getAdminStats() {
  await connection();

  const [
    pendingOrders,
    todayOrders,
    activeProducts,
    lowStockSkus,
    todayRevenue,
  ] = await Promise.all([
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.count({
      where: {
        createdAt: { gte: startOfToday() },
      },
    }),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    // 库存告急：在售 SKU 且库存 <= 5
    prisma.sku.count({
      where: { isActive: true, product: { status: "ACTIVE" }, stock: { lte: 5 } },
    }),
    prisma.order.aggregate({
      where: {
        createdAt: { gte: startOfToday() },
        status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
      },
      _sum: { totalCents: true },
    }),
  ]);

  return {
    pendingOrders,
    todayOrders,
    activeProducts,
    lowStockSkus,
    todayRevenueCents: todayRevenue._sum.totalCents ?? 0,
  };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getAdminProducts(filter?: {
  status?: ProductStatus | "ALL";
  q?: string;
}) {
  await connection();
  const products = await prisma.product.findMany({
    where: {
      ...(filter?.status && filter.status !== "ALL"
        ? { status: filter.status }
        : {}),
      ...(filter?.q
        ? {
            OR: [
              { title: { contains: filter.q, mode: "insensitive" } },
              { slug: { contains: filter.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      coverImage: true,
      status: true,
      sortOrder: true,
      category: { select: { id: true, name: true } },
      skus: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          specText: true,
          specKey: true,
          priceCents: true,
          stock: true,
          isActive: true,
        },
      },
    },
  });

  return products.map((p) => ({
    ...p,
    totalStock: p.skus.reduce((s, k) => s + (k.isActive ? k.stock : 0), 0),
    minPriceCents:
      p.skus.length > 0
        ? Math.min(...p.skus.filter((s) => s.isActive).map((s) => s.priceCents))
        : 0,
  }));
}

export async function getAdminProduct(id: string) {
  await connection();
  return prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      description: true,
      coverImage: true,
      status: true,
      sortOrder: true,
      categoryId: true,
      specGroups: true,
      skus: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          specText: true,
          specKey: true,
          optionValues: true,
          priceCents: true,
          stock: true,
          isActive: true,
        },
      },
    },
  });
}

export async function getAdminOrders(filter?: {
  status?: OrderStatus | "ALL";
  q?: string;
}) {
  await connection();
  const orders = await prisma.order.findMany({
    where: {
      ...(filter?.status && filter.status !== "ALL"
        ? { status: filter.status }
        : {}),
      ...(filter?.q
        ? {
            OR: [
              { orderNo: { contains: filter.q, mode: "insensitive" } },
              { guestPhone: { contains: filter.q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      orderNo: true,
      status: true,
      totalCents: true,
      pickupNo: true,
      guestPhone: true,
      remark: true,
      createdAt: true,
      pickupSlotStart: true,
      items: {
        select: { nameSnapshot: true, specTextSnapshot: true, quantity: true },
      },
    },
  });

  return orders.map((o) => ({
    ...o,
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    summary:
      o.items
        .slice(0, 2)
        .map((i) => i.nameSnapshot)
        .join("、") + (o.items.length > 2 ? " 等" : ""),
  }));
}

export async function getAdminCategories() {
  await connection();
  return prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      sortOrder: true,
      _count: { select: { products: true } },
    },
  });
}
