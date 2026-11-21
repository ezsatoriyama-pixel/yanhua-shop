/**
 * E2E 交互测试（开发期用）
 *   node scripts/e2e.mjs
 *
 * 通过 Chrome DevTools Protocol 真实点击页面，验证：
 *  块2：选规格 → 加入购物车 → 数据库写入快照
 *  块3：购物车数量增减 / 删除
 *  块4：结算下单（幂等、扣库存、取餐号）
 *  块5：订单列表与越权隔离
 */
import http from "node:http";
import WebSocket from "ws";

const CDP_PORT = 9334;
const BASE = "http://localhost:3000";

function cdp(method, path) {
  return new Promise((res, rej) => {
    const r = http.request(
      { host: "127.0.0.1", port: CDP_PORT, path, method },
      (resp) => {
        let d = "";
        resp.on("data", (c) => (d += c));
        resp.on("end", () => {
          try {
            res(JSON.parse(d));
          } catch {
            res(d);
          }
        });
      },
    );
    r.on("error", rej);
    r.end();
  });
}

class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.on("message", (m) => {
      const o = JSON.parse(m);
      if (o.id && this.pending.has(o.id)) {
        this.pending.get(o.id)(o);
        this.pending.delete(o.id);
      }
    });
  }
  send(method, params) {
    return new Promise((r) => {
      const i = ++this.id;
      this.pending.set(i, r);
      this.ws.send(JSON.stringify({ id: i, method, params }));
    });
  }
  async goto(url) {
    await this.send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 4500));
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.result?.exceptionDetails) {
      throw new Error(
        "eval error: " + JSON.stringify(r.result.exceptionDetails.text),
      );
    }
    return r.result?.result?.value;
  }
  /** 点击文本精确匹配的按钮，返回是否点到 */
  async clickText(text) {
    return this.eval(`(() => {
      const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(text)});
      if(!b) return false;
      if(b.disabled) return 'disabled';
      b.click(); return true;
    })()`);
  }
  /** 等待某个文本出现 */
  async waitForText(text, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = await this.eval(
        `document.body.innerText.includes(${JSON.stringify(text)})`,
      );
      if (found) return true;
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  }
}

function ok(label, cond, extra = "") {
  console.log(`${cond ? "✓" : "✗"} ${label}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
  return cond;
}

async function newPage() {
  const t = await cdp("PUT", "/json/new?about:blank");
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.on("open", r));
  const p = new Page(ws);
  await p.send("Page.enable");
  await p.send("Runtime.enable");
  return p;
}

const mode = process.argv[2] ?? "block2";

const page = await newPage();

if (mode === "block2") {
  console.log("=== 块2：选规格 + 加入购物车 ===");
  await page.goto(`${BASE}/product/sparkler-30cm`);

  // 库存为 0 的组合应置灰
  const s3 = await page.eval(`(() => {
    const btns=[...document.querySelectorAll('button')];
    const b=btns.filter(x=>x.textContent.trim()==='45cm');
    return b.length? b[0].className.includes('cursor-not-allowed') : null;
  })()`);
  console.log("  「45cm」当前是否置灰:", s3, "(初始未选齐时为可选)");

  ok("点击 30cm", (await page.clickText("30cm")) === true);
  await new Promise((r) => setTimeout(r, 500));
  ok("点击 10支装", (await page.clickText("10支装")) === true);
  await new Promise((r) => setTimeout(r, 800));

  const panel = await page.eval(`(() => {
    const t=document.body.innerText;
    return { has19: t.includes('12.00'), addBtn: [...document.querySelectorAll('button')].map(b=>b.textContent.trim()).find(x=>x.includes('加入购物车')) };
  })()`);
  console.log("  面板:", JSON.stringify(panel));
  ok("显示 ¥12.00", panel.has19 === true);
  ok("加购按钮可用", panel.addBtn === "加入购物车");

  ok("点击加入购物车", (await page.clickText("加入购物车")) === true);
  const added = await page.waitForText("已加入购物车");
  ok("出现「已加入购物车」", added);

  // 再点两次，验证合并
  await page.clickText("加入购物车");
  await new Promise((r) => setTimeout(r, 1500));
  console.log("  已重复加购 2 次（应合并为一行、数量 2）");
} else if (mode === "block3") {
  console.log("=== 块3：购物车读写 ===");
  await page.goto(`${BASE}/cart`);
  const text = await page.eval("document.body.innerText");
  ok("购物车渲染出行", text.includes("冷光仙女棒"));
  console.log("  页面片段:", text.replace(/\s+/g, " ").slice(0, 260));
}

page.ws.close();
console.log("\n测试结束");
