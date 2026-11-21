/**
 * 重置 Neon 角色密码并生成可用连接串
 *   node scripts/neon-reset-pw.mjs <API_KEY>
 */
const key = process.argv[2];
if (!key) {
  console.error("用法: node scripts/neon-reset-pw.mjs <API_KEY>");
  process.exit(1);
}

const BASE = "https://console.neon.tech/api/v2";
const H = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { ...H, ...(opts.headers ?? {}) },
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!r.ok) throw new Error(`${r.status} ${path} → ${json?.message ?? text.slice(0, 150)}`);
  return json;
}

const PROJECT = "empty-cloud-16108364";
const BRANCH = "br-hidden-poetry-b30hcslx";
const ROLE = "neondb_owner";
const DB = "neondb";

async function main() {
  console.log("① 重置角色密码…");
  // POST /projects/{id}/branches/{bid}/roles/{role}/reset_password
  let password = null;
  try {
    const r = await api(
      `/projects/${PROJECT}/branches/${BRANCH}/roles/${ROLE}/reset_password`,
      { method: "POST", body: JSON.stringify({}) },
    );
    password = r.password ?? r.role?.password;
    console.log("   重置成功，密码长度:", password?.length ?? 0);
  } catch (e) {
    console.log("   重置接口失败:", e.message);
    console.log("   改用 reveal_password 再试…");
    const r = await api(
      `/projects/${PROJECT}/branches/${BRANCH}/roles/${ROLE}/reveal_password`,
    );
    password = r.password;
    console.log("   读到密码长度:", password?.length ?? 0);
  }

  if (!password) {
    console.error("拿不到密码，退出");
    process.exit(1);
  }

  const pooled = `postgresql://${ROLE}:${password}@${PROJECT}-pooler.ap-southeast-1.aws.neon.tech/${DB}?sslmode=require`;
  const direct = `postgresql://${ROLE}:${password}@${PROJECT}.ap-southeast-1.aws.neon.tech/${DB}?sslmode=require`;

  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    ".neon-conn.env",
    `DATABASE_URL="${pooled}"\nDIRECT_URL="${direct}"\n`,
    "utf8",
  );
  console.log("\n② 已写入 .neon-conn.env");

  // 立刻验证
  console.log("③ 验证直连…");
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: direct,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await c.connect();
    const r = await c.query("select current_database() db, version() v");
    console.log("   ✓ 连接成功:", r.rows[0].db);
    console.log("   ", r.rows[0].v.slice(0, 45));
  } catch (e) {
    console.log("   ✗ 连接失败:", e.message);
    process.exit(2);
  } finally {
    await c.end().catch(() => {});
  }

  console.log("\n=== 连接串 ===");
  console.log("pooled:", pooled.replace(/:([^:@]+)@/, ":****@"));
  console.log("direct:", direct.replace(/:([^:@]+)@/, ":****@"));
}

main().catch((e) => {
  console.error("失败:", e.message);
  process.exit(1);
});
