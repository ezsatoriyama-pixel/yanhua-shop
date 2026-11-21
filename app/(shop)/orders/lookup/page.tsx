import Link from "next/link";
import { OrderLookupForm } from "@/components/order/OrderLookupForm";

export const metadata = { title: "查订单" };

export default function OrderLookupPage() {
  return (
    <div>
      <div className="px-5 py-2.5">
        <Link
          href="/orders"
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
          订单
        </Link>
      </div>
      <header className="px-5 pb-5 pt-2">
        <h1 className="tracking-display text-[28px] font-semibold text-ink">
          查订单
        </h1>
      </header>
      <OrderLookupForm />
    </div>
  );
}
