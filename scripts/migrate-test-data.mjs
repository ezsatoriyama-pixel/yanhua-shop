/**
 * 一次性迁移：测试脚本里的旧品类引用 → 烟花数据
 *   node scripts/migrate-test-data.mjs
 *
 * 只改测试脚本（scripts/*.mjs），不动 verify-sku.ts
 * —— 后者是纯逻辑测试，用自造数据即可，与品类无关。
 */
import fs from "node:fs";

const FILES = ["scripts/e2e-order.mjs", "scripts/e2e-isolation.mjs", "scripts/e2e.mjs", "scripts/shoot-filled.mjs", "scripts/shoot.mjs"];

/** 顺序敏感：长串在前 */
const RULES = [
  // 商品 slug
  ["/product/milk-toast", "/product/sparkler-30cm"],
  // 规格选项：30cm + 10支装 = ¥12.00
  ["'500g'", "'30cm'"],
  ['"500g"', '"30cm"'],
  ["'已切片'", "'10支装'"],
  ['"已切片"', '"10支装"'],
  // 第二件用 30cm + 20支装 = ¥22.00
  ["'1000g'", "'20支装'"],
  ['"1000g"', '"20支装"'],
  ["'整条'", "'45cm'"],
  ['"整条"', '"45cm"'],
  // 商品名
  ["北海道牛奶吐司", "冷光仙女棒"],
  // 金额
  ["19.00", "12.00"],
  ["33.00", "22.00"],
  ["￥19.00", "￥12.00"],
  ["¥19", "¥12"],
  // 旧注释
  ["500g / 已切片（¥19）", "30cm / 10支装（¥12）"],
  ["1000g / 已切片（¥33）", "30cm / 20支装（¥22）"],
];

let total = 0;
for (const f of FILES) {
  if (!fs.existsSync(f)) continue;
  let src = fs.readFileSync(f, "utf8");
  const before = src;
  for (const [from, to] of RULES) {
    src = src.split(from).join(to);
  }
  if (src !== before) {
    fs.writeFileSync(f, src, "utf8");
    total++;
    console.log(`✓ ${f}`);
  }
}
console.log(`\n共更新 ${total} 个文件`);

// 残留检查
console.log("\n=== 残留检查 ===");
const LEFTOVER = ["milk-toast", "北海道", "500g", "已切片", "1000g", "整条", "19.00", "33.00", "巴斯克", "咖啡"];
let left = 0;
for (const f of FILES) {
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, "utf8");
  for (const w of LEFTOVER) {
    if (src.includes(w)) {
      left++;
      console.log(`  ⚠ ${f}: 仍含「${w}」`);
    }
  }
}
if (left === 0) console.log("  ✓ 无残留");
