/**
 * 一键启动：数据库 → 网站 → 公网隧道
 *   node scripts/start-all.mjs
 *
 * 为什么不用 .bat：
 *   批处理的错误处理与异步等待很难写对（实测会卡在等待循环里），
 *   Node 有 Promise 和清晰的子进程管理，可靠得多。
 *
 * 幂等：每一步先检查是否已在运行，避免重复启动导致端口冲突。
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { Client } from "pg";

const LOG = "startup.log";
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    // 显式 UTF-8：Windows 默认写 GBK，中文会变乱码
    appendFileSync(LOG, line + "\n", "utf8");
  } catch {
    /* 日志失败不影响启动 */
  }
};

const DB_URL =
  process.env.DATABASE_URL ??
  "postgresql://shop:shoppw@127.0.0.1:55432/shopdev?schema=public";

async function dbReady() {
  const c = new Client({ connectionString: DB_URL });
  try {
    await c.connect();
    await c.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await c.end().catch(() => {});
  }
}

async function webReady() {
  try {
    const r = await fetch("http://localhost:3000/api/health", {
      signal: AbortSignal.timeout(3000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * 后台启动一个命令，输出重定向到文件。
 *
 * ⚠️ 踩过的两个坑：
 *   1. detached + unref：父进程退出后子进程被杀，隧道起不来
 *   2. 直接 spawn cmd /c 带重定向：同样会被回收
 * 可靠做法：Windows 上用 PowerShell 的 Start-Process，
 * 它创建的进程完全独立于当前 Node 进程，并能原生重定向输出。
 */
function launch(label, command, args, logFile) {
  log(`启动 ${label}`);

  if (process.platform === "win32") {
    const argList = args.map((a) => `'${String(a).replace(/'/g, "''")}'`).join(",");
    const ps = [
      `Start-Process -FilePath '${command}'`,
      `-ArgumentList ${argList}`,
      `-RedirectStandardOutput '${logFile}'`,
      `-RedirectStandardError '${logFile}.err'`,
      `-WindowStyle Hidden`,
    ].join(" ");

    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { stdio: "ignore", windowsHide: true },
    );
    child.on("error", (e) => log(`${label} 启动失败: ${e.message}`));
    return child;
  }

  // 非 Windows 用 nohup 风格
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return child;
}

async function waitFor(label, check, seconds) {
  for (let i = 0; i < seconds / 2; i++) {
    if (await check()) {
      log(`${label} 就绪`);
      return true;
    }
    await sleep(2000);
  }
  log(`${label} 等待超时`);
  return false;
}

async function main() {
  log("===== 开始启动 =====");

  // ── 1. 数据库 ──
  if (await dbReady()) {
    log("数据库已在运行，跳过");
  } else {
    launch("数据库", process.execPath, ["scripts/db.mjs", "start"], "db.log");
    if (!(await waitFor("数据库", dbReady, 60))) {
      log("❌ 数据库启动失败，中止");
      process.exit(1);
    }
  }

  // ── 2. 网站 ──
  if (await webReady()) {
    log("网站已在运行，跳过");
  } else {
    // Windows 上 npm 是 npm.cmd
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    launch("网站", npm, ["run", "start"], "web.log");
    if (!(await waitFor("网站", webReady, 90))) {
      log("⚠️ 网站等待超时，但继续启动隧道");
    }
  }

  // ── 3. 公网隧道 ──
  // ⚠️ 用带时间戳的唯一文件名，而不是固定的 tunnel.log：
  //    cloudflared 进程可能仍持有旧文件句柄，覆盖写会 EBUSY（实测踩过）。
  //    每次启动用新文件，既避免锁冲突，也不会读到上一次的旧地址。
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outLog = `tunnel-${stamp}.log`;
  const errLog = `tunnel-${stamp}.log.err`;
  writeFileSync(outLog, "", "utf8");
  writeFileSync(errLog, "", "utf8");

  const cf = existsSync("cloudflared.exe") ? "cloudflared.exe" : "cloudflared";
  launch(
    "隧道",
    cf,
    ["tunnel", "--url", "http://localhost:3000", "--no-autoupdate"],
    outLog,
  );

  // 等待并解析公网地址（cloudflared 把地址打在 stderr）
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    for (const f of [outLog, `${outLog}.err`, errLog]) {
      try {
        if (!existsSync(f)) continue;
        const txt = readFileSync(f, "utf8");
        const m = txt.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
        if (m && m.length) {
          const url = m[m.length - 1]; // 取最新
          log(`✅ 公网地址: ${url}`);
          writeFileSync(".tunnel-url.txt", url + "\n", "utf8");
          log(`（隧道日志: ${outLog} / ${errLog}）`);
          log("===== 启动完成 =====");
          return;
        }
      } catch {
        /* 还没写出来 */
      }
    }
  }
  log("⚠️ 未获取到公网地址，请查看 tunnel-*.log");
}

main().catch((e) => {
  log(`启动异常: ${e.message}`);
  process.exit(1);
});
