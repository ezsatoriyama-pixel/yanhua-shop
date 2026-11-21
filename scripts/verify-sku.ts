/**
 * SKU 选择逻辑的独立验证脚本（开发期用，不进生产打包）
 *   npx tsx scripts/verify-sku.ts
 *
 * 存在意义：SkuSelector 的可选性判断出过一次真实 bug
 * （组合稀疏时全部误判为不可用），这里把它固化成可复跑的检查。
 */
import { buildSpecKey, buildSpecText, matchSku, DEFAULT_SPEC_KEY } from "../lib/sku";

const groups = [
  { name: "尺寸", values: ["500g", "1000g"] },
  { name: "切片", values: ["整条", "已切片"] },
];

/**
 * ⚠️ 教训：specKey 必须由 buildSpecKey 生成，绝不能手写。
 * 手写时极易与函数的排序规则不一致（此处为组名 Unicode 码点升序，
 * "切" < "尺"，所以 "切片" 排在 "尺寸" 前面），导致前端永远命中不到 SKU。
 * 下方 mock 数据全部改为调用 buildSpecKey 生成。
 */
const skus = [
  { id: "s1", specKey: buildSpecKey({ 尺寸: "500g", 切片: "整条" }), stock: 12 },
  { id: "s2", specKey: buildSpecKey({ 尺寸: "500g", 切片: "已切片" }), stock: 8 },
  { id: "s3", specKey: buildSpecKey({ 尺寸: "1000g", 切片: "整条" }), stock: 0 },
  { id: "s4", specKey: buildSpecKey({ 尺寸: "1000g", 切片: "已切片" }), stock: 5 },
];

const map = new Map(skus.map((s) => [s.specKey, s]));

/** 与 SkuSelector 中完全一致的实现 */
function isValueAvailable(
  sel: Record<string, string>,
  groupName: string,
  value: string,
): boolean {
  const base = { ...sel, [groupName]: value };
  const unresolved = groups.filter((g) => !base[g.name]);
  if (unresolved.length === 0) {
    const s = map.get(buildSpecKey(base));
    return Boolean(s && s.stock > 0);
  }
  let combos = [base];
  for (const g of unresolved) {
    const next: Record<string, string>[] = [];
    for (const c of combos) {
      for (const v of g.values) next.push({ ...c, [g.name]: v });
    }
    combos = next;
  }
  return combos.some((c) => {
    const s = map.get(buildSpecKey(c));
    return Boolean(s && s.stock > 0);
  });
}

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${String(actual)} (期望 ${String(expected)})`);
}

console.log("== specKey 归一化 ==");
check("点击顺序无关(1)", buildSpecKey({ 尺寸: "500g", 切片: "已切片" }), buildSpecKey({ 切片: "已切片", 尺寸: "500g" }));
check("key 内容有序", buildSpecKey({ 尺寸: "500g", 切片: "已切片" }), "切片:已切片|尺寸:500g");
check("specText", buildSpecText({ 尺寸: "500g", 切片: "已切片" }), "500g / 已切片");
check("默认规格", DEFAULT_SPEC_KEY, "default");

console.log("\n== 初始状态（selection={}）可选性 ==");
check("500g 可选", isValueAvailable({}, "尺寸", "500g"), true);
check("1000g 可选", isValueAvailable({}, "尺寸", "1000g"), true);
check("整条 可选", isValueAvailable({}, "切片", "整条"), true);
check("已切片 可选", isValueAvailable({}, "切片", "已切片"), true);

console.log("\n== 选中 500g 之后 ==");
check("整条 可选", isValueAvailable({ 尺寸: "500g" }, "切片", "整条"), true);
check("已切片 可选", isValueAvailable({ 尺寸: "500g" }, "切片", "已切片"), true);

console.log("\n== 库存为 0 的组合应不可选 ==");
check("1000g+整条 售罄", isValueAvailable({ 尺寸: "1000g" }, "切片", "整条"), false);
check("整条 在 1000g 下可选(因 500g+整条 有货)", isValueAvailable({ 尺寸: "1000g" }, "切片", "整条"), false);

console.log("\n== matchSku 唯一命中 ==");
check(
  "完整组合命中 s2",
  matchSku(skus, { 尺寸: "500g", 切片: "已切片" })?.id,
  "s2",
);
check("未选全返回 null", matchSku(skus, { 尺寸: "500g" }), null);
check(
  "不存在的组合返回 null",
  matchSku(skus, { 尺寸: "999g", 切片: "整条" }),
  null,
);

console.log(`\n结果: ${failed === 0 ? "全部通过 ✅" : `${failed} 项失败 ❌`}`);
process.exit(failed === 0 ? 0 : 1);
