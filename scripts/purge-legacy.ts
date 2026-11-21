/**
 * 清理旧品类残留数据
 *   npx tsx scripts/purge-legacy.ts
 *
 * seed 用 upsert 只新增/更新，不会删除已不在种子列表里的商品。
 * 换品类时旧商品会留在库里继续被前台查到，必须显式清理。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 当前有效的商品 slug —— 与 prisma/seed.ts 保持一致 */
const KEEP_SLUGS = [
  "sparkler-30cm",
  "ground-spinner",
  "fountain-candle",
  "safety-kit",
  "party-gift-box",
  "draft-test-product",
];

/** 当前有效的分类 slug */
const KEEP_CATEGORIES = ["kids", "handheld", "gift-box"];

async function main() {
  const legacyProducts = await prisma.product.findMany({
    where: { slug: { notIn: KEEP_SLUGS } },
    select: { id: true, slug: true, title: true, _count: { select: { orderItems: true } } },
  });

  console.log(`发现 ${legacyProducts.length} 个非当前品类商品：`);
  for (const p of legacyProducts) {
    console.log(`  ${p.slug} (${p.title})，历史订单行 ${p._count.orderItems}`);
  }

  // 有历史订单的商品不能物理删除（OrderItem 靠快照渲染，但 skuId 外键要 SetNull）
  // 这里直接删商品，Prisma 会按 onDelete 规则处理关联
  if (legacyProducts.length > 0) {
    const deleted = await prisma.product.deleteMany({
      where: { id: { in: legacyProducts.map((p) => p.id) } },
    });
    console.log(`✓ 已删除 ${deleted.count} 个旧商品（其 SKU 级联删除）`);
  }

  const legacyCats = await prisma.category.findMany({
    where: { slug: { notIn: KEEP_CATEGORIES } },
    select: { id: true, slug: true, name: true },
  });
  console.log(`\n发现 ${legacyCats.length} 个非当前分类：`);
  for (const c of legacyCats) console.log(`  ${c.slug} (${c.name})`);

  if (legacyCats.length > 0) {
    const deleted = await prisma.category.deleteMany({
      where: { id: { in: legacyCats.map((c) => c.id) } },
    });
    console.log(`✓ 已删除 ${deleted.count} 个旧分类`);
  }

  const remaining = await prisma.product.findMany({
    select: { slug: true, title: true, status: true },
    orderBy: { sortOrder: "asc" },
  });
  console.log("\n当前商品列表：");
  for (const p of remaining) {
    console.log(`  [${p.status}] ${p.slug} — ${p.title}`);
  }

  const cats = await prisma.category.findMany({
    select: { slug: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
  console.log("\n当前分类：");
  for (const c of cats) console.log(`  ${c.slug} — ${c.name}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
