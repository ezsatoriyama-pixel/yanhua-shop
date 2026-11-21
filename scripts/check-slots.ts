import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.pickupSlot.findMany({
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: { id: true, date: true, startTime: true, endTime: true, capacity: true, booked: true, isActive: true },
  });

  console.log(`PickupSlot 共 ${rows.length} 行\n`);

  const byDate = new Map<string, number>();
  for (const r of rows) {
    const k = r.date.toISOString().slice(0, 10);
    byDate.set(k, (byDate.get(k) ?? 0) + 1);
  }
  console.log("按日期分组：");
  for (const [d, n] of [...byDate.entries()].sort()) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dd = new Date(d);
    const diff = Math.round((dd.getTime() - today.getTime()) / 86400000);
    console.log(`  ${d}  ${n} 个   diff=${diff}天`);
  }

  console.log("\n今天 =", new Date().toISOString().slice(0, 10));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
