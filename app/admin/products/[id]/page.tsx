import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminProduct, getAdminCategories } from "@/lib/admin/queries";
import { ProductForm } from "@/components/admin/ProductForm";

export const metadata = { title: "编辑商品" };

export default function EditProductPage({
  params,
}: PageProps<"/admin/products/[id]">) {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="tracking-display text-[26px] font-semibold text-ink">
          编辑商品
        </h1>
        <Link href="/admin/products" className="press text-[13px] text-accent">
          返回
        </Link>
      </div>
      <Suspense fallback={<FormSkeleton />}>
        <FormContent params={params} />
      </Suspense>
    </div>
  );
}

async function FormContent({
  params,
}: Pick<PageProps<"/admin/products/[id]">, "params">) {
  const { id } = await params;

  const [product, categories] = await Promise.all([
    getAdminProduct(id),
    getAdminCategories(),
  ]);

  if (!product) notFound();

  // 把已存的 specGroups 还原成表单可编辑的「组名 + 逗号分隔取值」
  const declared = product.specGroups as
    | { name: string; values: string[] }[]
    | null;
  const specGroupsRaw =
    Array.isArray(declared) && declared.length > 0
      ? declared.map((g) => ({ name: g.name, values: g.values.join(", ") }))
      : [{ name: "", values: "" }];

  return (
    <ProductForm
      categories={categories}
      initial={{
        id: product.id,
        title: product.title,
        slug: product.slug,
        subtitle: product.subtitle,
        description: product.description,
        coverImage: product.coverImage,
        categoryId: product.categoryId,
        status: product.status,
        sortOrder: product.sortOrder,
        specGroupsRaw,
        skus: product.skus.map((s) => ({
          id: s.id,
          specText: s.specText,
          priceCents: s.priceCents,
          stock: s.stock,
          isActive: s.isActive,
        })),
      }}
    />
  );
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
