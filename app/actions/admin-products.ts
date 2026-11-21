"use server";

/**
 * 商品管理 Server Actions（后台专用）
 *
 * ⚠️ 每个 action 第一行都是 requireAdminAction()。
 *    页面级拦截不是安全边界 —— Server Action 是公开 POST 端点，
 *    任何人都能直接调用，不经过页面渲染。
 *
 * 约束：
 *  1. 价格以「分」为单位存储，前端输入的「元」在这里转换
 *  2. 修改商品后必须调用 revalidatePath，否则前台是缓存的旧数据
 *  3. 删除商品用 ARCHIVED（软删除），不做物理删除，保护历史订单
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { buildSpecKey, buildSpecText, DEFAULT_SPEC_KEY } from "@/lib/sku";

export type AdminResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/**
 * 让前后台相关页面失效。
 *
 * ⚠️ 必须带上**具体路径**：
 *   只写 revalidatePath("/product/[slug]") 是无效的 ——
 *   它按字面量匹配这个字符串，而不是匹配该动态路由的所有实例。
 *   商品详情页是用 slug 生成的，改价后必须按真实 slug 精确失效，
 *   否则前台会一直显示缓存里的旧价格（实测踩过）。
 */
async function revalidateShop(productSlug?: string) {
  revalidatePath("/");
  revalidatePath("/cart");
  revalidatePath("/checkout");
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  if (productSlug) {
    revalidatePath(`/product/${productSlug}`);
  }
}

/**
 * 按 productId 查出 slug 后失效前后台页面。
 *
 * 为什么多一步查询：revalidatePath 需要**具体路径**，
 * 而这里的调用方大多只有 productId。多一次廉价查询，
 * 换来"改价后前台立刻可见"，值得。
 */
async function revalidateByProductId(productId: string) {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  });
  await revalidateShop(p?.slug);
}

/** 把用户输入的元转成分，非法时返回 null */
function yuanToCents(input: string | number): number | null {
  const n = typeof input === "number" ? input : Number.parseFloat(String(input));
  if (!Number.isFinite(n) || n < 0) return null;
  // 四舍五入到分，避免 19.999 这类浮点误差
  return Math.round(n * 100);
}

/* ─────────────────────────── 商品 ─────────────────────────── */

export type ProductInput = {
  id?: string;
  title: string;
  slug: string;
  subtitle?: string;
  description?: string;
  coverImage: string;
  categoryId?: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  sortOrder?: number;
  /**
   * 规格组的有序定义。必须显式存：
   * Sku.optionValues 是 jsonb，读回来 key 顺序不可靠，
   * 前台要靠这里做展示排序。
   */
  specGroups?: { name: string; values: string[] }[];
};

/** 新建或更新商品基本信息 */
export async function saveProduct(
  input: ProductInput,
): Promise<AdminResult<{ id: string }>> {
  try {
    await requireAdminAction();
  } catch {
    return { ok: false, message: "无权限" };
  }

  const title = input.title?.trim();
  const slug = input.slug?.trim();
  if (!title) return { ok: false, message: "商品名称不能为空" };
  if (!slug) return { ok: false, message: "URL 标识不能为空" };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return {
      ok: false,
      message: "URL 标识只能用小写字母、数字和连字符，如 sparkler-30cm",
    };
  }
  if (!input.coverImage?.trim()) {
    return { ok: false, message: "请先上传主图" };
  }

  try {
    // slug 冲突检查（更新时排除自己）
    const conflict = await prisma.product.findFirst({
      where: { slug, ...(input.id ? { NOT: { id: input.id } } : {}) },
      select: { id: true },
    });
    if (conflict) return { ok: false, message: "该 URL 标识已被占用" };

    const data = {
      title,
      slug,
      subtitle: input.subtitle?.trim() || null,
      description: input.description?.trim() || null,
      coverImage: input.coverImage.trim(),
      categoryId: input.categoryId || null,
      status: input.status,
      sortOrder: input.sortOrder ?? 0,
      // 不传则保持原值（undefined 会被 Prisma 忽略）
      ...(input.specGroups !== undefined
        ? { specGroups: input.specGroups }
        : {}),
    };

    let id = input.id;
    if (id) {
      await prisma.product.update({ where: { id }, data });
    } else {
      const created = await prisma.product.create({ data });
      id = created.id;
    }

    // 冗余的起售价字段：唯一写入口在这里
    await syncMinPrice(id);

    await revalidateByProductId(id);
    return { ok: true, data: { id } };
  } catch (error) {
    console.error("[saveProduct]", error);
    return { ok: false, message: "保存失败，请重试" };
  }
}

