import { ProductCard } from "@/components/product/ProductCard";
import { EmptyState } from "@/components/common/EmptyState";
import { getCategories, getProductCards, getStore } from "@/lib/queries/catalog";

/**
 * 首页（静态版）
 *
 * 数据来自构建时打包的 data/catalog.json，不连数据库。
 * 分类筛选改用客户端路由参数 —— 静态导出不支持运行时 searchParams。
 */
export default function HomePage() {
  const store = getStore();
  const categories = getCategories();
  const products = getProductCards();

  return (
    <div>
      <section className="px-5 pb-8 pt-10 text-center">
        <h1 className="tracking-display text-[34px] font-semibold text-ink">
          挑一件
        </h1>
        <p className="mx-auto mt-2.5 max-w-[19rem] text-[14px] leading-relaxed tracking-tight text-ink-2">
          {store?.notice ?? "选好规格即可加入购物车。"}
        </p>
        {store && (
          <p className="mt-3 text-[12px] tracking-tight text-ink-3">
            {store.name} · {store.address}
          </p>
        )}
      </section>

      {/* 分类：静态站用锚点跳转 */}
      <div className="sticky top-11 z-30 bg-canvas/85 backdrop-blur-xl">
        <nav className="border-b border-hairline/50">
          <ul className="no-scrollbar flex gap-6 overflow-x-auto px-5">
            <li className="shrink-0">
              <a
                href="#all"
                className="block whitespace-nowrap py-3 text-[13px] font-medium tracking-tight text-ink"
              >
                全部
              </a>
            </li>
            {categories.map((c) => (
              <li key={c.slug} className="shrink-0">
                <a
                  href={`#cat-${c.slug}`}
                  className="block whitespace-nowrap py-3 text-[13px] tracking-tight text-ink-3 hover:text-ink"
                >
                  {c.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="px-5 py-6">
        {products.length === 0 ? (
          <EmptyState
            title="暂时还没有上架商品"
            description="店主还没有上架商品，请稍后再来。"
          />
        ) : (
          <>
            <ul className="space-y-5" id="all">
              {products.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>

            {/* 分类锚点 */}
            {categories.map((c) => {
              const list = products.filter((p) => p.categoryName === c.name);
              if (list.length === 0) return null;
              return (
                <section key={c.slug} id={`cat-${c.slug}`} className="mt-10">
                  <h2 className="tracking-headline mb-4 text-[20px] font-semibold text-ink">
                    {c.name}
                  </h2>
                  <ul className="space-y-5">
                    {list.map((p) => (
                      <li key={`${c.slug}-${p.id}`}>
                        <ProductCard product={p} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
