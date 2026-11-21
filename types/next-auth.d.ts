import type { DefaultSession } from "next-auth";

/**
 * NextAuth 类型扩展：给 session.user 加上 id 与 role。
 * 没有这个声明，TS 里 session.user.role 会报不存在。
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "CUSTOMER" | "ADMIN";
    } & DefaultSession["user"];
  }

  interface User {
    role?: "CUSTOMER" | "ADMIN";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "CUSTOMER" | "ADMIN";
    uid?: string;
  }
}