/** 按当前 ACTIVE SKU 重算商品的最低价（列表页「起售价」用） */
async function syncMinPrice(productId: string) {
  const skus = await prisma.sku.findMany({
    where: { productId, isActive: true },
    select: { priceCents: true },
  });
  const min = skus.length > 0 ? Math.min(...skus.map((s) => s.priceCents)) : 0;
  await prisma.product.update({
    where: { id: productId },
    data: { minPriceCents: min },
  });
}

/** 上架 / 下架（软删除用 status = ARCHIVED） */
export async function setProductStatus(
  productId: string,
  status: "DRAFT" | "ACTIVE" | "ARCHIVED",
): Promise<AdminResult> {
  try {
    await requireAdminAction();
  } catch {
    return { ok: false, message: "无权限" };
  }

  try {
    await prisma.product.update({ where: { id: productId }, data: { status } });
    await revalidateByProductId(productId);
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[setProductStatus]", error);
    return { ok: false, message: "操作失败" };
  }
}

/* ─────────────────────────── SKU ─────────────────────────── */

export type SkuInput = {
  id?: string;
  productId: string;
  /** 用户可编辑的规格值，如 { 长度: "30cm", 包装: "10支装" } */
  optionValues: Record<string, string>;
  priceInput: string | number;
  stock: number;
  isActive: boolean;
};

/**
 * 新建或更新 SKU。
 *
 * specKey 一律由 buildSpecKey 生成 —— 手写会与前端算法不一致，
 * 导致前台永远命中不到这个 SKU（这个 bug 真实发生过）。
 */
export async function saveSku(input: SkuInput): Promise<AdminResult<{ id: string }>> {
  try {
    await requireAdminAction();
  } catch {
    return { ok: false, message: "无权限" };
  }

  const cents = yuanToCents(input.priceInput);
  if (cents === null) return { ok: false, message: "价格不合法" };
  if (!Number.isInteger(input.stock) || input.stock < 0) {
    return { ok: false, message: "库存必须是不小于 0 的整数" };
  }

  const cleanOptions: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.optionValues ?? {})) {
    const key = String(k).trim();
    const val = String(v).trim();
    if (key && val) cleanOptions[key] = val;
  }

  const isDefault = Object.keys(cleanOptions).length === 0;
  const specKey = isDefault ? DEFAULT_SPEC_KEY : buildSpecKey(cleanOptions);
  const specText = isDefault ? "" : buildSpecText(cleanOptions);

  try {
    // 同商品内 specKey 不能重复（DB 有唯一约束，这里提前给出友好提示）
    const conflict = await prisma.sku.findFirst({
      where: {
        productId: input.productId,
        specKey,
        ...(input.id ? { NOT: { id: input.id } } : {}),
      },
      select: { id: true },
    });
    if (conflict) {
      return { ok: false, message: "已存在相同的规格组合" };
    }

    let id = input.id;
    const data = {
      productId: input.productId,
      specKey,
      specText,
      optionValues: cleanOptions,
      priceCents: cents,
      stock: input.stock,
      isActive: input.isActive,
    };

    if (id) {
      await prisma.sku.update({ where: { id }, data });
    } else {
      const created = await prisma.sku.create({ data });
      id = created.id;
    }

    await syncMinPrice(input.productId);
    await revalidateByProductId(input.productId);
    return { ok: true, data: { id } };
  } catch (error) {
    console.error("[saveSku]", error);
    return { ok: false, message: "保存失败，请重试" };
  }
}

