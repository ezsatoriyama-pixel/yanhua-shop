/**
 * 从 Neon 导出商品数据为 JSON，供静态站构建时读取
 *   node scripts/export-data.cjs
 *
 * 为什么用 pg 而不是 Prisma：
 *   Prisma 在这个网络环境下与 Neon 的 TLS 协商会失败（超时），
 *   而 pg 驱动可以正常连接。导出是一次性任务，用 pg 更直接。
 */
const { Client } = require("pg");
const { writeFileSync, mkdirSync } = require("node:fs");
const path = require("node:path");

const url =
  process.env.PG_URL ??
  "postgresql://neondb_owner:npg_nT7faS6wDQPM@ep-misty-base-b30o11ne.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

async function main() {
  await client.connect();
  console.log("已连接 Neon");

  const cats = await client.query(
    `SELECT id, name, slug FROM "Category" WHERE "isActive" = true ORDER BY "sortOrder" ASC`,
  );

  const prods = await client.query(
    `SELECT id, slug, title, subtitle, description, "coverImage",
            "sortOrder", "categoryId", "specGroups"
     FROM "Product" WHERE status = 'ACTIVE'
     ORDER BY "sortOrder" ASC`,
  );

  const skus = await client.query(
    `SELECT id, "productId", "specKey", "specText", "optionValues",
            "priceCents", stock, image
     FROM "Sku" WHERE "isActive" = true
     ORDER BY "productId", "sortOrder" ASC`,
  );

  const stores = await client.query(
    `SELECT name, address, phone, notice FROM "Store" WHERE "isActive" = true LIMIT 1`,
  );

  const catById = new Map(cats.rows.map((c) => [c.id, c]));

  const products = prods.rows.map((p) => {
    const mySkus = skus.rows.filter((s) => s.productId === p.id);
    const cat = p.categoryId ? catById.get(p.categoryId) : null;
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      subtitle: p.subtitle,
      description: p.description,
      coverImage: p.coverImage,
      sortOrder: p.sortOrder,
      category: cat ? { name: cat.name, slug: cat.slug } : null,
      specGroups: p.specGroups,
      skus: mySkus.map((s) => ({
        id: s.id,
        specKey: s.specKey,
        specText: s.specText,
        optionValues: s.optionValues,
        priceCents: s.priceCents,
        stock: s.stock,
        image: s.image,
      })),
      minPriceCents: mySkus.length
        ? Math.min(...mySkus.map((s) => s.priceCents))
        : 0,
      inStock: mySkus.some((s) => s.stock > 0),
    };
  });

  const data = {
    generatedAt: new Date().toISOString(),
    store: stores.rows[0] ?? null,
    categories: cats.rows,
    products,
  };

  const outDir = path.join(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "catalog.json"),
    JSON.stringify(data, null, 2),
    "utf8",
  );

  console.log("✓ 已写入 data/catalog.json");
  console.log("  分类:", cats.rowCount);
  console.log("  商品:", products.length);
  console.log("  SKU:", skus.rowCount);
  console.log("  门店:", data.store?.name ?? "(无)");
  for (const p of products) {
    console.log(`   - ${p.title}  ¥${(p.minPriceCents / 100).toFixed(2)} 起  ${p.skus.length} 个规格`);
  }

  await client.end();
}

main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
