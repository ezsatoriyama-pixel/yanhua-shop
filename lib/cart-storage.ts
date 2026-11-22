"use client";

/**
 * 静态版购物车（localStorage）
 *
 * 为什么用 localStorage：
 *   GitHub Pages 没有服务端，无法保存会话。
 *   localStorage 让"加购"在单个浏览器内有效，刷新不丢。
 *
 * 限制（必须让用户知道）：
 *   - 换设备/换浏览器购物车不同步
 *   - 清除浏览器数据会丢失
 *   - 无法真正下单（没有服务端）
 */

export type CartItem = {
  skuId: string;
  productSlug: string;
  /** 快照：加入时的价格与名称，后续改价不影响 */
  nameSnapshot: string;
  specTextSnapshot: string;
  imageSnapshot: string | null;
  priceSnapshotCents: number;
  quantity: number;
  /** 当前库存上限，用于夹紧数量 */
  maxStock: number;
};

const KEY = "yanhua-cart-v1";

export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is CartItem =>
        x && typeof x.skuId === "string" && typeof x.quantity === "number",
    );
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
    // 通知同页面的其他组件刷新（比如底栏角标）
    window.dispatchEvent(new CustomEvent("cart-updated"));
  } catch {
    /* 隐私模式可能禁用 localStorage，静默失败 */
  }
}

export function addToCart(item: Omit<CartItem, "quantity"> & { quantity: number }) {
  const cart = readCart();
  const idx = cart.findIndex((x) => x.skuId === item.skuId);
  if (idx >= 0) {
    const next = Math.min(cart[idx].quantity + item.quantity, item.maxStock);
    cart[idx] = { ...cart[idx], quantity: next };
  } else {
    cart.push({ ...item, quantity: Math.min(item.quantity, item.maxStock) });
  }
  writeCart(cart);
  return cart;
}

export function updateQuantity(skuId: string, quantity: number) {
  const cart = readCart();
  const next = cart
    .map((x) =>
      x.skuId === skuId
        ? { ...x, quantity: Math.max(0, Math.min(quantity, x.maxStock)) }
        : x,
    )
    .filter((x) => x.quantity > 0);
  writeCart(next);
  return next;
}

export function removeItem(skuId: string) {
  const next = readCart().filter((x) => x.skuId !== skuId);
  writeCart(next);
  return next;
}

export function clearCart() {
  writeCart([]);
}

export function cartTotal(items: CartItem[]) {
  return items.reduce((s, x) => s + x.priceSnapshotCents * x.quantity, 0);
}

export function cartCount(items: CartItem[]) {
  return items.reduce((s, x) => s + x.quantity, 0);
}