/** 快速改价（列表页内联编辑用） */
export async function updateSkuPrice(
  skuId: string,
  priceInput: string | number,
): Promise<AdminResult<{ priceCents: number }>> {
  try {
    await requireAdminAction();
  } catch {
    return { ok: false, message: "无权限" };
  }

  const cents = yuanToCents(priceInput);
  if (cents === null) return { ok: false, message: "价格不合法" };

  try {
    const sku = await prisma.sku.update({
      where: { id: skuId },
      data: { priceCents: cents },
      select: { productId: true },
    });
    await syncMinPrice(sku.productId);
    await revalidateByProductId(sku.productId);
    return { ok: true, data: { priceCents: cents } };
  } catch (error) {
    console.error("[updateSkuPrice]", error);
    return { ok: false, message: "改价失败" };
  }
}

/** 快速改库存 */
export async function updateSkuStock(
  skuId: string,
  stock: number,
): Promise<AdminResult<{ stock: number }>> {
  try {
    await requireAdminAction();
  } catch {
    return { ok: false, message: "无权限" };
  }

  if (!Number.isInteger(stock) || stock < 0) {
    return { ok: false, message: "库存必须是不小于 0 的整数" };
  }

  try {
    const updated = await prisma.sku.update({
      where: { id: skuId },
      data: { stock },
      select: { productId: true },
    });
    await revalidateByProductId(updated.productId);
    return { ok: true, data: { stock } };
  } catch (error) {
    console.error("[updateSkuStock]", error);
    return { ok: false, message: "改库存失败" };
  }
}

/** 启用 / 停用 SKU */
export async function setSkuActive(
  skuId: string,
  isActive: boolean,
): Promise<AdminResult> {
  try {
    await requireAdminAction();
  } catch {
    return { ok: false, message: "无权限" };
  }

  try {
    const sku = await prisma.sku.update({
      where: { id: skuId },
      data: { isActive },
      select: { productId: true },
    });
    await syncMinPrice(sku.productId);
    await revalidateByProductId(sku.productId);
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[setSkuActive]", error);
    return { ok: false, message: "操作失败" };
  }
}

/** 删除 SKU（仅在无关联订单时允许） */
export async function deleteSku(skuId: string): Promise<AdminResult> {
  try {
    await requireAdminAction();
  } catch {
    return { ok: false, message: "无权限" };
  }

  try {
    const used = await prisma.orderItem.count({ where: { skuId } });
    if (used > 0) {
      return {
        ok: false,
        message: `该规格已被 ${used} 条历史订单引用，不能删除。请改为「停用」。`,
      };
    }
    const sku = await prisma.sku.delete({
      where: { id: skuId },
      select: { productId: true },
    });
    await syncMinPrice(sku.productId);
    await revalidateByProductId(sku.productId);
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[deleteSku]", error);
    return { ok: false, message: "删除失败" };
  }
}

/* ─────────────────────────── 分类 ─────────────────────────── */

export async function saveCategory(input: {
  id?: string;
  name: string;
  slug: string;
  sortOrder?: number;
}): Promise<AdminResult<{ id: string }>> {
  try {
    await requireAdminAction();
  } catch {
    return { ok: false, message: "无权限" };
  }

  const name = input.name?.trim();
  const slug = input.slug?.trim();
  if (!name || !slug) return { ok: false, message: "名称和标识都要填" };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, message: "标识只能用小写字母、数字和连字符" };
  }

  try {
    const conflict = await prisma.category.findFirst({
      where: { slug, ...(input.id ? { NOT: { id: input.id } } : {}) },
      select: { id: true },
    });
    if (conflict) return { ok: false, message: "该标识已被占用" };

    const data = { name, slug, sortOrder: input.sortOrder ?? 0 };
    let id = input.id;
    if (id) {
      await prisma.category.update({ where: { id }, data });
    } else {
      const created = await prisma.category.create({ data });
      id = created.id;
    }
    await revalidateShop();
    return { ok: true, data: { id } };
  } catch (error) {
    console.error("[saveCategory]", error);
    return { ok: false, message: "保存失败" };
  }
}
