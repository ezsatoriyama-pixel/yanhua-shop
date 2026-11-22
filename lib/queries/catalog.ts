import "server-only";

/**
 * 静态版数据源
 *
 * 从构建时打进来的 data/catalog.json 读取，不连数据库。
 * 每次商品变更后需要重新导出并重新构建：
 *   node scripts/export-data.cjs && npm run build
 */

import catalog from "@/data/catalog.json";

export type StaticSku = {
  id: string;
  specKey: string;
  specText: string;
  optionValues: Record<string, string>;
  priceCents: number;
  stock: number;
  image: string | null;
};

export type StaticProduct = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  coverImage: string;
  sortOrder: number;
  category: { name: string; slug: string } | null;
  specGroups: { name: string; values: string[] }[] | null;
  skus: StaticSku[];
  minPriceCents: number;
  inStock: boolean;
};

export type Catalog = {
  generatedAt: string;
  store: { name: string; address: string; phone: string; notice: string | null } | null;
  categories: { id: string; name: string; slug: string }[];
  products: StaticProduct[];
};

const data = catalog as unknown as Catalog;

export function getCatalog(): Catalog {
  return data;
}

export function getCategories() {
  return data.categories;
}

export function getStore() {
  return data.store;
}

export function getProductCards(categorySlug?: string) {
  const list = categorySlug
    ? data.products.filter((p) => p.category?.slug === categorySlug)
    : data.products;

  return list.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    coverImage: p.coverImage,
    minPriceCents: p.minPriceCents,
    inStock: p.inStock,
    categoryName: p.category?.name,
  }));
}

export function getProductDetail(slug: string): StaticProduct | null {
  return data.products.find((p) => p.slug === slug) ?? null;
}

/** 供 generateStaticParams 使用 */
export function getAllProductSlugs(): string[] {
  return data.products.map((p) => p.slug);
}
