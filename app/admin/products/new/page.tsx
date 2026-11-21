import { Suspense } from "react";
import Link from "next/link";
import { getAdminCategories } from "@/lib/admin/queries";
import { ProductForm } from "@/components/admin/ProductForm";

export const metadata = { title: "添加商品" };

export default function NewProductPage() {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="tracking-display text-[26px] font-semibold text-ink">
          添加商品
        </h1>
        <Link href="/admin/products" className="press text-[13px] text-accent">
          返回
        </Link>
      </div>
      <Suspense fallback={<FormSkeleton />}>
        <FormContent />
      </Suspense>
    </div>
  );
}

async function FormContent() {
  const categories = await getAdminCategories();
  return <ProductForm categories={categories} />;
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-surface" />
      ))}
    </div>
  );
}
