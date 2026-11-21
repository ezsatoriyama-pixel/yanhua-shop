/**
 * 一次性文案迁移：餐饮 → 烟花零售
 *   node scripts/rename-wording.mjs [--dry]
 *
 * 只做「取餐/点单/现烤」这类措辞替换，不改任何逻辑。
 * 每次替换都打印前后对照，便于人工核对。
 */
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry");

const ROOTS = ["app", "components", "lib", "prisma"];
const EXT = new Set([".ts", ".tsx"]);

/** 顺序敏感：长词在前，避免「取餐号」被「取餐」先切断 */
const REPLACEMENTS = [
  ["取餐号", "取货号"],
  ["取餐时间", "取货时间"],
  ["取餐时段", "取货时段"],
  ["取餐门店", "取货门店"],
  ["取餐请提前", "取货请提前"],
  ["到店报此号取餐", "到店报此号取货"],
  ["到店报号取餐", "到店报号取货"],
  ["到店取餐", "到店取货"],
  ["报此号取餐", "报此号取货"],
  ["凭此号取餐", "凭此号取货"],
  ["取餐", "取货"],
  ["点单", "选购"],
  ["继续点单", "继续选购"],
  ["返回点单", "返回选购"],
  ["去点单", "去选购"],
  ["现烤", "现货"],
  ["小满手作", "长夜烟花"],
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", ".pgdata"].includes(entry.name)) continue;
      walk(full, out);
    } else if (EXT.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

let totalFiles = 0;
let totalEdits = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    let src = fs.readFileSync(file, "utf8");
    const original = src;
    const hits = [];

    for (const [from, to] of REPLACEMENTS) {
      if (!src.includes(from)) continue;
      const count = src.split(from).length - 1;
      hits.push(`${from} → ${to} ×${count}`);
      src = src.split(from).join(to);
    }

    if (src !== original) {
      totalFiles++;
      totalEdits += hits.length;
      console.log(`\n${file}`);
      for (const h of hits) console.log(`  ${h}`);
      if (!DRY) fs.writeFileSync(file, src, "utf8");
    }
  }
}

console.log(
  `\n${DRY ? "[dry-run] " : ""}共 ${totalFiles} 个文件，${totalEdits} 类替换`,
);

/** 迁移后残留自查：这些词不应再出现 */
const LEFTOVER = ["取餐", "点单", "现烤", "小满手作", "面包", "蛋糕", "咖啡", "吐司"];
console.log("\n=== 残留检查 ===");
let left = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = fs.readFileSync(file, "utf8");
    for (const w of LEFTOVER) {
      if (src.includes(w)) {
        left++;
        console.log(`  ⚠ ${file}: 仍含「${w}」`);
      }
    }
  }
}
if (left === 0) console.log("  ✓ 无残留");
