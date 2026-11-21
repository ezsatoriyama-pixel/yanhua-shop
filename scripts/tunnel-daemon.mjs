/**
 * 隧道守护进程：断线自动重连 + 地址变化自动更新
 *   node scripts/tunnel-daemon.mjs
 *
 * 解决两个限制：
 *  1. 隧道断开后无人拉起 → 本进程持续监控，断了立刻重连
 *  2. 地址变了不知道 → 每次重连后把新地址写入 .tunnel-url.txt
 *
 * 不解决的部分（需要云端服务器，无法在本地绕过）：
 *  - 电脑关机时网站仍在线
 *  - 地址永久不变（trycloudflare 免费隧道每次地址都不同）
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const LOG = "daemon.log";
const URL_FILE = ".tunnel-url.txt";
const HISTORY = ".tunnel-history.txt";

const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(LOG, line + "\n", "utf8");
  } catch {
    /* ignore */
  }
};

/** 检查网站本身是否活着（隧道断了不等于网站挂了） */
async function webAlive() {
  try {
    const r = await fetch("http://localhost:3000/api/health", {
      signal: AbortSignal.timeout(4000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** 检查公网地址是否真的可达。
 *
 * ⚠️ 新建的 quick tunnel 需要 10~25 秒才在 Cloudflare 边缘生效，
 *    这段时间访问会返回 502/530。如果检测太急，会把"还没生效"
 *    误判成"已失效"，导致不停重建新地址（实测发生过：连建 3 次）。
 *    因此这里给足超时，并允许连续失败 2 次才判定失效。 */
async function publicAlive(url) {
  try {
    const r = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(20000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

let child = null;
let currentUrl = null;
let restartCount = 0;

function stopTunnel() {
  if (child && !child.killed) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  child = null;
}

/** 启动一个 cloudflared 进程，返回新地址（失败返回 null） */
function startTunnel() {
  return new Promise((resolve) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outLog = `tunnel-${stamp}.log`;
    const errLog = `tunnel-${stamp}.log.err`;
    writeFileSync(outLog, "", "utf8");
    writeFileSync(errLog, "", "utf8");

    const cf = existsSync("cloudflared.exe") ? "cloudflared.exe" : "cloudflared";
    const argList = [
      "'tunnel'",
      "'--url'",
      "'http://localhost:3000'",
      "'--no-autoupdate'",
    ].join(",");

    const ps = [
      `Start-Process -FilePath '${cf}'`,
      `-ArgumentList ${argList}`,
      `-RedirectStandardOutput '${outLog}'`,
      `-RedirectStandardError '${errLog}'`,
      `-WindowStyle Hidden -PassThru`,
    ].join(" ");

    child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { stdio: "ignore", windowsHide: true },
    );
    child.on("error", (e) => log(`启动失败: ${e.message}`));

    // 轮询日志找地址，最多 60 秒
    (async () => {
      for (let i = 0; i < 30; i++) {
        await sleep(2000);
        try {
          const { readFileSync } = await import("node:fs");
          for (const f of [errLog, outLog]) {
            if (!existsSync(f)) continue;
            const txt = readFileSync(f, "utf8");
            const m = txt.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
            if (m && m.length) {
              resolve(m[m.length - 1]);
              return;
            }
          }
        } catch {
          /* ignore */
        }
      }
      resolve(null);
    })();
  });
}

async function healthLoop() {
  log("守护启动");

  let failStreak = 0;
  let urlBornAt = 0;

  while (true) {
    // ── 本地网站是否活着 ──
    if (!(await webAlive())) {
      log("⚠️ 本地网站无响应，等待 15 秒（请确认 npm run start 在跑）");
      await sleep(15000);
      continue;
    }

    // ── 没有地址：直接建 ──
    if (!currentUrl) {
      const url = await startTunnel();
      if (url) {
        currentUrl = url;
        urlBornAt = Date.now();
        failStreak = 0;
        writeFileSync(URL_FILE, url + "\n", "utf8");
        try {
          appendFileSync(HISTORY, `${new Date().toISOString()}\t${url}\n`, "utf8");
        } catch {
          /* ignore */
        }
        restartCount++;
        log(`✅ 新地址: ${url}（第 ${restartCount} 次建立）`);
      } else {
        log("❌ 建隧道失败，60 秒后重试");
        await sleep(60000);
      }
      await sleep(10000);
      continue;
    }

    // ── 有地址：检查可达性 ──
    // 新地址有 30 秒宽限期，不判定失效（边缘生效需要时间）
    const ageMs = Date.now() - urlBornAt;
    if (ageMs < 30000) {
      await sleep(10000);
      continue;
    }

    if (await publicAlive(currentUrl)) {
      if (failStreak > 0) log("✓ 隧道恢复正常");
      failStreak = 0;
      await sleep(45000);
      continue;
    }

    failStreak++;
    // 连续失败 2 次（即至少约 2 分钟不可达）才重建，避免抖动导致地址乱变
    if (failStreak < 2) {
      log(`⚠️ 检测失败 ${failStreak}/2，稍后复查（避免误判）`);
      await sleep(20000);
      continue;
    }

    log(`✗ 隧道确认失效（连续 ${failStreak} 次），重建中…`);
    stopTunnel();
    await sleep(3000);
    currentUrl = null;
    failStreak = 0;
    await sleep(2000);
  }
}

process.on("SIGINT", () => {
  log("收到退出信号，关闭隧道");
  stopTunnel();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopTunnel();
  process.exit(0);
});

healthLoop().catch((e) => {
  log(`守护异常: ${e.message}`);
  process.exit(1);
});
