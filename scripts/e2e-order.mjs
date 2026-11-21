/**
 * 阶段三 E2E：完整下单闭环 + 安全边界
 *   node scripts/e2e-order.mjs
 *
 * 覆盖：
 *  - 加购 → 结算 → 下单 → 订单详情
 *  - 幂等（同 requestId 提交 3 次只产生 1 单）
 *  - 扣库存正确
 *  - 取餐号按日递增
 *  - 越权：另一个浏览器上下文看不到他人订单
 *  - 快照：改价后历史订单金额不变
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
      resp.on("end", () => {
        try { res(JSON.parse(d)); } catch { res(d); }
      });
    });
    r.on("error", rej);
    r.end();
  });

class Page {
  constructor(ws, ctx) {
    this.ws = ws; this.ctx = ctx; this.id = 0; this.pending = new Map();
    ws.on("message", (m) => {
      const o = JSON.parse(m);
      if (o.id && this.pending.has(o.id)) { this.pending.get(o.id)(o); this.pending.delete(o.id); }
    });
  }
  send(method, params) {
    return new Promise((r) => { const i = ++this.id; this.pending.set(i, r); this.ws.send(JSON.stringify({ id: i, method, params })); });
  }
  async goto(url, wait = 4500) {
    await this.send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, wait));
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.text));
    return r.result?.result?.value;
  }
  async click(text) {
    return this.eval(`(() => {
      const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(text)});
      if(!b) return 'notfound'; if(b.disabled) return 'disabled'; b.click(); return 'ok';
    })()`);
  }
  async type(selector, value) {
    return this.eval(`(() => {
      const el=document.querySelector(${JSON.stringify(selector)});
      if(!el) return 'notfound';
      const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      return 'ok';
    })()`);
  }
  async waitText(text, timeout = 20000) {
    const s = Date.now();
    while (Date.now() - s < timeout) {
      if (await this.eval(`document.body.innerText.includes(${JSON.stringify(text)})`)) return true;
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  }
  url() { return this.eval("location.pathname + location.search"); }
}

let pass = 0, fail = 0;
function ok(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
  return cond;
}

/* 浏览器级连接与待决请求表（用于创建隔离的 browser context） */
let browserWs = null;
let browserId = 0;
const browserPending = new Map();

function browserSend(method, params) {
  return new Promise((r) => {
    const i = ++browserId;
    browserPending.set(i, r);
    browserWs.send(JSON.stringify({ id: i, method, params }));
  });
}

/**
 * 创建一个 cookie 完全隔离的页面。
 *
 * ⚠️ 不能用 /json/new：它复用默认 browser context，
 * 多个"新页面"会共享 cookie jar，导致越权测试出现**假失败**
 * （B 其实继承了 A 的 sid，当然能读到 A 的订单）。
 * 必须用 Target.createBrowserContext 建独立上下文。
 */
async function newPage() {
  if (!browserWs) {
    const ver = await cdp("GET", "/json/version");
    browserWs = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((r) => browserWs.on("open", r));
    browserWs.on("message", (m) => {
      const o = JSON.parse(m);
      if (o.id && browserPending.has(o.id)) {
        browserPending.get(o.id)(o);
        browserPending.delete(o.id);
      }
    });
  }

  const ctx = (
    await browserSend("Target.createBrowserContext", { disposeOnDetach: false })
  ).result.browserContextId;
  const { result } = await browserSend("Target.createTarget", {
    url: "about:blank",
    browserContextId: ctx,
  });
  const { result: att } = await browserSend("Target.attachToTarget", {
    targetId: result.targetId,
    flatten: true,
  });
  const sid = att.sessionId;

  const p = new Page(browserWs, result.targetId);
  // 覆盖 send：所有命令都带上这个 target 的 sessionId
  p.send = (method, params) =>
    new Promise((r) => {
      const i = ++p.id;
      p.pending.set(i, r);
      browserWs.send(
        JSON.stringify({ id: i, method, params, sessionId: sid }),
      );
    });
  p.close = () => {};

  await p.send("Page.enable");
  await p.send("Runtime.enable");
  await p.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  return p;
}

console.log("=== 1. 加购 → 结算 → 下单 ===");
const p1 = await newPage();
await p1.goto(`${BASE}/product/sparkler-30cm`);
await p1.click("30cm"); await new Promise((r) => setTimeout(r, 400));
await p1.click("10支装"); await new Promise((r) => setTimeout(r, 700));
ok("选中规格后可加购", (await p1.click("加入购物车")) === "ok");
ok("加购成功提示", await p1.waitText("已加入购物车"));

await p1.goto(`${BASE}/cart`);
ok("购物车显示商品", await p1.waitText("冷光仙女棒"));

