#!/usr/bin/env node
/**
 * 本地开发数据库管理脚本（便携 PostgreSQL 18，零手工安装）
 *
 *   node scripts/db.mjs start     启动数据库（数据保存在 .pgdata/）
 *   node scripts/db.mjs stop      停止数据库
 *   node scripts/db.mjs status    查看状态 / 连接串
 *
 * 仅用于本地开发。生产环境请使用 Supabase / Neon 的连接串，
 * 不需要这个脚本，见 README 与 .env.example。
 */
import EmbeddedPostgres from "embedded-postgres";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const DATA_DIR = resolve(process.cwd(), ".pgdata");
const PORT = 55432;
const DB_NAME = "shopdev";
const USER = "shop";
const PASSWORD = "shoppw";

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  // 关键：Windows 中文系统默认 locale 会推导出 GBK 编码，initdb 直接失败。
  // 显式指定 UTF8 + C locale，保证与生产环境（Supabase/Neon 均为 UTF8）一致。
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

const connectionString = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}?schema=public`;

const action = process.argv[2] ?? "status";

if (action === "start") {
  mkdirSync(DATA_DIR, { recursive: true });
  try {
    await pg.initialise();
    console.log("[db] 初始化数据目录完成");
  } catch {
    // 已初始化过会抛错，忽略即可
    console.log("[db] 数据目录已存在，跳过初始化");
  }
  await pg.start();
  try {
    await pg.createDatabase(DB_NAME);
    console.log(`[db] 已创建数据库 ${DB_NAME}`);
  } catch {
    console.log(`[db] 数据库 ${DB_NAME} 已存在`);
  }
  console.log("[db] 已启动 ✅");
  console.log(`[db] DATABASE_URL="${connectionString}"`);
  // 保持进程存活，Ctrl+C 停止
  process.stdin.resume();
} else if (action === "stop") {
  await pg.stop();
  console.log("[db] 已停止");
} else {
  console.log(`[db] DATABASE_URL="${connectionString}"`);
  console.log(`[db] 数据目录: ${DATA_DIR}`);
}
