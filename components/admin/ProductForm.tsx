"use client";

import { useState, useTransition, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { uploadImage } from "@/lib/admin/upload";
import { saveProduct, saveSku, type ProductInput } from "@/app/actions/admin-products";

type Category = { id: string; name: string };

type ExistingSku = {
  id: string;
  specText: string;
  priceCents: number;
  stock: number;
  isActive: boolean;
};

/** 一段规格组：组名 + 该组所有取值（逗号分隔） */
type SpecGroupDraft = { name: string; values: string };

/**
 * 商品编辑表单 —— 后台最核心的界面。
 *
 * 设计取舍：
 *  1. 规格用「组名 + 取值列表」文本输入，而不是复杂的可视化编辑器。
 *     生成笛卡尔积后逐项定价 —— 这是店主最容易理解的方式。
 *  2. 图片先上传拿到 URL，再随商品一起保存。
 *     避免"表单填了一半，图片先落库"导致产生孤儿文件。
 *  3. 保存分两步：先存商品拿到 id，再批量存 SKU。
 *     新建商品时 SKU 需要 productId。
 */
export function ProductForm({
  categories,
  initial,
}: {
  categories: Category[];
  initial?: {
    id: string;
    title: string;
    slug: string;
    subtitle: string | null;
    description: string | null;
    coverImage: string;
    categoryId: string | null;
    status: "DRAFT" | "ACTIVE" | "ARCHIVED";
    sortOrder: number;
    specGroupsRaw: SpecGroupDraft[];
    skus: ExistingSku[];
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [coverImage, setCoverImage] = useState(initial?.coverImage ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE" | "ARCHIVED">(
    initial?.status ?? "DRAFT",
  );
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));

  const [groups, setGroups] = useState<SpecGroupDraft[]>(
    initial?.specGroupsRaw ?? [{ name: "", values: "" }],
  );

  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // ── 图片上传 ──
  async function handleUpload(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadImage(fd);
      if (result.ok) {
        setCoverImage(result.url);
        setMessage({ ok: true, text: "图片已上传" });
      } else {
        setMessage({ ok: false, text: result.message });
      }
    } catch {
      setMessage({ ok: false, text: "上传失败" });
    } finally {
      setUploading(false);
    }
  }

  // ── 自动生成 slug（仅新建时）──
  function autoSlug(val: string) {
    setTitle(val);
    if (!initial) {
      // 中文没法直接转 slug，给一个基于时间的占位，由店主自己改
      if (!slug) setSlug(`product-${Date.now().toString(36).slice(-5)}`);
    }
  }

  /** 计算笛卡尔积，得到所有规格组合 */
  function computeCombos(): { options: Record<string, string>; text: string }[] {
    const active = groups
      .map((g) => ({
        name: g.name.trim(),
        values: g.values
          .split(/[,，\s]+/)
          .map((v) => v.trim())
          .filter(Boolean),
      }))
      .filter((g) => g.name && g.values.length > 0);

    if (active.length === 0) {
      return [{ options: {}, text: "默认规格" }];
    }

    let combos: Record<string, string>[] = [{}];
    for (const g of active) {
      const next: Record<string, string>[] = [];
      for (const c of combos) {
        for (const v of g.values) next.push({ ...c, [g.name]: v });
      }
      combos = next;
    }

    return combos.map((options) => ({
      options,
      text: Object.values(options).join(" / "),
    }));
  }

  const combos = computeCombos();

  // 每个组合的定价草稿（key 用 specText）
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [draftStocks, setDraftStocks] = useState<Record<string, string>>({});

  const existingByText = new Map(
    (initial?.skus ?? []).map((s) => [s.specText || "默认规格", s]),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!title.trim()) {
      setMessage({ ok: false, text: "请填写商品名称" });
      return;
    }
    if (!coverImage) {
      setMessage({ ok: false, text: "请先上传主图" });
      return;
    }
    // 校验每个组合都有价格
    for (const c of combos) {
      const fromDraft = draftPrices[c.text];
      const fromExisting = existingByText.get(c.text)?.priceCents;
      const priceStr =
        fromDraft ??
        (fromExisting !== undefined ? String(fromExisting / 100) : "");
      if (!priceStr || Number(priceStr) <= 0) {
        setMessage({ ok: false, text: `请为「${c.text}」填写价格` });
        return;
      }
    }

    const payload: ProductInput = {
      id: initial?.id,
      title: title.trim(),
      slug: slug.trim(),
      subtitle: subtitle.trim(),
      description: description.trim(),
      coverImage,
      categoryId: categoryId || undefined,
      status,
      sortOrder: Number(sortOrder) || 0,
      // 规格组的有序定义随商品一起保存（前台按这个顺序渲染选择器）
      specGroups: groups
        .map((g) => ({
          name: g.name.trim(),
          values: g.values
            .split(/[,，\s]+/)
            .map((v) => v.trim())
            .filter(Boolean),
        }))
        .filter((g) => g.name && g.values.length > 0),
    };

    startTransition(async () => {
      // ① 先保存商品（含 specGroups），拿到 id
      const saved = await saveProduct(payload);
      if (!saved.ok) {
        setMessage({ ok: false, text: saved.message });
        return;
      }
      const productId = saved.data.id;

      // ② 逐项保存 SKU
      for (const c of combos) {
        const existing = existingByText.get(c.text);
        const priceStr =
          draftPrices[c.text] ??
          String((existing?.priceCents ?? 0) / 100);
        const stockStr =
          draftStocks[c.text] ?? String(existing?.stock ?? 0);

        const r = await saveSku({
          id: existing?.id,
          productId,
          optionValues: c.options,
          priceInput: priceStr,
          stock: Number(stockStr) || 0,
          isActive: existing?.isActive ?? true,
        });

        if (!r.ok) {
          setMessage({ ok: false, text: `${c.text}：${r.message}` });
          return;
        }
      }

      setMessage({ ok: true, text: "已保存" });
      router.refresh();
      router.push("/admin/products");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-7 pb-10">
      {/* ── 主图 ── */}
      <section>
        <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
          主图
        </label>
        <div className="flex items-center gap-4">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-surface">
            {coverImage ? (
              <Image
                src={coverImage}
                alt="主图"
                fill
                sizes="96px"
                className="object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-[11px] tracking-tight text-ink-3">
                未上传
              </div>
            )}
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="press rounded-pill bg-surface px-4 py-2 text-[12px] font-medium tracking-tight text-ink disabled:opacity-50"
            >
              {uploading ? "上传中…" : coverImage ? "更换图片" : "选择图片"}
            </button>
            <p className="mt-1.5 text-[10px] tracking-tight text-ink-3">
              JPG / PNG / WebP / AVIF，最大 5MB
            </p>
          </div>
        </div>
      </section>

      {/* ── 基本信息 ── */}
      <section className="space-y-4">
        <Field label="商品名称">
          <input
            value={title}
            onChange={(e) => autoSlug(e.target.value)}
            placeholder="如 冷光仙女棒"
            className="w-full rounded-xl bg-surface px-4 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
          />
        </Field>

        <Field label="URL 标识" hint="小写字母、数字、连字符">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="sparkler-30cm"
            className="tabular w-full rounded-xl bg-surface px-4 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
          />
        </Field>

        <Field label="副标题">
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="一句话卖点"
            className="w-full rounded-xl bg-surface px-4 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
          />
        </Field>

        <Field label="详细描述">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="材质、尺寸、使用与安全提示"
            className="w-full resize-y rounded-xl bg-surface px-4 py-2.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="分类">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-xl bg-surface px-4 py-2.5 text-[14px] text-ink outline-none focus:ring-[1.5px] focus:ring-accent"
            >
              <option value="">未分类</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="排序" hint="数字越小越靠前">
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="0"
              className="tabular w-full rounded-xl bg-surface px-4 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
            />
          </Field>
        </div>

        <Field label="状态">
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as "DRAFT" | "ACTIVE" | "ARCHIVED")
            }
            className="w-full rounded-xl bg-surface px-4 py-2.5 text-[14px] text-ink outline-none focus:ring-[1.5px] focus:ring-accent"
          >
            <option value="DRAFT">草稿（前台不可见）</option>
            <option value="ACTIVE">上架</option>
            <option value="ARCHIVED">归档</option>
          </select>
        </Field>
      </section>

      {/* ── 规格组 ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <label className="text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
            规格
          </label>
          <button
            type="button"
            onClick={() => setGroups([...groups, { name: "", values: "" }])}
            className="press text-[12px] text-accent"
          >
            + 添加规格组
          </button>
        </div>

        <p className="mb-3 text-[11px] leading-relaxed tracking-tight text-ink-3">
          留空表示无规格商品（只有一个默认 SKU）。取值用逗号分隔，如「30cm, 45cm」。
        </p>

        <div className="space-y-2">
          {groups.map((g, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={g.name}
                onChange={(e) => {
                  const next = [...groups];
                  next[i] = { ...next[i], name: e.target.value };
                  setGroups(next);
                }}
                placeholder="组名，如 长度"
                className="w-1/3 rounded-xl bg-surface px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
              />
              <input
                value={g.values}
                onChange={(e) => {
                  const next = [...groups];
                  next[i] = { ...next[i], values: e.target.value };
                  setGroups(next);
                }}
                placeholder="取值，如 30cm, 45cm"
                className="flex-1 rounded-xl bg-surface px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => setGroups(groups.filter((_, idx) => idx !== i))}
                className="press shrink-0 px-2 text-[12px] text-ink-3 hover:text-danger"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── 组合定价 ── */}
      <section>
        <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
          价格与库存（共 {combos.length} 个组合）
        </label>
        <div className="divide-y divide-hairline/40 rounded-2xl bg-surface px-4">
          {combos.map((c) => {
            const existing = existingByText.get(c.text);
            return (
              <div
                key={c.text}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-[12px] tracking-tight text-ink">
                  {c.text}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={
                      draftPrices[c.text] ??
                      (existing ? String(existing.priceCents / 100) : "")
                    }
                    onChange={(e) =>
                      setDraftPrices({
                        ...draftPrices,
                        [c.text]: e.target.value,
                      })
                    }
                    placeholder="价格"
                    className="tabular w-20 rounded-md bg-canvas px-2 py-1 text-[12px] text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
                  />
                  <span className="text-[11px] text-ink-3">元</span>
                  <input
                    type="number"
                    min="0"
                    value={
                      draftStocks[c.text] ??
                      (existing ? String(existing.stock) : "0")
                    }
                    onChange={(e) =>
                      setDraftStocks({
                        ...draftStocks,
                        [c.text]: e.target.value,
                      })
                    }
                    placeholder="库存"
                    className="tabular w-16 rounded-md bg-canvas px-2 py-1 text-[12px] text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
                  />
                  <span className="text-[11px] text-ink-3">件</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {message && (
        <p
          className={`rounded-xl px-3.5 py-2.5 text-[12px] leading-relaxed tracking-tight ${
            message.ok
              ? "bg-[#e8f8ee] text-[#00693a]"
              : "bg-[#fdecec] text-danger"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending || uploading}
          className="press flex-1 rounded-pill bg-accent py-3.5 text-[15px] font-medium tracking-tight text-white hover:bg-accent-hover disabled:bg-surface disabled:text-ink-3"
        >
          {pending ? "保存中…" : "保存商品"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/products")}
          className="press rounded-pill bg-surface px-6 py-3.5 text-[15px] font-medium tracking-tight text-ink"
        >
          取消
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 flex items-baseline gap-2 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
        {label}
        {hint && (
          <span className="text-[10px] font-normal normal-case tracking-tight text-ink-3">
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
