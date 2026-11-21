/**
 * 后台：添加商品 + 图片上传
 *   node scripts/e2e-add-product.mjs
 */
import http from "node:http";
import fs from "node:fs";
import WebSocket from "ws";

const CDP_PORT = 9334;
const BASE = "http://localhost:3000";
const TEST_TITLE = "测试商品-自动化";
const TEST_SLUG = "auto-test-product";

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
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }, sid);

const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sid);
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.text));
  return r.result?.result?.value;
};
const go = async (p, w = 5000) => { await send("Page.navigate", { url: BASE + p }, sid); await new Promise((r) => setTimeout(r, w)); };
const shot = async (n) => {
  const s = await send("Page.captureScreenshot", { format: "png" }, sid);
  fs.mkdirSync(".shots", { recursive: true });
  fs.writeFileSync(`.shots/${n}.png`, Buffer.from(s.result.data, "base64"));
};

// 登录
await go("/login", 4000);
await ev(`(()=>{const el=document.querySelector('input[type="email"]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,'admin@example.com');el.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await new Promise((r) => setTimeout(r, 200));
await ev(`(()=>{const el=document.querySelector('input[type="password"]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,'admin123456');el.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await new Promise((r) => setTimeout(r, 200));
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='登录');if(b)b.click();return 1})()`);
await new Promise((r) => setTimeout(r, 6000));
console.log("登录后:", await ev("location.pathname"));

console.log("\n=== 1. 打开添加商品页 ===");
await go("/admin/products/new", 6000);
const pageText = await ev("document.body.innerText");
ok("页面可访问", pageText.includes("添加商品"), "");
ok("有规格输入", pageText.includes("规格"), "");
await shot("admin-new-product");

console.log("\n=== 2. 上传图片（通过 CDP 设置文件）===");
// 造一张小 PNG
const pngPath = ".shots/test-upload.png";
fs.mkdirSync(".shots", { recursive: true });
const testPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAWklEQVR42u3OMQEAAAgDoJnc6BpjDyQgdWXm5wEECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBDwewFivwFh6u9nSQAAAABJRU5ErkJggg==",
  "base64",
);
fs.writeFileSync(pngPath, testPng);

const { result: doc } = await send("DOM.getDocument", {}, sid);
const { result: node } = await send(
  "DOM.querySelector",
  { nodeId: doc.root.nodeId, selector: 'input[type="file"]' },
  sid,
);
console.log("  file input nodeId:", node.nodeId);

if (node.nodeId) {
  await send(
    "DOM.setFileInputFiles",
    { nodeId: node.nodeId, files: [process.cwd() + "\\" + pngPath.replace(/\//g, "\\")] },
    sid,
  );
  await new Promise((r) => setTimeout(r, 3500));
  const afterUpload = await ev("document.body.innerText");
  ok("图片已上传", afterUpload.includes("图片已上传") || afterUpload.includes("更换图片"), "");
  await shot("admin-after-upload");
}

console.log("\n=== 3. 填写商品信息 ===");
await ev(`(() => {
  const set = (el, v) => {
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    if (el.tagName === 'TEXTAREA') {
      const ts = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
      ts.call(el, v);
    } else { s.call(el, v); }
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const inputs=[...document.querySelectorAll('input[type="text"], input:not([type]), textarea')];
  if(inputs[0]) set(inputs[0], ${JSON.stringify(TEST_TITLE)});
  if(inputs[1]) set(inputs[1], ${JSON.stringify(TEST_SLUG)});
  if(inputs[2]) set(inputs[2], '自动化测试用');
  return inputs.length;
})()`);
await new Promise((r) => setTimeout(r, 600));

// 填规格组：第一个组名 + 取值
const groupFilled = await ev(`(() => {
  const inputs=[...document.querySelectorAll('input')];
  const nameInput=inputs.find(i=>i.placeholder && i.placeholder.includes('组名'));
  const valInput=inputs.find(i=>i.placeholder && i.placeholder.includes('取值'));
  const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
  if(nameInput) set(nameInput,'规格');
  if(valInput) set(valInput,'A款, B款');
  return { name: Boolean(nameInput), val: Boolean(valInput) };
})()`);
console.log("  规格输入:", JSON.stringify(groupFilled));
await new Promise((r) => setTimeout(r, 1200));

// 填写价格
const priceFilled = await ev(`(() => {
  const nums=[...document.querySelectorAll('input[type="number"]')];
  const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
  let n=0;
  nums.forEach((el,i)=>{ if (i%2===0) { set(el, String(50+i)); n++; } else { set(el, '10'); } });
  return { total: nums.length, pricesSet: n };
})()`);
console.log("  价格输入:", JSON.stringify(priceFilled));
await new Promise((r) => setTimeout(r, 800));
await shot("admin-product-filled");

console.log("\n=== 4. 提交 ===");
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('保存商品')); if(b) b.click(); return 1 })()`);
await new Promise((r) => setTimeout(r, 7000));

const nowUrl = await ev("location.pathname");
console.log("  提交后地址:", nowUrl);
ok("提交后回到商品列表", nowUrl === "/admin/products", nowUrl);

const listText = await ev("document.body.innerText");
ok("列表中出现新商品", listText.includes(TEST_TITLE), "");

browserWs.close();
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
