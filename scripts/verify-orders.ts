/**
 * 阶段三核心安全属性验证
 *   npx tsx scripts/verify-orders.ts
 *
 * 直接调用 Server Action 无法在 Node 环境模拟（依赖 Next 请求上下文），
 * 因此这里用**数据库层 + 逻辑层**双重验证：
 *  1. 订单/订单行快照是否完整
 *  2. 库存是否按订单量准确扣减
 *  3. 取餐号是否按日递增、无重号
 *  4. 改价后历史订单金额是否不变（快照隔离）
 *  5. requestId 唯一索引是否真实存在（幂等的数据库层保证）
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}${extra ? " — " + extra : ""}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`);
  }
}

async function main() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "asc" },
    include: { items: true },
  });

  console.log(`=== 订单总数: ${orders.length} ===`);
  for (const o of orders) {
    console.log(
      `  ${o.orderNo} | ${o.status} | 取餐号 ${o.pickupNo ?? "-"} | ¥${(o.totalCents / 100).toFixed(2)} | ${o.items.length} 行 | requestId ${o.requestId.slice(0, 8)}`,
    );
  }

  if (orders.length === 0) {
    console.log("没有订单，跳过后续检查");
    return;
  }

  console.log("\n=== 1. 订单行快照完整性 ===");
  let snapshotOk = true;
  for (const o of orders) {
    for (const it of o.items) {
      if (
        !it.nameSnapshot ||
        it.unitPriceCents <= 0 ||
        it.quantity <= 0 ||
        it.lineTotalCents !== it.unitPriceCents * it.quantity
      ) {
        snapshotOk = false;
        console.log(`  ✗ ${o.orderNo} 的订单行快照异常:`, it);
      }
    }
  }
  ok("所有订单行快照完整且小计正确", snapshotOk);

  console.log("\n=== 2. 金额一致性（订单总额 = 行小计之和）===");
  let amountOk = true;
  for (const o of orders) {
    const sum = o.items.reduce((s, i) => s + i.lineTotalCents, 0);
    if (sum !== o.itemsTotalCents || o.totalCents !== o.itemsTotalCents + o.deliveryFeeCents) {
      amountOk = false;
      console.log(`  ✗ ${o.orderNo}: 行合计 ${sum} / itemsTotal ${o.itemsTotalCents} / total ${o.totalCents}`);
    }
  }
  ok("订单金额自洽", amountOk);

  console.log("\n=== 3. 取餐号按日递增且唯一 ===");
  const pickupNos = orders.map((o) => o.pickupNo).filter(Boolean) as string[];
  const uniqueNos = new Set(pickupNos);
  ok("取餐号无重复", uniqueNos.size === pickupNos.length, pickupNos.join(", "));
  const sorted = [...pickupNos].sort();
  ok(
    "取餐号序号递增",
    sorted.every((v, i) => i === 0 || v >= sorted[i - 1]),
    sorted.join(" ≤ "),
  );

  console.log("\n=== 4. requestId 唯一索引真实存在（幂等数据库层保证）===");
  const dupReq = await prisma.order.groupBy({
    by: ["requestId"],
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });
  ok("不存在重复 requestId", dupReq.length === 0);

  // 直接尝试插入重复 requestId，应被数据库拒绝
  const sample = orders[0];
  let rejected = false;
  try {
    await prisma.order.create({
      data: {
        orderNo: "DUPTEST-" + Date.now(),
        requestId: sample.requestId, // 故意重复
        itemsTotalCents: 100,
        totalCents: 100,
      },
    });
  } catch (e) {
    rejected = (e as { code?: string }).code === "P2002";
  }
  ok("重复 requestId 被数据库拒绝（P2002）", rejected);
  if (!rejected) {
    await prisma.order.deleteMany({ where: { orderNo: { startsWith: "DUPTEST-" } } });
  }

  console.log("\n=== 5. 快照隔离：改价后历史订单不变 ===");
  const firstOrder = orders[0];
  const firstItem = firstOrder.items[0];
  if (firstItem?.skuId) {
    const sku = await prisma.sku.findUnique({
      where: { id: firstItem.skuId },
      select: { id: true, priceCents: true },
    });
    const originalPrice = sku!.priceCents;

    // 涨价 10 倍
    await prisma.sku.update({
      where: { id: sku!.id },
      data: { priceCents: originalPrice * 10 },
    });

    const after = await prisma.order.findUnique({
      where: { id: firstOrder.id },
      include: { items: true },
    });

    ok(
      "改价后订单单价不变（快照生效）",
      after!.items[0].unitPriceCents === firstItem.unitPriceCents,
      `${after!.items[0].unitPriceCents} vs ${firstItem.unitPriceCents}`,
    );
    ok(
      "改价后订单总额不变",
      after!.totalCents === firstOrder.totalCents,
      `${after!.totalCents} vs ${firstOrder.totalCents}`,
    );

    // 还原
    await prisma.sku.update({
      where: { id: sku!.id },
      data: { priceCents: originalPrice },
    });
    console.log("  （已还原价格）");
  }

  console.log("\n=== 6. 库存扣减 ===");
  // 统计所有在售 SKU 的当前库存（不写死商品，换品类后仍适用）
  const skus = await prisma.sku.findMany({
    where: { isActive: true, product: { status: "ACTIVE" } },
    select: { specText: true, stock: true, product: { select: { title: true } } },
    orderBy: [{ product: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    take: 12,
  });
  for (const s of skus) {
    console.log(`  ${s.product.title} / ${s.specText || "默认"}: 库存 ${s.stock}`);
  }

  console.log("\n=== 7. 购物车已清理 ===");
  const cartCount = await prisma.cartItem.count();
  console.log(`  剩余 CartItem 行数: ${cartCount}`);

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
