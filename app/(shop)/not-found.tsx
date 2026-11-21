import Link from "next/link";

export const metadata = { title: "页面不存在" };

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-28 text-center">
      <p className="text-[13px] uppercase tracking-[0.1em] text-ink-3">
        404
      </p>
      <p className="tracking-display mt-3 text-[26px] font-semibold text-ink">
        此页面不存在
      </p>
      <p className="mt-2.5 max-w-[17rem] text-[13px] leading-relaxed tracking-tight text-ink-2">
        商品可能已下架，或者链接有误。
      </p>
      <Link
        href="/"
        className="press mt-7 rounded-pill bg-accent px-6 py-2.5 text-[14px] font-medium tracking-tight text-white hover:bg-accent-hover"
      >
        回到选购
      </Link>
    </div>
  );
}
