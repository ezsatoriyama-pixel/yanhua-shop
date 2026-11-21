import "server-only";

import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

/**
 * 购物车身份解析。
 *
 * 规则（PRD 第 8 节）：
 *  - 已登录 → userId
 *  - 未登录 → cookie 里的 sid
 *  - 首次访问且需要写购物车时，生成 sid 并通过 Set-Cookie 下发
 *
 * 为什么用 cookie 而不是 localStorage：
 *   必须服务端可读，否则下单时无法把游客购物车与订单关联。
 *
 * 注意：Next 16 里 cookies() 是异步的，且只能在 Server Component /
 * Server Action / Route Handler 中调用 —— 本文件通过 "server-only" 兜底，
 * 一旦被客户端组件误引用，构建期就会报错而不是运行期才炸。
 */

export const CART_COOKIE = "sid";

/** cookie 有效期 30 天 */
const MAX_AGE = 60 * 60 * 24 * 30;

export type Viewer = {
  /** 已登录用户 id；游客为 null */
  userId: string | null;
  /** 游客 sessionId；已登录时为 null */
  sessionId: string | null;
};

/**
 * 读取当前访问者身份（只读，不会下发 cookie）。
 * 适合 RSC 渲染场景：读购物车、读订单。
 */
export async function getViewer(): Promise<Viewer> {
  const cookieStore = await cookies();
  const sid = cookieStore.get(CART_COOKIE)?.value ?? null;

  // 注意：这里刻意不接 NextAuth 的 auth()，阶段三 P0 以游客身份为主路径。
  // 接入登录后改为：const session = await auth(); userId = session?.user?.id ?? null
  const userId: string | null = null;

  return {
    userId,
    sessionId: userId ? null : sid,
  };
}

/**
 * 获取或创建游客 sid（仅用于 Server Action 等可写 cookie 的上下文）。
 * 已登录用户返回 { sessionId: null }，不写 cookie。
 */
export async function getOrCreateViewer(): Promise<Viewer> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(CART_COOKIE)?.value;
  if (existing) return { userId: null, sessionId: existing };

  const sid = randomUUID();
  cookieStore.set(CART_COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });

  return { userId: null, sessionId: sid };
}

/**
 * 构造 Prisma 的购物车归属筛选条件。
 * 集中在一处，避免各 action 各写一遍导致条件不一致（越权常见成因）。
 */
export function cartOwnerWhere(viewer: Viewer) {
  if (viewer.userId) return { userId: viewer.userId };
  if (viewer.sessionId) return { sessionId: viewer.sessionId };
  // 两者都没有：返回一个永远匹配不到的条件，而不是 {}（{} 会匹配全表）
  return { id: "__no_viewer__" };
}