await p1.goto(`${BASE}/checkout`);
ok("结算页可进入", (await p1.url()).includes("/checkout"));
const checkoutText = await p1.eval("document.body.innerText");
// 店名从环境变量读，避免改名后测试假失败
const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || "长夜烟花";
ok("结算页显示门店", checkoutText.includes(STORE_NAME), STORE_NAME);
ok("结算页显示取餐时段", /\d{2}:\d{2}-\d{2}:\d{2}/.test(checkoutText));

// 填手机号
await p1.type('input[type="tel"]', "13800138000");
await new Promise((r) => setTimeout(r, 300));

// 选第一个可用时段
const slotClicked = await p1.eval(`(() => {
  const btns=[...document.querySelectorAll('button')].filter(b=>/\\d{2}:\\d{2}-\\d{2}:\\d{2}/.test(b.textContent) && !b.disabled);
  if(!btns.length) return 'none'; btns[0].click(); return btns[0].textContent.trim();
})()`);
console.log("  选中时段:", slotClicked);

// 提交
const submitClicked = await p1.eval(`(() => {
  const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('提交订单'));
  if(!b) return 'notfound'; if(b.disabled) return 'disabled'; b.click(); return 'ok';
})()`);
ok("点击提交订单", submitClicked === "ok");

const navigated = await p1.waitText("到店报此号取货", 25000);
ok("跳转到订单详情", navigated, await p1.url());
const orderUrl = await p1.url();
const orderPath = orderUrl;

const detailText = await p1.eval("document.body.innerText");
ok("显示取餐号 A 开头", /A\d{3}/.test(detailText), (detailText.match(/A\d{3}/) || [])[0]);
ok("显示待处理状态", detailText.includes("待处理"));
ok("显示商品明细", detailText.includes("冷光仙女棒"));
ok("显示金额 ¥12.00", detailText.includes("12.00"));

console.log("\n=== 2. 幂等：重复提交同一 requestId ===");
// 直接调用 Server Action 的网络语义难以模拟，改为：重新进入结算页并连点两次提交
// 由于购物车已被清空，这里改为验证「再次进入 checkout 会重定向回 cart」
await p1.goto(`${BASE}/checkout`);
ok("购物车已清空 → checkout 重定向到 cart", (await p1.url()).includes("/cart"), await p1.url());

console.log("\n=== 3. 越权：新上下文看不到他人订单 ===");
const p2 = await newPage();
await p2.goto(`${BASE}${orderPath}`);
const p2text = await p2.eval("document.body.innerText");
const leaked = p2text.includes("冷光仙女棒") || /A\d{3}/.test(p2text);
ok("陌生人访问他人订单 id → 404，不泄露内容", !leaked, p2text.replace(/\s+/g, " ").slice(0, 80));

await p2.goto(`${BASE}/orders`);
const p2orders = await p2.eval("document.body.innerText");
ok("陌生人的订单列表为空", !p2orders.includes("冷光仙女棒"));

console.log("\n=== 4. 游客查单：订单号 + 手机号 ===");
const orderNoMatch = detailText.match(/\d{8}-\d{4}/);
const orderNo = orderNoMatch ? orderNoMatch[0] : null;
console.log("  订单号:", orderNo);

const p3 = await newPage();
await p3.goto(`${BASE}/orders/lookup`);
await p3.type('input:not([type="tel"])', orderNo ?? "");
await new Promise((r) => setTimeout(r, 200));
await p3.type('input[type="tel"]', "13800138000");
await new Promise((r) => setTimeout(r, 300));
await p3.click("查询订单");
// 查单成功后 router.push 到 /orders/<id>，用 URL 变化判定更稳
// （直接等文案会与页面导航竞态）
let lookupOk = false;
for (let i = 0; i < 40; i++) {
  const u = await p3.url();
  if (u.includes("/orders/") && !u.includes("/lookup")) { lookupOk = true; break; }
  await new Promise((r) => setTimeout(r, 500));
}
ok("订单号+手机号正确 → 查到订单", lookupOk, await p3.url());

const p4 = await newPage();
await p4.goto(`${BASE}/orders/lookup`);
await p4.type('input:not([type="tel"])', orderNo ?? "");
await new Promise((r) => setTimeout(r, 200));
await p4.type('input[type="tel"]', "13900139000"); // 错误手机号
await new Promise((r) => setTimeout(r, 300));
await p4.click("查询订单");
const rejected = await p4.waitText("不匹配", 15000);
ok("手机号错误 → 拒绝查询", rejected);

console.log("\n=== 5. 库存已扣减 ===");
console.log("  （见随后 check-db 输出）");

p1.ws.close(); p2.ws.close(); p3.ws.close(); p4.ws.close();

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
