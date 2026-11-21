import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ProductStatus } from "@prisma/client";
import { getAdminProducts } from "@/lib/admin/queries";
import { formatPrice } from "@/lib/sku";
import { ProductStatusToggle, SkuRow } from "@/components/admin/ProductRow";

export const metadata = { title: "商品" };

const FILTERS: { value: ProductStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "全部" },
  { value: "ACTIVE", label: "在售" },
  { value: "DRAFT", label: "草稿" },
  { value: "ARCHIVED", label: "已归档" },
];

const STATUS_LABEL: Record<ProductStatus, string> = {
  ACTIVE: "在售",
  DRAFT: "草稿",
  ARCHIVED: "已归档",
};

export default function AdminProductsPage({
  searchParams,
}: PageProps<"/admin/products">) {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="tracking-display text-[26px] font-semibold text-ink">
          商品
        </h1>
        <Link
          href="/admin/products/new"
          className="press rounded-pill bg-accent px-4 py-2 text-[13px] font-medium tracking-tight text-white hover:bg-accent-hover"
        >
          添加商品
        </Link>
      </div>
      <Suspense fallback={<ProductsSkeleton />}>
        <ProductsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ProductsContent({
  searchParams,
}: Pick<PageProps<"/admin/products">, "searchParams">) {
  const { status, q } = await searchParams;
  const statusFilter = (
    typeof status === "string" ? status : "ALL"
  ) as ProductStatus | "ALL";
  const query = typeof q === "string" ? q : undefined;

  const products = await getAdminProducts({ status: statusFilter, q: query });

  return (
    <>
      <nav className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => {
          const active = statusFilter === f.value;
          const href =
            f.value === "ALL"
              ? "/admin/products"
              : `/admin/products?status=${f.value}`;
          return (
            <Link
              key={f.value}
              href={href}
              scroll={false}
              className={`press shrink-0 rounded-pill px-3.5 py-1.5 text-[12px] tracking-tight ${
                active
                  ? "bg-ink text-white"
                  : "bg-surface text-ink-2 hover:text-ink"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {products.length === 0 ? (
        <p className="rounded-2xl bg-surface px-4 py-12 text-center text-[13px] tracking-tight text-ink-3">
          还没有商品，点右上角「添加商品」开始
        </p>
      ) : (
        <ul className="space-y-3">
          {products.map((p) => (
            <li
              key={p.id}
              className="rounded-2xl bg-surface p-4"
            >
              <div className="flex gap-3">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-canvas">
                  <Image
                    src={p.coverImage || "/placeholder.svg"}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/products/${p.id}`}
                        className="press block truncate text-[15px] font-medium tracking-tight text-ink"
                      >
                        {p.title}
                      </Link>
                      <p className="mt-0.5 truncate text-[11px] tracking-tight text-ink-3">
                        {p.category?.name ?? "未分类"} · /{p.slug}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-pill px-2 py-0.5 text-[10px] tracking-tight ${
                          p.status === "ACTIVE"
                            ? "bg-[#e8f8ee] text-success"
                            : "bg-canvas text-ink-3"
                        }`}
                      >
                        {STATUS_LABEL[p.status]}
                      </span>
                      <ProductStatusToggle
                        productId={p.id}
                        status={p.status}
                      />
                    </div>
                  </div>

                  <p className="tabular mt-1 text-[12px] tracking-tight text-ink-2">
                    {formatPrice(p.minPriceCents)} 起 · 库存 {p.totalStock}
                  </p>
                </div>
              </div>

              {/* SKU 内联编辑 */}
              {p.skus.length > 0 && (
                <div className="mt-3 divide-y divide-hairline/40 border-t border-hairline/40 pt-1">
                  {p.skus.map((s) => (
                    <SkuRow key={s.id} sku={s} />
                  ))}
                </div>
              )}

              <p className="mt-2 text-[10px] tracking-tight text-ink-3">
                点击价格 / 库存可直接修改
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ProductsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface" />
      ))}
    </div>
  );
}
