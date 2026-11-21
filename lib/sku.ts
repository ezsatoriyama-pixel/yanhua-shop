/**
 * SKU 规格键工具 —— 单一真相来源
 *
 * 前端 SkuSelector 与服务端 addToCart / createOrder 都必须调用本文件，
 * 保证「点击组合」与「数据库存储」算出完全一致的 specKey。
 * 任何一处单独实现都会导致前端命中不到 SKU 的线上事故。
 */

/** 规格组合：{ 组名: 值 } */
export type SpecSelection = Record<string, string>;

/**
 * 生成归一化的 specKey。
 *
 * 规则（与 PRD 6.3 一致）：
 *  1. 去掉首尾空白，丢弃空值
 *  2. 按「组名」Unicode 码点升序排序 —— 与用户点击顺序无关
 *  3. 每组拼成 `组名:值`
 *  4. 用 "|" 连接
 *
 * 例：{ 长度: "30cm", 包装: "10支装" } => "包装:10支装|长度:30cm"
 */
export function buildSpecKey(selection: SpecSelection): string {
  return Object.entries(selection)
    .map(([group, value]) => [group.trim(), value.trim()] as const)
    .filter(([group, value]) => group.length > 0 && value.length > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([group, value]) => `${group}:${value}`)
    .join("|");
}

/** 无规格商品的默认键 */
export const DEFAULT_SPEC_KEY = "default";

/** 生成展示用规格文字：500g / 原味 */
export function buildSpecText(selection: SpecSelection): string {
  return Object.values(selection)
    .map((v) => v.trim())
    .filter(Boolean)
    .join(" / ");
}

/**
 * 从 SKU 列表中，按用户当前选择定位唯一 SKU。
 * 未选全或组合不存在都返回 null（前端据此置灰「加入购物车」）。
 */
export function matchSku<T extends { specKey: string }>(
  skus: readonly T[],
  selection: SpecSelection,
): T | null {
  if (Object.keys(selection).length === 0) return null;
  const key = buildSpecKey(selection);
  return skus.find((sku) => sku.specKey === key) ?? null;
}

/** 分 → 元（仅用于展示，禁止参与计算） */
export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** 分 → 带货币符号的字符串 */
export function formatPrice(cents: number): string {
  return `¥${formatCents(cents)}`;
}
