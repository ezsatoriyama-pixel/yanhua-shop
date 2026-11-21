import { NextResponse, type NextRequest } from "next/server";

/**
 * 全局请求网关 —— 后台的第一道、也是最可靠的一道防线。
 *
 * 为什么必须在这里拦：
 *   Next 16（Cache Components）下，page 与 layout 是**并行渲染**的。
 *   layout 里即使写了 `if (!admin) return <404/>`，同级的 children
 *   （也就是 /admin 页面本身）仍会在服务端执行并把数据写进 RSC payload。
 *   实测：未登录请求 /admin，HTML 里能直接搜到「今日营业额」等后台数据。
 *   只有在请求进入渲染管线**之前**拦掉，才能保证零泄露。
 *
 * 这里只做"成本很低"的判断：有没有 session cookie。
 * 真正的角色校验仍在 lib/admin/guard.ts（中间件跑在 edge/node 边界，
 * 不宜每次都查库；且伪造 cookie 后面还有服务端二次校验兜底）。
 */

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 只保护 /admin 及其子路径
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // NextAuth (JWT 策略) 的会话 cookie 名。
  // https 下是 __Secure-authjs.session-token，http 下是 authjs.session-token。
  // 局域网用 http 访问时必须同时兼容两者，否则登录后被判为未登录。
  const hasSession =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) {
    // 不重定向到 /login（那等于宣告"这里有个后台"），直接 404
    return NextResponse.rewrite(new URL("/not-found", request.url), {
      status: 404,
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
