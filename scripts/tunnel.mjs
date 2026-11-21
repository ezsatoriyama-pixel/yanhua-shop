/**
 * 启动 localtunnel 隧道，把本地 3000 端口暴露到公网。
 *   node scripts/tunnel.mjs
 *
 * 输出：公网 HTTPS 地址（https://xxx.loca.lt）
 * 会一直运行，Ctrl+C 停止。
 */
// Windows 下 ESM 动态导入绝对路径必须是 file:// URL，否则报
// ERR_UNSUPPORTED_ESM_URL_SCHEME（收到的是 c: 协议）
const ltPath =
  "file:///C:/Users/83668/AppData/Roaming/npm/node_modules/localtunnel/localtunnel.js";
const { default: localtunnel } = await import(ltPath);
import { writeFileSync } from "node:fs";

const PORT = 3000;

try {
  const tunnel = await localtunnel({
    port: PORT,
    // 固定子域名更容易记；被占用时会自动换一个
    subdomain: process.env.TUNNEL_SUBDOMAIN,
  });

  console.log(`\n✅ 公网地址: ${tunnel.url}\n`);
  writeFileSync(".tunnel-url.txt", tunnel.url, "utf8");

  tunnel.on("error", (err) => {
    console.error("隧道错误:", err.message);
  });
  tunnel.on("close", () => {
    console.log("隧道已关闭");
  });

  // localtunnel 需要访问密码（来访者 IP），下面打印出来
  const res = await fetch("https://loca.lt/mytunnelpassword");
  const pw = (await res.text()).trim();
  console.log(`⚠️  首次访问需要输入密码（来访者 IP）: ${pw}`);
  console.log("   或直接访问下面的提示页获取\n");

  // 保持进程存活
  process.stdin.resume();
} catch (err) {
  console.error("启动失败:", err.message);
  process.exit(1);
}
