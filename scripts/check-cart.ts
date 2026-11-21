/**
 * 购物车快照检查（开发期用）
 *   npx tsx scripts/check-cart.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.cartItem.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sessionId: true,
      userId: true,
      quantity: true,
      priceSnapshotCents: true,
      nameSnapshot: true,
      specTextSnapshot: true,
      imageSnapshot: true,
      sku: { select: { priceCents: true, specText: true, stock: true } },
    },
  });

  console.log(`=== CartItem 共 ${items.length} 行 ===`);
  for (const it of items) {
    console.log(
      JSON.stringify(
        {
          id: it.id.slice(0, 8),
          sessionId: it.sessionId?.slice(0, 8) ?? null,
          quantity: it.quantity,
          snapshotPrice: it.priceSnapshotCents,
          livePrice: it.sku.priceCents,
          priceMatches: it.priceSnapshotCents === it.sku.priceCents,
          name: it.nameSnapshot,
          spec: it.specTextSnapshot,
          image: it.imageSnapshot,
          skuStock: it.sku.stock,
        },
        null,
        0,
      ),
    );
  }

  // 关键校验：快照必须完整
  const incomplete = items.filter(
    (i) =>
      i.priceSnapshotCents <= 0 ||
      !i.nameSnapshot ||
      i.specTextSnapshot === null ||
      i.specTextSnapshot === undefined,
  );
  console.log("\n快照完整性:", incomplete.length === 0 ? "✓ 全部完整" : `✗ ${incomplete.length} 行缺失`);

  const merged = await prisma.cartItem.groupBy({
    by: ["sessionId", "skuId"],
    _count: { id: true },
    having: { skuId: { _count: { gt: 1 } } },
  });
  console.log("同身份同 SKU 重复行:", merged.length === 0 ? "✓ 无（合并生效）" : `✗ ${merged.length} 组重复`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
