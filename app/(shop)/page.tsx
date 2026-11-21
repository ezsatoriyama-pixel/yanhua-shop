import { Suspense } from "react";
import Link from "next/link";
import { ProductCard } from "@/components/product/ProductCard";
import { EmptyState } from "@/components/common/EmptyState";
import { getCategories, getProductCards, getStore } from "@/lib/queries/products";

/**
 * 首页 —— Apple 官网的语言：
 *  1. 一句大标题 + 一句说明（居中、紧字距、大量留白）
 *  2. 极简分段控制（全部 / 分类），不用胶囊填充块
 *  3. 商品卡片纵向铺开，卡片之间用留白分隔，不用分割线
 */
export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div>
      <Suspense fallback={<NoticeBarSkeleton />}>
        <Hero />
      </Suspense>

      <div className="sticky top-11 z-30 bg-canvas/85 backdrop-blur-xl">
        <Suspense fallback={<CategoryNavSkeleton />}>
          <CategoryNav searchParams={searchParams} />
        </Suspense>
      </div>

      <Suspense fallback={<ProductListSkeleton />}>
        <ProductList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** 大标题区：Apple 首屏的典型结构 */
async function Hero() {
  const store = await getStore();

  return (
    <section className="px-5 pb-8 pt-10 text-center rise">
      <h1 className="tracking-display text-[34px] font-semibold text-ink">
        挑一件
      </h1>
      <p className="mx-auto mt-2.5 max-w-[19rem] text-[14px] leading-relaxed tracking-tight text-ink-2">
        {store?.notice ?? "选好规格即可预约取货。"}
      </p>
      {store && (
        <p className="mt-3 text-[12px] tracking-tight text-ink-3">
          {store.name} · {store.address}
        </p>
      )}
    </section>
  );
}

/** 分类：Apple 的分段文本导航，选中态用颜色 + 短下划线 */
async function CategoryNav({
  searchParams,
}: Pick<PageProps<"/">, "searchParams">) {
  const [{ category }, categories] = await Promise.all([
    searchParams,
    getCategories(),
  ]);
  const activeSlug = typeof category === "string" ? category : undefined;

  const items = [
    { slug: undefined as string | undefined, name: "全部" },
    ...categories.map((c) => ({ slug: c.slug as string | undefined, name: c.name })),
  ];

  return (
    <nav className="border-b border-hairline/50">
      <ul className="no-scrollbar flex gap-6 overflow-x-auto px-5">
        {items.map((item) => {
          const active = activeSlug === item.slug;
          return (
            <li key={item.slug ?? "all"} className="shrink-0">
              <Link
                href={item.slug ? `/?category=${item.slug}` : "/"}
                scroll={false}
                className={`relative block whitespace-nowrap py-3 text-[13px] tracking-tight transition-colors ${
                  active ? "font-medium text-ink" : "text-ink-3 hover:text-ink-2"
                }`}
              >
                {item.name}
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-ink" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

async function ProductList({
  searchParams,
}: Pick<PageProps<"/">, "searchParams">) {
  const { category } = await searchParams;
  const activeSlug = typeof category === "string" ? category : undefined;

  const [products, categories] = await Promise.all([
    getProductCards(activeSlug),
    getCategories(),
  ]);
  const activeCategory = categories.find((c) => c.slug === activeSlug);

  return (
    <div className="px-5 py-6">
      {activeCategory && (
        <h2 className="tracking-headline mb-4 px-1 text-[20px] font-semibold text-ink">
          {activeCategory.name}
        </h2>
      )}

      {products.length === 0 ? (
        <EmptyState
          title={activeCategory ? "这个分类还没有商品" : "暂时还没有上架商品"}
          description={
            activeCategory
              ? "换个分类看看，或者回到全部商品。"
              : "店主还没有上架商品，请稍后再来。"
          }
          actionLabel={activeCategory ? "查看全部商品" : undefined}
          actionHref={activeCategory ? "/" : undefined}
        />
      ) : (
        <ul className="space-y-5">
          {products.map((p) => (
            <li key={p.id} className="rise">
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NoticeBarSkeleton() {
  return (
    <div className="px-5 pb-8 pt-10">
      <div className="mx-auto h-9 w-48 animate-pulse rounded-lg bg-surface" />
      <div className="mx-auto mt-3 h-3.5 w-64 animate-pulse rounded bg-surface" />
    </div>
  );
}

function CategoryNavSkeleton() {
  return (
    <div className="border-b border-hairline/50">
      <div className="flex gap-6 px-5 py-3">
        {[32, 52, 52, 52].map((w, i) => (
          <div
            key={i}
            className="h-3.5 animate-pulse rounded bg-surface"
            style={{ width: w }}
          />
        ))}
      </div>
    </div>
  );
}

function ProductListSkeleton() {
  return (
    <div className="space-y-5 px-5 py-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="overflow-hidden rounded-[20px] bg-surface">
          <div className="aspect-[4/3] w-full animate-pulse bg-hairline/30" />
          <div className="space-y-2 px-4 pb-4 pt-3">
            <div className="h-4 w-1/2 animate-pulse rounded bg-hairline/40" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-hairline/30" />
          </div>
        </div>
      ))}
    </div>
  );
}
