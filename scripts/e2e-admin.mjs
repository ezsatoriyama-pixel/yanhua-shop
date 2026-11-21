/**
 * 后台 E2E：登录 → 各页可访问 → 改价生效 → 权限隔离
 *   node scripts/e2e-admin.mjs
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sid);

  return {
    async goto(url, wait = 4000) {
      await send("Page.navigate", { url }, sid);
      await new Promise((r) => setTimeout(r, wait));
    },
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sid);
      if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.text));
      return r.result?.result?.value;
    },
    async type(sel, val) {
      return this.eval(`(() => {
        const el=document.querySelector(${JSON.stringify(sel)});
        if(!el) return 'notfound';
        const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
        setter.call(el, ${JSON.stringify(val)});
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
        return 'ok';
      })()`);
    },
    async clickText(text) {
      return this.eval(`(() => {
        const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim()===${JSON.stringify(text)});
        if(!b) return 'notfound'; b.click(); return 'ok';
      })()`);
    },
    async shot(name) {
      const s = await send("Page.captureScreenshot", { format: "png" }, sid);
      const fs = await import("node:fs");
      fs.mkdirSync(".shots", { recursive: true });
      fs.writeFileSync(`.shots/${name}.png`, Buffer.from(s.result.data, "base64"));
    },
    url() { return this.eval("location.pathname"); },
    body() { return this.eval("document.body.innerText"); },
  };
}

console.log("=== 1. 未登录访问后台应被拦 ===");
{
  const p = await openPage();
  await p.goto(`${BASE}/admin`);
  const body = await p.body();
  ok("未登录看不到后台内容", !body.includes("今日营业额") && !body.includes("概览"), body.replace(/\s+/g, " ").slice(0, 60));
}

console.log("\n=== 2. 登录 ===");
const admin = await openPage();
await admin.goto(`${BASE}/login`);
await admin.type('input[type="email"]', "admin@example.com");
await new Promise((r) => setTimeout(r, 200));
await admin.type('input[type="password"]', "admin123456");
await new Promise((r) => setTimeout(r, 200));
await admin.clickText("登录");
await new Promise((r) => setTimeout(r, 6000));
ok("登录后跳到后台", (await admin.url()).startsWith("/admin"), await admin.url());

const dash = await admin.body();
ok("概览显示营业额", dash.includes("今日营业额"), "");
ok("概览显示待处理订单", dash.includes("待处理订单"), "");

console.log("\n=== 3. 各页面可访问 ===");
// 注意：dev 模式下 Next 的调试浮层也会出现在 body.innerText 里，
// 用「页面标题是否存在」判断更可靠，而不是用「有没有 404 字样」。
for (const [path, marker] of [
  ["/admin/orders", "订单"],
  ["/admin/products", "商品"],
  ["/admin/categories", "分类"],
]) {
  await admin.goto(`${BASE}${path}`);
  const b = await admin.body();
  ok(`${path} 可访问`, b.includes(marker), `含「${marker}」`);
}

console.log("\n=== 4. 改价并验证前台生效 ===");
await admin.goto(`${BASE}/admin/products`, 5500);
await admin.shot("admin-products");

// 价格按钮带 title="点击修改"，用它精确定位（文本里含「元」字）
const priceSelector = `[...document.querySelectorAll('button')].filter(b => b.title === '点击修改' && /\\d/.test(b.textContent) && b.textContent.includes('元'))`;

const beforePrice = await admin.eval(`(() => {
  const btns = ${priceSelector};
  return btns.length ? btns[0].textContent.trim() : null;
})()`);
console.log("  改价前第一个 SKU 价格:", beforePrice);

if (beforePrice) {
  await admin.eval(`(() => { const btns = ${priceSelector}; if (btns[0]) btns[0].click(); return 1; })()`);
  await new Promise((r) => setTimeout(r, 700));

  await admin.eval(`(() => {
    const inp = document.querySelector('input[type="number"]');
    if (!inp) return 'noinput';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '88');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.blur();
    return 'ok';
  })()`);
  await new Promise((r) => setTimeout(r, 4500));

  const afterPrice = await admin.eval(`(() => {
    const btns = ${priceSelector};
    return btns.length ? btns[0].textContent.trim() : null;
  })()`);
  console.log("  改价后:", afterPrice);
  ok("改价成功", afterPrice === "88 元", `${beforePrice} → ${afterPrice}`);

  // 前台验证：必须选中规格后价格才显示
  const front = await openPage();
  await front.goto(`${BASE}/product/sparkler-30cm`, 6000);
  await front.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='30cm'); if(b) b.click(); return 1 })()`);
  await new Promise((r) => setTimeout(r, 400));
  await front.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='10支装'); if(b) b.click(); return 1 })()`);
  await new Promise((r) => setTimeout(r, 1000));
  const fb = await front.body();
  ok("前台选中规格后显示新价", fb.includes("88.00"), "");
}

console.log("\n=== 5. 后台截图 ===");
await admin.goto(`${BASE}/admin`, 5000);
await admin.shot("admin-dashboard");

browserWs.close();
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
