/**
 * 修改后台登录凭据
 *   npx tsx scripts/set-admin.ts <账号> <密码>
 *
 * 说明：本站的登录标识存在 User.email 字段（唯一索引）。
 * 这里允许填非邮箱格式的账号（如 1232456），登录页的输入框
 * 已改为 text 类型以接受这类账号。
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const account = (process.argv[2] ?? "").trim();
  const password = process.argv[3] ?? "";

  if (!account || !password) {
    console.error("用法: npx tsx scripts/set-admin.ts <账号> <密码>");
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("密码至少 6 位");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // 找到现有管理员（可能还是占位邮箱），改掉它的凭据
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
        passwordHash,
        emailVerified: new Date(),
      },
      select: { id: true, email: true },
    });
    console.log(`✓ 已创建管理员：${created.email}`);
  } else {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { email: account, passwordHash },
      select: { email: true, role: true },
    });
    console.log(`✓ 已更新：${existing.email} → ${updated.email}`);
  }

  // 立刻验证一遍，避免出现"改了但登不上"
  const check = await prisma.user.findUnique({
    where: { email: account },
    select: { passwordHash: true, role: true },
  });
  const valid = check?.passwordHash
    ? await bcrypt.compare(password, check.passwordHash)
    : false;

  console.log(`  角色: ${check?.role ?? "-"}`);
  console.log(`  密码校验: ${valid ? "通过 ✅" : "失败 ❌"}`);
  if (!valid) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
