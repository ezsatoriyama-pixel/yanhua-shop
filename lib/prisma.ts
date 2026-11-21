import { PrismaClient } from "@prisma/client";

/**
 * Prisma 单例。
 * 开发环境热更新会重复执行模块，必须挂到 globalThis 上，
 * 否则每次 HMR 都会新建连接池，几十次后数据库连接被打满。
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
