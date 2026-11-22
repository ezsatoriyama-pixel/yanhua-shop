/**
 * 静态站购物车测试
 *   node scripts/e2e-static-cart.mjs [baseUrl]
 */
import http from "node:http";
import WebSocket from "ws";
import fs from "node:fs";

const CDP_PORT = 9334;
const BASE = process.argv[2] || "http://localhost:8080";

const cdp = (method, path) =>
  new Promise((res, rej) => {
    const r = http.request({ host: "127.0.0.1", port: CDP_PORT, path, method }, (resp) => {
      let d = "";
      resp.on("data", (c) => (d += c));
      resp.on("end", () => {
        try {
          res(JSON.parse(d));
        } catch {
          res(d);
        }
      });
    });
    r.on("error", rej);
    r.end();
  });

let pass = 0,
  fail = 0;
const ok = (l, c, e = "") => {
  c ? (pass++, console.log(`  ✓ ${l}${e ? " — " + e : ""}`)) : (fail++, console.log(`  ✗ ${l}${e ? " — " + e : ""}`));
  return c;
};

const ver = await cdp("GET", "/json/version");
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => bws.on("open", r));

let id = 0;
const pend = new Map();
bws.on("message", (m) => {
  const o = JSON.parse(m);
  if (o.id && pend.has(o.id)) {
    pend.get(o.id)(o);
    pend.delete(o.id);
  }
});
const send = (method, params, sid) =>
  new Promise((r) => {
    const i = ++id;
    pend.set(i, r);
    bws.send(JSON.stringify({ id: i, method, params, ...(sid ? { sessionId: sid } : {}) }));
  });

const ctx = (await send("Target.createBrowserContext", { disposeOnDetach: false })).result.browserContextId;
const { result } = await send("Target.createTarget", { url: "about:blank", browserContextId: ctx });
const { result: att } = await send("Target.attachToTarget", { targetId: result.targetId, flatten: true });
const sid = att.sessionId;

await send("Page.enable", {}, sid);
await send("Runtime.enable", {}, sid);
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sid);

const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sid);
  return r.result?.result?.value;
};
const go = async (p, w = 4000) => {
  await send("Page.navigate", { url: BASE + p }, sid);
  await new Promise((r) => setTimeout(r, w));
};
const shot = async (n) => {
  const s = await send("Page.captureScreenshot", { format: "png" }, sid);
  fs.mkdirSync(".shots", { recursive: true });
  fs.writeFileSync(`.shots/${n}.png`, Buffer.from(s.result.data, "base64"));
};
const clickText = (t) =>
  ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(t)}); if(!b) return 'notfound'; if(b.disabled) return 'disabled'; b.click(); return 'ok'; })()`);

console.log(`=== 目标: ${BASE} ===`);

console.log("\n=== 1. 首页 ===");
await go("/");
const home = await ev("document.body.innerText");
ok("首页渲染", home.includes("挑一件"), "");
ok("显示商品", home.includes("冷光仙女棒"), "");
await shot("static-home");

console.log("\n=== 2. 商品详情 + 选规格 ===");
await go("/product/sparkler-30cm/");
const detail = await ev("document.body.innerText");
ok("详情页渲染", detail.includes("冷光仙女棒"), "");

ok("点击 30cm", (await clickText("30cm")) === "ok");
await new Promise((r) => setTimeout(r, 400));
ok("点击 10支装", (await clickText("10支装")) === "ok");
await new Promise((r) => setTimeout(r, 600));

const withPrice = await ev("document.body.innerText");
ok("显示价格 ¥12.00", withPrice.includes("12.00"), "");
await shot("static-detail");

console.log("\n=== 3. 加入购物车 ===");
const addResult = await clickText("加入购物车");
console.log("  点击结果:", addResult);
await new Promise((r) => setTimeout(r, 1200));

const afterAdd = await ev("document.body.innerText");
ok("出现加购成功提示", afterAdd.includes("已加入购物车"), "");

const ls = await ev(`localStorage.getItem('yanhua-cart-v1')`);
console.log("  localStorage:", (ls ?? "").slice(0, 160));
ok("localStorage 已写入", Boolean(ls && ls.includes("sparkler")), "");

console.log("\n=== 4. 购物车页面 ===");
await go("/cart/");
await new Promise((r) => setTimeout(r, 1200));
const cart = await ev("document.body.innerText");
ok("购物车显示商品", cart.includes("冷光仙女棒"), "");
ok("显示金额", cart.includes("12.00"), "");
ok("显示数量", cart.includes("1"), "");
await shot("static-cart");

console.log("\n=== 5. 数量增减 ===");
const plusClicked = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='增加数量'); if(!b) return 'notfound'; b.click(); return 'ok'; })()`);
ok("点击 +", plusClicked === "ok");
await new Promise((r) => setTimeout(r, 1000));
const cart2 = await ev("document.body.innerText");
ok("金额翻倍到 24.00", cart2.includes("24.00"), "");

console.log("\n=== 6. 刷新后购物车仍在 ===");
await go("/cart/", 2500);
const cart3 = await ev("document.body.innerText");
ok("刷新后仍有商品", cart3.includes("冷光仙女棒"), "");
ok("数量保持 2", cart3.includes("24.00"), "");

console.log("\n=== 7. 移除与清空 ===");
const removeClicked = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='移除'); if(!b) return 'notfound'; b.click(); return 'ok'; })()`);
ok("点击移除", removeClicked === "ok");
await new Promise((r) => setTimeout(r, 1000));
const cart4 = await ev("document.body.innerText");
ok("购物车已空", cart4.includes("购物车是空的"), "");

bws.close();
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
