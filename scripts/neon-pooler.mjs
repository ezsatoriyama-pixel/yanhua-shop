/**
 * 启用 Neon 连接池，然后输出最终连接串
 *
 * 为什么必须开池：
 *   Vercel Serverless 每次请求都可能新建数据库连接，
 *   不开池会很快耗尽 Neon 的连接数上限，线上表现为 500。
 */
const key = process.argv[2];
const BASE = "https://console.neon.tech/api/v2";
const H = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function api(p, opts = {}) {
  const r = await fetch(BASE + p, {
    ...opts,
    headers: { ...H, ...(opts.headers ?? {}) },
  });
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {
    /* ignore */
  }
  if (!r.ok) throw new Error(`${r.status} ${p} → ${j?.message ?? t.slice(0, 150)}`);
  return j;
}

const PROJECT = "empty-cloud-16108364";
const EP = "ep-misty-base-b30o11ne";
const BRANCH = "br-hidden-poetry-b30hcslx";

async function main() {
  console.log("① 检查端点当前状态…");
  const ep = await api(`/projects/${PROJECT}/endpoints/${EP}`);
  console.log("   host:", ep.endpoint?.host);
  console.log("   pooler_enabled:", ep.endpoint?.pooler_enabled);

  if (!ep.endpoint?.pooler_enabled) {
    console.log("② 开启连接池…");
    try {
      await api(`/projects/${PROJECT}/endpoints/${EP}`, {
        method: "PATCH",
        body: JSON.stringify({ endpoint: { pooler_enabled: true } }),
      });
      console.log("   已开启");
      // 等一会儿让配置生效
      await new Promise((r) => setTimeout(r, 8000));
    } catch (e) {
      console.log("   开启失败:", e.message);
    }
  } else {
    console.log("② 连接池已开启");
  }

  console.log("③ 重新读取端点…");
  const ep2 = await api(`/projects/${PROJECT}/endpoints/${EP}`);
  const host = ep2.endpoint?.host;
  const pooler = ep2.endpoint?.pooler_enabled;
  console.log("   host:", host);
  console.log("   pooler_enabled:", pooler);

  // 读密码
  const role = await api(
    `/projects/${PROJECT}/branches/${BRANCH}/roles/neondb_owner/reveal_password`,
  );
  const pw = role.password;

  // pooled 串：在第一个域名段后加 -pooler
  // 例：ep-x-y.c-4.ap-southeast-1.aws.neon.tech
  //  →  ep-x-y-pooler.c-4.ap-southeast-1.aws.neon.tech
  const pooledHost = host.replace(/^([^.]+)/, "$1-pooler");
  const direct = `postgresql://neondb_owner:${pw}@${host}/neondb?sslmode=require`;
  const pooled = `postgresql://neondb_owner:${pw}@${pooledHost}/neondb?sslmode=require&pgbouncer=true&connection_limit=1`;

  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    ".neon-conn.env",
    `DATABASE_URL="${pooled}"\nDIRECT_URL="${direct}"\n`,
    "utf8",
  );

  console.log("\n=== 最终连接串 ===");
  console.log("DATABASE_URL (pooled):");
  console.log("  " + pooled.replace(/:([^:@]+)@/, ":****@"));
  console.log("DIRECT_URL (direct):");
  console.log("  " + direct.replace(/:([^:@]+)@/, ":****@"));

  // 验证两个串都能连
  const { Client } = await import("pg");
  console.log("\n④ 验证连接…");
  for (const [label, url] of [
    ["direct", direct],
    ["pooled", pooled],
  ]) {
    const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    try {
      await c.connect();
      const r = await c.query("select 1 as ok");
      console.log(`   ${label}: ✓ (${r.rows[0].ok})`);
    } catch (e) {
      console.log(`   ${label}: ✗ ${e.message.slice(0, 80)}`);
    } finally {
      await c.end().catch(() => {});
    }
  }
}

main().catch((e) => {
  console.error("失败:", e.message);
  process.exit(1);
});
