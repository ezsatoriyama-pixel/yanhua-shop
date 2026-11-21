/**
 * 重置业务数据（保留商品/SKU/时段/门店，清空订单与购物车）
 *   npx tsx scripts/reset-orders.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.deleteMany();
  const cart = await prisma.cartItem.deleteMany();
  const counters = await prisma.dailyCounter.deleteMany();
  const slots = await prisma.pickupSlot.updateMany({
    data: { booked: 0 },
  });

  console.log("已清理：");
  console.log(`  订单 ${orders.count} 条`);
  console.log(`  购物车行 ${cart.count} 条`);
  console.log(`  计数器 ${counters.count} 个`);
  console.log(`  时段占用重置 ${slots.count} 个`);
  console.log("\n商品 / SKU / 门店 / 时段定义保持不变。");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
