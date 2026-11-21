import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * 同步线上（Neon）管理员密码
 *
 *   $env:DATABASE_URL="<Neon direct 连接串>"
 *   npx tsx scripts/sync-prod-password.ts <账号> <密码>
 *
 * 为什么需要这个脚本：
 *   `prisma db seed` 用的是固定初始密码（admin123456），
 *   而本地改密码只影响本地库。线上库必须单独同步一次，
 *   否则会出现"本地能登、线上登不上"的情况。
 */

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("请先设置 DATABASE_URL 或 DIRECT_URL 环境变量");
  process.exit(1);
}

const account = process.argv[2] ?? "1232456";
const password = process.argv[3] ?? "";
if (!password) {
  console.error("用法: npx tsx scripts/sync-prod-password.ts <账号> <密码>");
  process.exit(1);
}
if (password.length < 6) {
  console.error("密码至少 6 位");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

async function main() {
  const hash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });

  if (!existing) {
    const created = await prisma.user.create({
      data: {
        email: account,
        name: "店主",
        role: "ADMIN",
        passwordHash: hash,
        emailVerified: new Date(),
      },
      select: { email: true },
    });
    console.log(`✓ 已创建管理员: ${created.email}`);
  } else {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { email: account, passwordHash: hash },
      select: { email: true, role: true },
    });
    console.log(`✓ 已更新: ${existing.email} → ${updated.email} (${updated.role})`);
  }

  // 立刻验证，避免"改了但登不上"
  const check = await prisma.user.findUnique({
    where: { email: account },
    select: { passwordHash: true, role: true },
  });
  const ok = check?.passwordHash
    ? await bcrypt.compare(password, check.passwordHash)
    : false;
  console.log(`  密码校验: ${ok ? "通过 ✅" : "失败 ❌"}`);
  if (!ok) process.exit(1);
}

main()
  .catch((e) => {
    console.error("ERR", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
