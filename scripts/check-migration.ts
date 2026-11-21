import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cols = await prisma.$queryRaw<
    { column_name: string; data_type: string }[]
  >`SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'Product' AND column_name = 'specGroups'`;
  console.log("Product.specGroups 列:", JSON.stringify(cols));

  const migrations = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations ORDER BY finished_at`;
  console.log("已应用迁移:");
  for (const m of migrations) console.log("  -", m.migration_name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
