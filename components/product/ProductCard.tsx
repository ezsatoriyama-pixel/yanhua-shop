import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/sku";

export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  coverImage: string;
  /** 起售价（分）：该商品最低 ACTIVE SKU 价格 */
  minPriceCents: number;
  /** 任一 ACTIVE SKU 有库存即为 true */
  inStock: boolean;
  categoryName?: string;
};

/**
 * 商品卡片 —— Apple 产品网格的移动端形态。
 *
 * 设计取舍：
 *  - 不用描边卡片，改用 #f5f5f7 圆角面板承载（Apple 的 tile 语言）
 *  - 图片大、文字少、价格用「¥18」+ 小字「起」
 *  - 标题紧字距，副标题次级灰
 *  - 整卡可点，按压轻微缩放
 */
export function ProductCard({ product }: { product: ProductCardData }) {
  const soldOut = !product.inStock;

  return (
    <Link
      href={`/product/${product.slug}`}
      className="press group block overflow-hidden rounded-[20px] bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {/* 图片区：正方形，浅灰底，售罄降饱和 */}
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <Image
          src={product.coverImage || "/placeholder.svg"}
          alt=""
          fill
          sizes="(max-width: 680px) 100vw, 680px"
          className={`object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02] ${
            soldOut ? "opacity-50 saturate-50" : ""
          }`}
        />
        {soldOut && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-canvas/85 px-3.5 py-1.5 text-[12px] font-medium tracking-tight text-ink-2 backdrop-blur">
            已售罄
          </span>
        )}
      </div>

      {/* 文字区：Apple 把信息压到最少 */}
      <div className="px-4 pb-4 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-[16px] font-semibold tracking-headline text-ink">
            {product.title}
          </h3>
          {product.categoryName && (
            <span className="shrink-0 text-[11px] tracking-tight text-ink-3">
              {product.categoryName}
            </span>
          )}
        </div>

        {product.subtitle && (
          <p className="mt-1 line-clamp-1 text-[13px] leading-snug tracking-tight text-ink-2">
            {product.subtitle}
          </p>
        )}

        <p className="mt-2.5 text-[14px] tracking-tight text-ink">
          <span className="tabular font-medium">
            {formatPrice(product.minPriceCents)}
          </span>
          <span className="ml-1 text-[11px] text-ink-3">起</span>
        </p>
      </div>
    </Link>
  );
}
