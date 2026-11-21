/**
 * 并发防超卖专项测试
 *   npx tsx scripts/verify-oversell.ts
 *
 * 模拟 N 个请求同时抢购库存为 K 的同一 SKU。
 * 直接对数据库执行与 createOrder 事务内**完全相同**的条件扣减语句：
 *   UPDATE sku SET stock = stock - 1 WHERE id = ? AND stock >= 1
 * 期望：成功次数 === K，且库存永不为负。
 *
 * 这验证的是防护机制本身（条件更新），不依赖 Next 请求上下文。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}

const CONCURRENCY = 20;

async function main() {
  // 造一个专用测试 SKU，库存 5
  // 取任意一个在售商品做宿主，不写死 slug（换品类后脚本仍可用）
  const product = await prisma.product.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    select: { id: true, slug: true },
  });
  if (!product) throw new Error("找不到在售商品，请先 seed");

  const testSku = await prisma.sku.upsert({
    where: { productId_specKey: { productId: product.id, specKey: "__oversell_test__" } },
    update: { stock: 5, isActive: true },
    create: {
      productId: product.id,
      specKey: "__oversell_test__",
      specText: "并发测试规格",
      optionValues: {},
      priceCents: 100,
      stock: 5,
      isActive: false, // 不对外展示
    },
    select: { id: true, stock: true },
  });

  console.log(`测试 SKU 库存: ${testSku.stock}`);
  console.log(`并发请求数: ${CONCURRENCY}`);
  console.log(`（预期：恰好 5 次成功，库存归零，绝不为负）\n`);

  // 同时发起 20 个条件扣减，每个扣 1
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, () =>
      prisma.sku
        .updateMany({
          where: { id: testSku.id, stock: { gte: 1 } },
          data: { stock: { decrement: 1 } },
        })
        .then((r) => r.count)
        .catch(() => 0),
    ),
  );

  const succeeded = results.reduce((s, c) => s + c, 0);
  const after = await prisma.sku.findUnique({
    where: { id: testSku.id },
    select: { stock: true },
  });

  console.log(`成功扣减次数: ${succeeded}`);
  console.log(`最终库存: ${after!.stock}`);

  ok("成功次数等于初始库存（无超卖）", succeeded === 5, `${succeeded} / 5`);
  ok("最终库存为 0", after!.stock === 0, String(after!.stock));
  ok("库存不为负", (after!.stock ?? 0) >= 0, String(after!.stock));
  ok(
    "失败的请求数 = 并发数 - 库存",
    CONCURRENCY - succeeded === 15,
    String(CONCURRENCY - succeeded),
  );

  // 清理测试 SKU
  await prisma.sku.delete({ where: { id: testSku.id } });
  console.log("\n（已清理测试 SKU）");

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
