/**
 * 截图脚本（开发期用）
 *   node scripts/shoot.mjs [页面key...]
 *
 * 通过 CDP 以 iPhone 尺寸截取页面，用于视觉走查。
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

const PAGES = {
  home: "/",
  product: "/product/sparkler-30cm",
  cart: "/cart",
  checkout: "/checkout",
  orders: "/orders",
  order: "/orders/o1",
  lookup: "/orders/lookup",
};

const targets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PAGES);

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
const send = (method, params, sessionId) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

for (const key of targets) {
  const path = PAGES[key];
  if (!path) { console.log("skip unknown:", key); continue; }

  const ctx = (await send("Target.createBrowserContext", { disposeOnDetach: false })).result.browserContextId;
  const { result } = await send("Target.createTarget", { url: "about:blank", browserContextId: ctx });
  const { result: att } = await send("Target.attachToTarget", { targetId: result.targetId, flatten: true });
  const sid = att.sessionId;

  await send("Page.enable", {}, sid);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  }, sid);
  await send("Page.navigate", { url: BASE + path }, sid);
  await new Promise((r) => setTimeout(r, 5500));

  const shot = await send("Page.captureScreenshot", { format: "png" }, sid);
  fs.writeFileSync(`${OUT}/${key}.png`, Buffer.from(shot.result.data, "base64"));
  console.log(`✓ ${key} (${path})`);

  await send("Target.closeTarget", { targetId: result.targetId });
}

ws.close();
console.log("done");
