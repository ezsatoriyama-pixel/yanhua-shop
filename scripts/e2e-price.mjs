/**
 * 改价 / 改库存 的浏览器交互测试
 *   node scripts/e2e-price.mjs
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

const ctx = (await send("Target.createBrowserContext", { disposeOnDetach: false })).result.browserContextId;
const { result } = await send("Target.createTarget", { url: "about:blank", browserContextId: ctx });
const { result: att } = await send("Target.attachToTarget", { targetId: result.targetId, flatten: true });
const sid = att.sessionId;

await send("Page.enable", {}, sid);
await send("Runtime.enable", {}, sid);
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sid);

const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sid);
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.text));
  return r.result?.result?.value;
};
const go = async (p, w = 5000) => { await send("Page.navigate", { url: BASE + p }, sid); await new Promise((r) => setTimeout(r, w)); };

// 登录
await go("/login", 4000);
await ev(`(()=>{const el=document.querySelector('input[type="email"]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,'admin@example.com');el.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await new Promise((r) => setTimeout(r, 200));
await ev(`(()=>{const el=document.querySelector('input[type="password"]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,'admin123456');el.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await new Promise((r) => setTimeout(r, 200));
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='登录');if(b)b.click();return 1})()`);
await new Promise((r) => setTimeout(r, 6000));
console.log("登录后:", await ev("location.pathname"));

// 进商品页
await go("/admin/products", 5500);

console.log("\n=== 探查可点击的价格元素 ===");
const probe = await ev(`(() => {
  const out = [];
  document.querySelectorAll('button').forEach((b, i) => {
    const t = b.textContent.trim();
    if (/^\\d+(\\.\\d+)?\\s*元?$/.test(t)) {
      out.push({ i, text: t, title: b.title || '', cls: b.className.slice(0, 40) });
    }
  });
  return JSON.stringify(out.slice(0, 6), null, 1);
})()`);
console.log(probe);

console.log("\n=== 点第一个价格并改价 ===");
const clicked = await ev(`(() => {
  const b=[...document.querySelectorAll('button')].find(x=>/^\\d+(\\.\\d+)?\\s*元$/.test(x.textContent.trim()));
  if(!b) return 'notfound';
  const before=b.textContent.trim();
  b.click();
  return before;
})()`);
console.log("  点击前:", clicked);

await new Promise((r) => setTimeout(r, 700));
const hasInput = await ev(`Boolean(document.querySelector('input[type="number"]'))`);
console.log("  出现输入框:", hasInput);

if (hasInput) {
  await ev(`(() => {
    const inp=document.querySelector('input[type="number"]');
    const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    s.call(inp,'77');
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  await ev(`(() => { const inp=document.querySelector('input[type="number"]'); inp.dispatchEvent(new Event('blur',{bubbles:true})); inp.blur(); return 1 })()`);
  await new Promise((r) => setTimeout(r, 4500));

  const after = await ev(`(() => {
    const b=[...document.querySelectorAll('button')].find(x=>/^\\d+(\\.\\d+)?\\s*元$/.test(x.textContent.trim()));
    return b ? b.textContent.trim() : null;
  })()`);
  console.log("  改价后:", after);
  ok("价格已改为 77 元", after === "77 元", `${clicked} → ${after}`);

  // 前台验证
  await send("Target.createTarget", { url: "about:blank", browserContextId: ctx });
  const front = (await send("Target.createTarget", { url: BASE + "/product/sparkler-30cm", browserContextId: ctx })).result.targetId;
  const { result: fatt } = await send("Target.attachToTarget", { targetId: front, flatten: true });
  await send("Runtime.enable", {}, fatt.sessionId);
  await new Promise((r) => setTimeout(r, 6000));
  const fbody = (await send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true }, fatt.sessionId)).result?.result?.value ?? "";
  ok("前台已显示新价", fbody.includes("77.00") || fbody.includes("¥77"), "");
}

browserWs.close();
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
