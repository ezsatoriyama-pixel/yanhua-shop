/**
 * 公网隧道登录验证
 *   node scripts/e2e-public-login.mjs <公网URL>
 */
import http from "node:http";
import WebSocket from "ws";

const CDP_PORT = 9334;
const TARGET = process.argv[2] || "https://rush-essence-correction-trusts.trycloudflare.com";

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
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sid);
  return {
    async goto(url, w = 6000) { await send("Page.navigate", { url }, sid); await new Promise((r) => setTimeout(r, w)); },
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sid);
      return r.result?.result?.value;
    },
    async type(sel, val) {
      return this.eval(`(() => {
        const el=document.querySelector(${JSON.stringify(sel)});
        if(!el) return 'notfound';
        const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
        s.call(el, ${JSON.stringify(val)});
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
        return 'ok';
      })()`);
    },
    async clickText(t) {
      return this.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(t)}); if(!b) return 'notfound'; b.click(); return 'ok'; })()`);
    },
    url() { return this.eval("location.pathname"); },
    body() { return this.eval("document.body.innerText"); },
  };
}

console.log(`=== 目标: ${TARGET} ===`);

console.log("\n=== 1. 首页可访问 ===");
{
  const p = await openPage();
  await p.goto(TARGET, 8000);
  const b = await p.body();
  ok("首页正常渲染", b.includes("长夜烟花") || b.includes("挑一件"), b.replace(/\s+/g, " ").slice(0, 60));
}

console.log("\n=== 2. 公网登录 ===");
const admin = await openPage();
await admin.goto(`${TARGET}/login`, 7000);
ok("登录页可打开", (await admin.body()).includes("店主登录"), "");
await admin.type('input[type="text"]', "1232456");
await new Promise((r) => setTimeout(r, 300));
await admin.type('input[type="password"]', "123321");
await new Promise((r) => setTimeout(r, 300));
await admin.clickText("登录");
await new Promise((r) => setTimeout(r, 9000));

const after = await admin.url();
console.log("  登录后:", after);
ok("登录成功进入后台", after.startsWith("/admin"), after);
ok("后台数据可见", (await admin.body()).includes("今日营业额"), "");

console.log("\n=== 3. 登录后前台购物流程 ===");
const shop = await openPage();
await shop.goto(`${TARGET}/product/sparkler-30cm`, 8000);
await shop.clickText("30cm");
await new Promise((r) => setTimeout(r, 500));
await shop.clickText("10支装");
await new Promise((r) => setTimeout(r, 1200));
const shopBody = await shop.body();
ok("商品页显示价格", /\d+\.00/.test(shopBody), (shopBody.match(/¥[\d.]+/) || [])[0] || "");

browserWs.close();
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
