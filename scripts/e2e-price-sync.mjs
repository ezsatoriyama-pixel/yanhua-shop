/**
 * 验证：后台改价 → 前台选中规格后价格同步
 *   node scripts/e2e-price-sync.mjs
 */
import http from "node:http";
import WebSocket from "ws";

const CDP_PORT = 9334;
const BASE = "http://localhost:3000";

const cdp = (method, path) =>
  new Promise((res, rej) => {
    const r = http.request({ host: "127.0.0.1", port: CDP_PORT, path, method }, (resp) => {
      let d = "";
      resp.on("data", (c) => (d += c));
      resp.on("end", () => { try { res(JSON.parse(d)); } catch { res(d); } });
    });
    r.on("error", rej); r.end();
  });

let pass = 0, fail = 0;
const ok = (l, c, e = "") => {
  c ? (pass++, console.log(`  ✓ ${l}${e ? " — " + e : ""}`)) : (fail++, console.log(`  ✗ ${l}${e ? " — " + e : ""}`));
  return c;
};

const ver = await cdp("GET", "/json/version");
const browserWs = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => browserWs.on("open", r));

let id = 0;
const pending = new Map();
browserWs.on("message", (m) => {
  const o = JSON.parse(m);
  if (o.id && pending.has(o.id)) { pending.get(o.id)(o); pending.delete(o.id); }
});
const send = (method, params, sid) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    browserWs.send(JSON.stringify({ id: i, method, params, ...(sid ? { sessionId: sid } : {}) }));
  });

async function openPage() {
  const ctx = (await send("Target.createBrowserContext", { disposeOnDetach: false })).result.browserContextId;
  const { result } = await send("Target.createTarget", { url: "about:blank", browserContextId: ctx });
  const { result: att } = await send("Target.attachToTarget", { targetId: result.targetId, flatten: true });
  const sid = att.sessionId;
  await send("Page.enable", {}, sid);
  await send("Runtime.enable", {}, sid);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sid);
  return {
    async goto(url, w = 5000) { await send("Page.navigate", { url }, sid); await new Promise((r) => setTimeout(r, w)); },
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sid);
      return r.result?.result?.value;
    },
    async clickText(t) {
      return this.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(t)}); if(!b) return 'notfound'; if(b.disabled) return 'disabled'; b.click(); return 'ok'; })()`);
    },
    async shot(name) {
      const s = await send("Page.captureScreenshot", { format: "png" }, sid);
      const fs = await import("node:fs");
      fs.mkdirSync(".shots", { recursive: true });
      fs.writeFileSync(`.shots/${name}.png`, Buffer.from(s.result.data, "base64"));
    },
    body() { return this.eval("document.body.innerText"); },
  };
}

console.log("=== 前台选中规格后应显示 77.00 ===");
const front = await openPage();
await front.goto(`${BASE}/product/sparkler-30cm`, 6000);
await front.clickText("30cm");
await new Promise((r) => setTimeout(r, 500));
await front.clickText("10支装");
await new Promise((r) => setTimeout(r, 1200));

const body = await front.body();
console.log("  页面文本片段:", body.replace(/\s+/g, " ").slice(0, 200));

ok("显示新价格 77.00", body.includes("77.00"));
ok("不显示旧价格 12.00", !body.includes("12.00"));
await front.shot("front-after-price-change");

browserWs.close();
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
