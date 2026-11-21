import { handlers } from "@/auth";

/**
 * NextAuth 路由处理器。
 * Next 16 中 route handler 的 params/session 都是异步的，
 * Auth.js v5 的 handlers 已适配，直接透出即可。
 */
export const { GET, POST } = handlers;
