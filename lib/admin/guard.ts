import "server-only";

import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * 管理端鉴权守卫 —— 后台安全的唯一入口。
 *
 * 判断规则（满足其一即为管理员）：
 *  1. User.role === "ADMIN"
 *  2. 邮箱在 ADMIN_EMAILS 环境变量里
 *
 * ⚠️ 关键安全约束：**必须有登录 session**。
 * 曾经出现过"未登录也能进后台"的漏洞，根因是只查了库里的用户是否存在、
 * 没有先确认"当前请求有没有登录"。顺序必须是：
 *   auth() 取 session → 没有 session 直接拒绝 → 再查库判角色
 */

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
};

/**
 * 读取当前登录用户的身份。未登录返回 null。
 * 注意：这是"是谁"，不负责"能不能"。
 */
export async function getCurrentUser(): Promise<AdminUser | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) return null;

  return { id: user.id, email: user.email ?? email, name: user.name };
}

/**
 * 校验当前访问者是否为管理员。
 * 返回 null 表示不是（未登录 / 无权限都返回 null，不区分）。
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  // ── 第一道：必须有登录 session ──
  const session = await auth();
  const sessionEmail = session?.user?.email?.toLowerCase();
  if (!sessionEmail) return null;

  // ── 第二道：账号必须存在 ──
  const user = await prisma.user.findUnique({
    where: { email: sessionEmail },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) return null;

  // ── 第三道：角色或邮箱白名单 ──
  const isAdmin =
    user.role === "ADMIN" ||
    session?.user?.role === "ADMIN" ||
    adminEmails().includes(sessionEmail);

  if (!isAdmin) return null;

  return { id: user.id, email: user.email ?? sessionEmail, name: user.name };
}

/**
 * 页面级守卫：非管理员直接 404。
 *
 * 用 notFound() 而不是 redirect("/login")，原因：
 *  后台路径不该告诉陌生人"这里有个后台，请先登录"——
 *  那等于暴露攻击面。已验证的管理员会正常通过。
 */
export async function requireAdminPage(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) notFound();
  return admin;
}

/**
 * Server Action 级守卫：非管理员抛错。
 *
 * ⚠️ 页面级拦截**不是**安全边界：
 * Server Action 是一个公开 POST 端点，任何人都能直接调用，
 * 不经过页面渲染。所以每个 action 内部都必须再校验一次。
 */
export async function requireAdminAction(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) {
    throw new Error("FORBIDDEN");
  }
  return admin;
}
