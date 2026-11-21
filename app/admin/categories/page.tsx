import { Suspense } from "react";
import Link from "next/link";
import { getAdminCategories } from "@/lib/admin/queries";

export const metadata = { title: "分类" };

export default function AdminCategoriesPage() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="tracking-display text-[26px] font-semibold text-ink">
          分类
        </h1>
        <p className="mt-1 text-[12px] tracking-tight text-ink-3">
          分类在前台首页作为筛选标签展示
        </p>
      </div>
      <Suspense fallback={<CategoriesSkeleton />}>
        <CategoriesContent />
      </Suspense>
    </div>
  );
}

async function CategoriesContent() {
  const categories = await getAdminCategories();

  if (categories.length === 0) {
    return (
      <p className="rounded-2xl bg-surface px-4 py-12 text-center text-[13px] tracking-tight text-ink-3">
        还没有分类
      </p>
    );
  }

  return (
    <ul className="divide-y divide-hairline/50">
      {categories.map((c) => (
        <li key={c.id} className="flex items-center justify-between gap-3 py-3.5">
          <div className="min-w-0">
            <p className="text-[14px] font-medium tracking-tight text-ink">
              {c.name}
            </p>
            <p className="mt-0.5 text-[11px] tracking-tight text-ink-3">
              /{c.slug} · {c._count.products} 个商品
            </p>
          </div>
          <Link
            href={`/?category=${c.slug}`}
            className="press shrink-0 text-[12px] tracking-tight text-accent"
          >
            前台查看
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CategoriesSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-surface" />
      ))}
    </div>
  );
}
