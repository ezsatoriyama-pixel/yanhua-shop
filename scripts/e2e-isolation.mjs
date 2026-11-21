/**
 * 越权隔离专项测试（严格模式）
 *   node scripts/e2e-isolation.mjs
 *
 * 用 CDP 的 Target.createBrowserContext 创建**真正独立**的浏览器上下文
 * （独立 cookie jar），确保两次访问的 sessionId 不同。
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

class Page {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.on("message", (m) => {
      const o = JSON.parse(m);
      if (o.id && this.pending.has(o.id)) { this.pending.get(o.id)(o); this.pending.delete(o.id); }
    });
  }
  send(method, params, sessionId) {
    return new Promise((r) => {
      const i = ++this.id;
      this.pending.set(i, r);
      this.ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

let pass = 0, fail = 0;
const ok = (l, c, e = "") => { c ? (pass++, console.log(`  ✓ ${l}${e ? " — " + e : ""}`)) : (fail++, console.log(`  ✗ ${l}${e ? " — " + e : ""}`)); return c; };

async function main() {
  // 浏览器级别 websocket
  const ver = await cdp("GET", "/json/version");
  const browserWs = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => browserWs.on("open", r));

  const bp = new Page(browserWs);
  // 建两个完全独立的浏览器上下文
  const ctxA = (await bp.send("Target.createBrowserContext", { disposeOnDetach: false })).result.browserContextId;
  const ctxB = (await bp.send("Target.createBrowserContext", { disposeOnDetach: false })).result.browserContextId;
  console.log("contexts:", ctxA?.slice(0, 8), ctxB?.slice(0, 8));

  async function openIn(ctx) {
    const { result } = await bp.send("Target.createTarget", { url: "about:blank", browserContextId: ctx });
    const { result: att } = await bp.send("Target.attachToTarget", { targetId: result.targetId, flatten: true });
    const sid = att.sessionId;
    await bp.send("Page.enable", {}, sid);
    await bp.send("Runtime.enable", {}, sid);
    await bp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sid);
    return {
      navigate: async (u, wait = 4000) => { await bp.send("Page.navigate", { url: u }, sid); await new Promise((r) => setTimeout(r, wait)); },
      eval: async (expr) => {
        const r = await bp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sid);
        return r.result?.result?.value;
      },
      click: async (text) => {
        return (await bp.send("Runtime.evaluate", {
          expression: `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(text)}); if(!b) return 'notfound'; if(b.disabled) return 'disabled'; b.click(); return 'ok'; })()`,
          returnByValue: true,
        }, sid)).result?.result?.value;
      },
    };
  }

  const A = await openIn(ctxA);
  const B = await openIn(ctxB);

  console.log("\n=== 建立购物车并下单（上下文 A）===");
  await A.navigate(`${BASE}/product/sparkler-30cm`);
  await A.click("30cm"); await new Promise((r) => setTimeout(r, 400));
  await A.click("10支装"); await new Promise((r) => setTimeout(r, 700));
  await A.click("加入购物车");
  await new Promise((r) => setTimeout(r, 2000));

  const sidA = await A.eval("document.cookie");
  console.log("  A 的 cookie:", sidA);

  await A.navigate(`${BASE}/checkout`);
  await A.eval(`(() => { const el=document.querySelector('input[type="tel"]'); const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(el,'13800138000'); el.dispatchEvent(new Event('input',{bubbles:true})); return 'ok'; })()`);
  await new Promise((r) => setTimeout(r, 400));
  await A.eval(`(() => { const b=[...document.querySelectorAll('button')].filter(x=>/\\d{2}:\\d{2}-\\d{2}:\\d{2}/.test(x.textContent) && !x.disabled); if(b.length) b[0].click(); return b.length; })()`);
  await new Promise((r) => setTimeout(r, 400));
  await A.click("提交订单 · ￥12.00").catch(() => {});
  await A.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('提交订单')); if(b&&!b.disabled) b.click(); return 'ok'; })()`);
  await new Promise((r) => setTimeout(r, 6000));

  const orderUrl = await A.eval("location.pathname");
  console.log("  A 下单后地址:", orderUrl);
  const aText = await A.eval("document.body.innerText");
  ok("A 能看到自己的订单", /A\d{3}/.test(aText));

  console.log("\n=== 越权测试：上下文 B 访问 A 的订单 ===");
  await B.navigate(`${BASE}${orderUrl}`, 5000);
  const bText = await B.eval("document.body.innerText");
  const bSid = await B.eval("document.cookie");
  console.log("  B 的 cookie:", bSid || "(空)");
  console.log("  B 看到:", bText.replace(/\s+/g, " ").slice(0, 100));

  ok("B 无法看到 A 的取餐号", !/A\d{3}/.test(bText));
  ok("B 无法看到 A 的商品", !bText.includes("冷光仙女棒"));
  ok("B 看到 404 页面", bText.includes("不存在") || bText.includes("404"));

  console.log("\n=== B 的购物车应为空 ===");
  await B.navigate(`${BASE}/cart`, 3500);
  const bCart = await B.eval("document.body.innerText");
  ok("B 的购物车为空", bCart.includes("购物车是空的") || !bCart.includes("冷光仙女棒"));

  console.log("\n=== B 的订单列表应为空 ===");
  await B.navigate(`${BASE}/orders`, 3500);
  const bOrders = await B.eval("document.body.innerText");
  ok("B 的订单列表为空", !bOrders.includes("冷光仙女棒"));

  browserWs.close();
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("ERR", e); process.exit(1); });
