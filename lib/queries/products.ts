import "server-only";

import { prisma } from "@/lib/prisma";
import type { ProductCardData } from "@/components/product/ProductCard";
import type { SpecGroup, SelectorSku } from "@/components/product/SkuSelector";

/**
 * 商品数据访问层。
 *
 * 所有对外查询都强制 status = ACTIVE —— 这是"下架商品不可达"的唯一保证点。
 * 页面组件不允许直接 import prisma 查商品，必须走这里，
 * 避免某天有人漏写 status 过滤把草稿商品暴露到前台。
 */

/** 分类 + 商品列表（首页用） */
export async function getCategories() {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, slug: true },
  });
}

/**
 * 首页商品列表。
 * 起售价与库存状态由聚合子查询得出，不用冗余的 minPriceCents 字段，
 * 避免"后台改价忘了重算冗余字段"导致的展示错误。
 */
export async function getProductCards(categorySlug?: string): Promise<ProductCardData[]> {
  const products = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      ...(categorySlug ? { category: { slug: categorySlug, isActive: true } } : {}),
      // 至少要有一个可售 SKU 才值得展示
      skus: { some: { isActive: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      coverImage: true,
      category: { select: { name: true } },
      skus: {
        where: { isActive: true },
        select: { priceCents: true, stock: true },
      },
    },
  });

  return products.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    coverImage: p.coverImage,
    // 起售价 = 最低 ACTIVE SKU 价
    minPriceCents:
      p.skus.length > 0 ? Math.min(...p.skus.map((s) => s.priceCents)) : 0,
    // 任一 ACTIVE SKU 有库存即可下单
    inStock: p.skus.some((s) => s.stock > 0),
    categoryName: p.category?.name,
  }));
}

export type ProductDetail = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  coverImage: string;
  groups: SpecGroup[];
  skus: SelectorSku[];
};

/**
 * 商品详情 + 全部可售 SKU。
 *
 * 规格组顺序：优先用 Product.specGroups（显式声明）；
 * 若为空（历史数据），退化为从 SKU.optionValues 反推。
 *
 * ⚠️ 为什么不直接依赖 optionValues 的顺序：
 *   它存的是 Postgres jsonb，jsonb 会按 key 长度/字典序重排，
 *   读回来的 key 顺序与写入时不同（实测「长度」会跑到「包装」后面）。
 */
export async function getProductDetail(slug: string): Promise<ProductDetail | null> {
  const product = await prisma.product.findFirst({
    where: { slug, status: "ACTIVE" },
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      description: true,
      coverImage: true,
      specGroups: true,
      skus: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          specKey: true,
          specText: true,
          optionValues: true,
          priceCents: true,
          stock: true,
          image: true,
        },
      },
    },
  });

  if (!product) return null;

  // ── 规格组：优先显式定义 ──
  const declared = product.specGroups as
    | { name: string; values: string[] }[]
    | null;

  let groups: SpecGroup[];

  if (Array.isArray(declared) && declared.length > 0) {
    groups = declared.map((g) => ({ name: g.name, values: [...g.values] }));
  } else {
    // 回退：从 optionValues 反推（顺序不保证稳定，仅作兜底）
    const groupOrder: string[] = [];
    const valueMap = new Map<string, string[]>();
    for (const sku of product.skus) {
      const values = (sku.optionValues ?? {}) as Record<string, string>;
      for (const [group, value] of Object.entries(values)) {
        if (!valueMap.has(group)) {
          groupOrder.push(group);
          valueMap.set(group, []);
        }
        const list = valueMap.get(group)!;
        if (!list.includes(value)) list.push(value);
      }
    }
    groups = groupOrder.map((name) => ({
      name,
      values: valueMap.get(name) ?? [],
    }));
  }

  const skus: SelectorSku[] = product.skus.map((s) => ({
    id: s.id,
    specKey: s.specKey,
    specText: s.specText,
    optionValues: (s.optionValues ?? {}) as Record<string, string>,
    priceCents: s.priceCents,
    stock: s.stock,
    image: s.image,
  }));

  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    subtitle: product.subtitle,
    description: product.description,
    coverImage: product.coverImage,
    groups,
    skus,
  };
}

/** 首页公告用的门店信息 */
export async function getStore() {
  const store = await prisma.store.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { name: true, address: true, phone: true, notice: true },
  });
  return store;
}
