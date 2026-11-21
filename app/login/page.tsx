import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { getAdminUser } from "@/lib/admin/guard";

export const metadata = { title: "登录" };

/**
 * 后台登录页。
 * 已是管理员的话直接进后台，不重复登录。
 */
export default function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  return (
    <div>
      <header className="px-5 pb-5 pt-10">
        <h1 className="tracking-display text-[28px] font-semibold text-ink">
          店主登录
        </h1>
        <p className="mt-1.5 text-[13px] tracking-tight text-ink-3">
          管理订单、商品与价格
        </p>
      </header>
      <Suspense fallback={<LoginSkeleton />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LoginContent({
  searchParams,
}: Pick<PageProps<"/login">, "searchParams">) {
  // 已登录的管理员直接跳后台
  const admin = await getAdminUser();
  if (admin) redirect("/admin");

  const { callbackUrl } = await searchParams;
  const target =
    typeof callbackUrl === "string" && callbackUrl.startsWith("/")
      ? callbackUrl
      : "/admin";

  return <LoginForm callbackUrl={target} />;
}

function LoginSkeleton() {
  return (
    <div className="space-y-4 px-5">
      <div className="h-12 animate-pulse rounded-xl bg-surface" />
      <div className="h-12 animate-pulse rounded-xl bg-surface" />
      <div className="h-12 animate-pulse rounded-pill bg-surface" />
    </div>
  );
}
