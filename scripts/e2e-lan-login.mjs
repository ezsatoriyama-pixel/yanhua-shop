/**
 * 局域网 IP 登录验证
 *   node scripts/e2e-lan-login.mjs
 *
 * 模拟"别人从 192.168.x.x 访问"，验证：
 *  1. 登录页可打开
 *  2. 用新账号 1232456 / 123321 能登录成功
 *  3. 登录后能进后台
 *  4. 未登录访问后台仍被拦
 */
import http from "node:http";
import WebSocket from "ws";

const CDP_PORT = 9334;
const HOST = process.env.LAN_HOST || "192.168.3.251";
const BASE = `http://${HOST}:3000`;

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
    async goto(url, w = 5000) { await send("Page.navigate", { url }, sid); await new Promise((r) => setTimeout(r, w)); },
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

console.log(`=== 目标：${BASE} ===`);

console.log("\n=== 1. 未登录访问后台应被拦 ===");
{
  const p = await openPage();
  await p.goto(`${BASE}/admin`, 4000);
  const b = await p.body();
  ok("看不到后台内容", !b.includes("今日营业额"), b.replace(/\s+/g, " ").slice(0, 50));
}

console.log("\n=== 2. 用新账号登录 ===");
const admin = await openPage();
await admin.goto(`${BASE}/login`, 5000);
const loginBody = await admin.body();
ok("登录页可打开", loginBody.includes("店主登录"), "");

await admin.type('input[type="text"]', "1232456");
await new Promise((r) => setTimeout(r, 250));
await admin.type('input[type="password"]', "123321");
await new Promise((r) => setTimeout(r, 250));
await admin.clickText("登录");
await new Promise((r) => setTimeout(r, 7000));

const afterLogin = await admin.url();
console.log("  登录后地址:", afterLogin);
ok("登录成功进入后台", afterLogin.startsWith("/admin"), afterLogin);

const dash = await admin.body();
ok("后台概览可见", dash.includes("今日营业额"), "");

console.log("\n=== 3. 错误密码应被拒 ===");
{
  const p = await openPage();
  await p.goto(`${BASE}/login`, 4500);
  await p.type('input[type="text"]', "1232456");
  await new Promise((r) => setTimeout(r, 200));
  await p.type('input[type="password"]', "wrongpass");
  await new Promise((r) => setTimeout(r, 200));
  await p.clickText("登录");
  await new Promise((r) => setTimeout(r, 5000));
  const b = await p.body();
  ok("错误密码被拒绝", b.includes("邮箱或密码错误") || (await p.url()).includes("/login"), "");
}

browserWs.close();
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
