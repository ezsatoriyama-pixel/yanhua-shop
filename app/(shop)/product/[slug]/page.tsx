import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { SkuSelector } from "@/components/product/SkuSelector";
import { getProductDetail } from "@/lib/queries/products";

/**
 * 商品详情 —— Apple 产品页结构：
 *  全宽大图 → 居中标题区（大标题 + 副标题）→ 配置区（规格/价格/加购）
 *  信息用留白分组，不用卡片描边。
 */
export default function ProductPage({ params }: PageProps<"/product/[slug]">) {
  return (
    <div>
      <div className="px-5 py-2.5">
        <Link
          href="/"
          className="press inline-flex items-center gap-1 text-[13px] tracking-tight text-accent"
        >
          <ChevronLeft />
          选购
        </Link>
      </div>
      <Suspense fallback={<ProductDetailSkeleton />}>
        <ProductDetail params={params} />
      </Suspense>
    </div>
  );
}

async function ProductDetail({
  params,
}: Pick<PageProps<"/product/[slug]">, "params">) {
  const { slug } = await params;
  const product = await getProductDetail(slug);

  if (!product) notFound();

  const soldOut = product.skus.every((s) => s.stock <= 0);

  return (
    <>
      {/* 主图：Apple 用满宽浅灰底 + 居中产品图 */}
      <div className="relative aspect-square w-full overflow-hidden bg-surface">
        <Image
          src={product.coverImage}
          alt={product.title}
          fill
          sizes="(max-width: 680px) 100vw, 680px"
          className="object-cover rise"
          priority
        />
        {soldOut && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-canvas/90 px-4 py-2 text-[13px] font-medium tracking-tight text-ink-2 backdrop-blur">
            已售罄
          </span>
        )}
      </div>

      {/* 标题区 */}
      <section className="px-5 pb-2 pt-7 text-center">
        {product.subtitle && (
          <p className="text-[13px] tracking-tight text-ink-3">{product.subtitle}</p>
        )}
        <h1 className="tracking-display mt-1.5 text-[30px] font-semibold text-ink">
          {product.title}
        </h1>
      </section>

      {/* 配置区 */}
      <section className="mt-6 px-5">
        <SkuSelector skus={product.skus} groups={product.groups} />
      </section>

      {/* 商品说明：Apple 用浅灰面板承载长文本 */}
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
          href="/cart"
          className="press flex items-center justify-between rounded-2xl bg-surface px-4 py-3.5"
        >
          <span className="text-[13px] tracking-tight text-ink">查看购物车</span>
          <ChevronRight />
        </Link>
      </div>
    </>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 6 9 12l5.5 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-ink-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.5 6 15 12l-5.5 6" />
    </svg>
  );
}

function ProductDetailSkeleton() {
  return (
    <div>
      <div className="aspect-square w-full animate-pulse bg-surface" />
      <div className="space-y-4 px-5 pt-7">
        <div className="mx-auto h-7 w-40 animate-pulse rounded bg-surface" />
        <div className="h-3.5 w-full animate-pulse rounded bg-surface" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface" />
      </div>
    </div>
  );
}
