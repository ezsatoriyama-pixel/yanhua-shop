/**
 * 带数据的页面截图（先加购再截 cart / checkout）
 *   node scripts/shoot-filled.mjs
 */
import http from "node:http";
import fs from "node:fs";
import WebSocket from "ws";

const CDP_PORT = 9334;
const BASE = "http://localhost:3000";
const OUT = ".shots";

const cdp = (method, path) =>
  new Promise((res, rej) => {
    const r = http.request({ host: "127.0.0.1", port: CDP_PORT, path, method }, (resp) => {
      let d = "";
      resp.on("data", (c) => (d += c));
      resp.on("end", () => { try { res(JSON.parse(d)); } catch { res(d); } });
    });
    r.on("error", rej); r.end();
  });

fs.mkdirSync(OUT, { recursive: true });

const ver = await cdp("GET", "/json/version");
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => ws.on("open", r));

let id = 0;
const pending = new Map();
ws.on("message", (m) => {
  const o = JSON.parse(m);
  if (o.id && pending.has(o.id)) { pending.get(o.id)(o); pending.delete(o.id); }
});
const send = (method, params, sid) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params, ...(sid ? { sessionId: sid } : {}) }));
  });

const ctx = (await send("Target.createBrowserContext", { disposeOnDetach: false })).result.browserContextId;
const { result } = await send("Target.createTarget", { url: "about:blank", browserContextId: ctx });
const { result: att } = await send("Target.attachToTarget", { targetId: result.targetId, flatten: true });
const sid = att.sessionId;

await send("Page.enable", {}, sid);
await send("Runtime.enable", {}, sid);
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sid);

const ev = async (expr) =>
  (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sid))
    .result?.result?.value;

const shot = async (name) => {
  const s = await send("Page.captureScreenshot", { format: "png" }, sid);
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.result.data, "base64"));
  console.log("✓", name);
};

const go = async (p, wait = 4500) => {
  await send("Page.navigate", { url: BASE + p }, sid);
  await new Promise((r) => setTimeout(r, wait));
};

// 加购第一件：30cm / 10支装（¥12）
await go("/product/sparkler-30cm");
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='30cm');b&&b.click();return 1})()`);
await new Promise((r) => setTimeout(r, 400));
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='10支装');b&&b.click();return 1})()`);
await new Promise((r) => setTimeout(r, 700));
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('加入购物车'));b&&b.click();return 1})()`);
await new Promise((r) => setTimeout(r, 2200));

// 加购第二件：30cm / 20支装（¥22）
await go("/product/sparkler-30cm", 2500);
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='20支装');b&&b.click();return 1})()`);
await new Promise((r) => setTimeout(r, 400));
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='10支装');b&&b.click();return 1})()`);
await new Promise((r) => setTimeout(r, 700));
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('加入购物车'));b&&b.click();return 1})()`);
await new Promise((r) => setTimeout(r, 2200));

await go("/cart", 3500);
await shot("cart-filled");

await go("/checkout", 4000);
await shot("checkout-filled");

// 截一张选了规格的商品页（展示选中态 + 价格 + 按钮）
await go("/product/sparkler-30cm", 2500);
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='30cm');b&&b.click();return 1})()`);
await new Promise((r) => setTimeout(r, 400));
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='10支装');b&&b.click();return 1})()`);
await new Promise((r) => setTimeout(r, 900));
await shot("product-selected");

ws.close();
console.log("done");
