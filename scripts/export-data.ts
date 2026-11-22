/**
 * 从 Neon 导出商品数据为 JSON，供静态站构建时读取
 *   npx tsx scripts/export-data.ts
 *
 * 为什么要这一步：
 *   GitHub Pages 没有服务端，构建时不能连数据库。
 *   所以先把数据导成 JSON 存进仓库，构建时直接 import。
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const url =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  "postgresql://neondb_owner:npg_nT7faS6wDQPM@ep-misty-base-b30o11ne.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  console.log("读取商品数据…");

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, slug: true },
  });

  const products = await prisma.product.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      description: true,
      coverImage: true,
      sortOrder: true,
      categoryId: true,
      category: { select: { name: true, slug: true } },
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

  const store = await prisma.store.findFirst({
    where: { isActive: true },
    select: { name: true, address: true, phone: true, notice: true },
  });

  const data = {
    generatedAt: new Date().toISOString(),
    store,
    categories,
    products: products.map((p) => ({
      ...p,
      minPriceCents:
        p.skus.length > 0 ? Math.min(...p.skus.map((s) => s.priceCents)) : 0,
      inStock: p.skus.some((s) => s.stock > 0),
    })),
  };

  const outDir = path.join(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "catalog.json");
  writeFileSync(outFile, JSON.stringify(data, null, 2), "utf8");

  console.log(`✓ 已导出到 data/catalog.json`);
  console.log(`  分类 ${categories.length} 个`);
  console.log(`  商品 ${products.length} 个`);
  console.log(`  SKU ${products.reduce((s, p) => s + p.skus.length, 0)} 个`);
  console.log(`  门店: ${store?.name ?? "(未配置)"}`);
}

main()
  .catch((e) => {
    console.error("ERR", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
