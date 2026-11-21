/**
 * 数据库状态检查（开发期用）
 *   npx tsx scripts/check-db.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [categories, products, skus, slots, users, draft, zeroStock] =
    await Promise.all([
      prisma.category.count(),
      prisma.product.count(),
      prisma.sku.count(),
      prisma.pickupSlot.count(),
      prisma.user.count(),
      prisma.product.count({ where: { status: "DRAFT" } }),
      prisma.sku.count({ where: { stock: 0 } }),
    ]);

  console.log("=== 表行数 ===");
  console.log(
    JSON.stringify(
      { categories, products, skus, slots, users, draftProducts: draft, zeroStockSkus: zeroStock },
      null,
      1,
    ),
  );

  // 取第一个在售商品，不写死 slug
  const sampleProduct = await prisma.product.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    select: { slug: true, title: true },
  });

  const sample = await prisma.sku.findMany({
    where: { product: { slug: sampleProduct?.slug } },
    select: { specKey: true, specText: true, stock: true, priceCents: true },
    orderBy: { sortOrder: "asc" },
  });
  console.log(
    `\n=== ${sampleProduct?.title ?? "(无在售商品)"} 的 SKU（specKey 由 buildSpecKey 生成）===`,
  );
  for (const s of sample) {
    console.log(
      `  ${s.specKey.padEnd(26)} | ${s.specText.padEnd(14)} | ¥${(s.priceCents / 100).toFixed(2)} | 库存 ${s.stock}`,
    );
  }

  const draftProduct = await prisma.product.findFirst({
    where: { status: "DRAFT" },
    select: { slug: true, title: true },
  });
  console.log("\n=== DRAFT 商品（前台应不可达）===");
  console.log(" ", draftProduct?.slug, "-", draftProduct?.title);

  const store = await prisma.store.findFirst({ select: { name: true } });
  console.log("\n=== 门店 ===");
  console.log(" ", store?.name);

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { email: true, role: true },
  });
  console.log("\n=== 管理员 ===");
  console.log(" ", admin?.email, "role=", admin?.role);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
