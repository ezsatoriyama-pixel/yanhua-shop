import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { getAdminUser } from "@/lib/admin/guard";

export const metadata: Metadata = {
  title: { default: "管理后台", template: "%s · 后台" },
  // 后台不该被搜索引擎收录
  robots: { index: false, follow: false },
};

/**
 * /admin 布局 —— 服务端鉴权的唯一强制点。
 *
 * ⚠️ 这里**不使用 notFound()**，而是条件渲染。
 *
 * 为什么：Next 16 的 Cache Components 下，layout 被包在 Suspense 里时，
 * 子组件抛出的 notFound() 只会让「该子组件的 fallback 显示 404 UI」，
 * 但**兄弟节点仍会继续渲染** —— 实测未登录时 /admin 的正文内容照样出现在
 * HTML 里，等于后台数据全部泄露。这是踩过的真实漏洞。
 *
 * 正确做法：鉴权结果决定"渲染后台还是只渲染 404 页"，
 * 且把返回的元素完全替换掉 —— 未通过时根本不渲染 children。
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <Suspense fallback={<AdminShellSkeleton />}>
        <AdminShell>{children}</AdminShell>
      </Suspense>
    </div>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();

  // 未通过鉴权：**不渲染任何后台内容**，只给一个 404 外观
  if (!admin) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="text-[13px] uppercase tracking-[0.1em] text-ink-3">404</p>
        <p className="tracking-display mt-3 text-[26px] font-semibold text-ink">
          此页面不存在
        </p>
        <p className="mt-2.5 max-w-[17rem] text-[13px] leading-relaxed tracking-tight text-ink-2">
          链接可能有误。
        </p>
      </div>
    );
  }

  return (
    <>
      <AdminNav email={admin.email} />
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4">
        {children}
      </main>
    </>
  );
}

function AdminShellSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="h-8 w-40 animate-pulse rounded bg-surface" />
    </div>
  );
}
