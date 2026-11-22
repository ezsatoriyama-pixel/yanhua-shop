import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { SkuSelector } from "@/components/product/SkuSelector";
import { getProductDetail, getAllProductSlugs } from "@/lib/queries/catalog";

/**
 * 商品详情（静态版）
 *
 * 关键点：
 *   1. generateStaticParams 让所有商品在构建时预渲染
 *   2. dynamicParams = false：未知 slug 直接 404，不再尝试构建
 *   3. Next 16 中 params 是 **Promise**，必须 await，
 *      否则 params.slug 恒为 undefined → 一定触发 notFound()
 *      （踩过：页面全部变成「页面不存在」）
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllProductSlugs().map((slug) => ({ slug }));
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProductDetail(slug);
  if (!product) notFound();

  const soldOut =
    product.skus.length === 0 || product.skus.every((s) => s.stock <= 0);

  return (
    <div>
      <div className="px-5 py-2.5">
        <Link
          href="/"
          className="press inline-flex items-center gap-1 text-[13px] tracking-tight text-accent"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M14.5 6 9 12l5.5 6" />
          </svg>
          选购
        </Link>
      </div>

      <div className="relative aspect-square w-full overflow-hidden bg-surface">
        <Image
          src={product.coverImage || "/placeholder.svg"}
          alt={product.title}
          fill
          sizes="(max-width: 680px) 100vw, 680px"
          className="object-cover"
          priority
          unoptimized
        />
        {soldOut && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-canvas/90 px-4 py-2 text-[13px] font-medium tracking-tight text-ink-2 backdrop-blur">
            已售罄
          </span>
        )}
      </div>

      <section className="px-5 pb-2 pt-7 text-center">
        {product.subtitle && (
          <p className="text-[13px] tracking-tight text-ink-3">{product.subtitle}</p>
        )}
        <h1 className="tracking-display mt-1.5 text-[30px] font-semibold text-ink">
          {product.title}
        </h1>
      </section>

      <section className="mt-6 px-5">
        <SkuSelector
          skus={product.skus}
          groups={product.specGroups ?? []}
          productSlug={product.slug}
          productTitle={product.title}
          coverImage={product.coverImage}
        />
      </section>

      {product.description && (
        <section className="mt-10 bg-surface px-5 py-7">
          <h2 className="tracking-headline text-[17px] font-semibold text-ink">
            产品信息
          </h2>
          <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed tracking-tight text-ink-2">
            {product.description}
          </p>
        </section>
      )}

      <div className="px-5 py-7">
        <Link
          href="/cart/"
          className="press flex items-center justify-between rounded-2xl bg-surface px-4 py-3.5"
        >
          <span className="text-[13px] tracking-tight text-ink">查看购物车</span>
          <span className="text-ink-3">→</span>
        </Link>
      </div>
    </div>
  );
}
