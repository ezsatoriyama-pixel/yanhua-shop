/**
 * 开发种子数据
 *
 *   npx prisma db seed
 *
 * 幂等：全部使用 upsert，重复执行不会产生重复数据。
 * 商品图片统一用 /placeholder.svg（public 下自带的占位图），
 * 阶段三接入真实图片时替换 coverImage 即可。
 */
import { PrismaClient, ProductStatus } from "@prisma/client";
import { buildSpecKey, buildSpecText, DEFAULT_SPEC_KEY } from "../lib/sku";

const prisma = new PrismaClient();

type SkuSeed = {
  optionValues: Record<string, string>;
  priceCents: number;
  stock: number;
  isActive?: boolean;
};

type ProductSeed = {
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  categorySlug: string;
  sortOrder: number;
  skus: SkuSeed[];
  /**
   * 规格组的有序定义。必须显式声明顺序 ——
   * Sku.optionValues 是 jsonb，读回来 key 顺序不可靠。
   */
  specGroups?: { name: string; values: string[] }[];
};

const CATEGORIES = [
  { name: "儿童烟花", slug: "kids", sortOrder: 1 },
  { name: "手持烟花", slug: "handheld", sortOrder: 2 },
  { name: "组合礼盒", slug: "gift-box", sortOrder: 3 },
];

const PRODUCTS: ProductSeed[] = [
  {
    slug: "sparkler-30cm",
    title: "冷光仙女棒",
    subtitle: "冷光配方，烟少光稳",
    description:
      "冷光配方，燃烧温度低、烟量少，光色稳定不闪爆。适合室内外派对、拍摄补光。\n每包 10 支，点燃后请手持金属杆尾端，远离可燃物。",
    categorySlug: "handheld",
    sortOrder: 1,
    specGroups: [
      { name: "长度", values: ["30cm", "45cm"] },
      { name: "包装", values: ["10支装", "20支装"] },
    ],
    skus: [
      { optionValues: { 长度: "30cm", 包装: "10支装" }, priceCents: 1200, stock: 120 },
      { optionValues: { 长度: "30cm", 包装: "20支装" }, priceCents: 2200, stock: 80 },
      // 故意留一个 0 库存组合，用于验证「置灰」逻辑
      { optionValues: { 长度: "45cm", 包装: "10支装" }, priceCents: 1800, stock: 0 },
      { optionValues: { 长度: "45cm", 包装: "20支装" }, priceCents: 3200, stock: 45 },
    ],
  },
  {
    slug: "ground-spinner",
    title: "地面旋转烟花",
    subtitle: "贴地旋转，低空安全",
    description:
      "放置于平整硬质地面上点燃，旋转上升后喷花。留存安全距离 3 米以上，儿童须成人陪同。\n每盒 6 枚。",
    categorySlug: "kids",
    sortOrder: 2,
    specGroups: [{ name: "规格", values: ["6枚装", "12枚装"] }],
    skus: [
      { optionValues: { 规格: "6枚装" }, priceCents: 2800, stock: 60 },
      { optionValues: { 规格: "12枚装" }, priceCents: 5200, stock: 30 },
    ],
  },
  {
    slug: "fountain-candle",
    title: "喷泉烟花",
    subtitle: "室内可用的低烟款",
    description:
      "低烟配方，喷花高度约 1 米，燃烧约 40 秒。适合生日蛋糕、聚会桌面摆放。\n需置于不可燃底座上使用，远离纸花与气球。",
    categorySlug: "kids",
    sortOrder: 3,
    specGroups: [
      { name: "尺寸", values: ["小号", "大号"] },
      { name: "颜色", values: ["银色", "金色"] },
    ],
    skus: [
      { optionValues: { 尺寸: "小号", 颜色: "银色" }, priceCents: 1500, stock: 40 },
      { optionValues: { 尺寸: "小号", 颜色: "金色" }, priceCents: 1500, stock: 35 },
      { optionValues: { 尺寸: "大号", 颜色: "银色" }, priceCents: 2600, stock: 20 },
      { optionValues: { 尺寸: "大号", 颜色: "金色" }, priceCents: 2600, stock: 18 },
    ],
  },
  {
    slug: "safety-kit",
    title: "点火套装",
    subtitle: "长杆点火器 + 防护手套",
    description:
      "长杆点火器 1 支、阻燃手套 1 副。长杆设计保持安全距离，是燃放烟花的推荐配件。",
    categorySlug: "handheld",
    sortOrder: 4,
    skus: [
      // 无规格商品：使用 DEFAULT_SPEC_KEY，前端不显示选择器
      { optionValues: {}, priceCents: 3500, stock: 50 },
    ],
  },
  {
    slug: "party-gift-box",
    title: "派对组合礼盒",
    subtitle: "一次配齐，适合生日与节庆",
    description:
      "含仙女棒、地面旋转、喷泉三类共 8 件，附点火器与使用说明卡。礼盒装，可直接送人。",
    categorySlug: "gift-box",
    sortOrder: 5,
    specGroups: [{ name: "版本", values: ["标准版", "豪华版"] }],
    skus: [
      { optionValues: { 版本: "标准版" }, priceCents: 8800, stock: 25 },
      { optionValues: { 版本: "豪华版" }, priceCents: 15800, stock: 10 },
    ],
  },
  {
    slug: "draft-test-product",
    title: "下架测试商品（草稿）",
    subtitle: "这是一条草稿商品，不应出现在前台",
    description: "用于验证：DRAFT 状态的商品在首页、详情页均不可达。",
    categorySlug: "gift-box",
    sortOrder: 6,
    skus: [{ optionValues: {}, priceCents: 9900, stock: 10 }],
  },
];

async function main() {
  console.log("开始播种…");

  // ── 门店 ──
  await prisma.store.upsert({
    where: { id: "main-store" },
    update: {
      name: process.env.NEXT_PUBLIC_STORE_NAME ?? "长夜烟花",
      notice: "需实名登记，请凭取货号领取。",
    },
    create: {
      id: "main-store",
      name: process.env.NEXT_PUBLIC_STORE_NAME ?? "长夜烟花",
      address: "示例市示例区示例路 88 号 1 层",
      phone: "000-0000-0000",
      notice: "需实名登记，请凭取货号领取。",
    },
  });
  console.log("✓ 门店");

  // ── 分类 ──
  const categoryIds = new Map<string, string>();
  for (const c of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, sortOrder: c.sortOrder },
      create: c,
    });
    categoryIds.set(c.slug, row.id);
  }
  console.log(`✓ 分类 ${CATEGORIES.length} 个`);

  // ── 商品与 SKU ──
  for (const p of PRODUCTS) {
    const isDraft = p.slug === "draft-test-product";
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        title: p.title,
        subtitle: p.subtitle,
        description: p.description,
        categoryId: categoryIds.get(p.categorySlug),
        sortOrder: p.sortOrder,
        status: isDraft ? ProductStatus.DRAFT : ProductStatus.ACTIVE,
        minPriceCents: Math.min(...p.skus.map((s) => s.priceCents)),
        specGroups: p.specGroups ?? undefined,
      },
      create: {
        slug: p.slug,
        title: p.title,
        subtitle: p.subtitle,
        description: p.description,
        coverImage: "/placeholder.svg",
        categoryId: categoryIds.get(p.categorySlug),
        sortOrder: p.sortOrder,
        status: isDraft ? ProductStatus.DRAFT : ProductStatus.ACTIVE,
        minPriceCents: Math.min(...p.skus.map((s) => s.priceCents)),
        specGroups: p.specGroups ?? undefined,
      },
    });

    for (const [index, s] of p.skus.entries()) {
      const isDefault = Object.keys(s.optionValues).length === 0;
      const specKey = isDefault ? DEFAULT_SPEC_KEY : buildSpecKey(s.optionValues);
      const specText = isDefault ? "" : buildSpecText(s.optionValues);

      await prisma.sku.upsert({
        where: { productId_specKey: { productId: product.id, specKey } },
        update: {
          priceCents: s.priceCents,
          stock: s.stock,
          isActive: s.isActive ?? true,
          specText,
          optionValues: s.optionValues,
          sortOrder: index,
        },
        create: {
          productId: product.id,
          specKey,
          specText,
          optionValues: s.optionValues,
          priceCents: s.priceCents,
          stock: s.stock,
          isActive: s.isActive ?? true,
          sortOrder: index,
        },
      });
    }
  }
  console.log(`✓ 商品 ${PRODUCTS.length} 个（含 1 个 DRAFT 用于验证过滤）`);

  // ── 今明两天的取货时段 ──
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 先清理今天之前的旧时段：seed 是可反复执行的，
  // 不清会按天累积历史数据，让结算页出现一堆过期时段。
  const purged = await prisma.pickupSlot.deleteMany({
    where: { date: { lt: today }, booked: 0 },
  });
  if (purged.count > 0) {
    console.log(`✓ 清理过期时段 ${purged.count} 个`);
  }

  const slots = ["11:30", "12:00", "12:30", "17:30", "18:00", "18:30"];
  let slotCount = 0;
  for (const dayOffset of [0, 1]) {
    const day = new Date(today);
    day.setDate(day.getDate() + dayOffset);
    day.setHours(0, 0, 0, 0);

    for (const start of slots) {
      const [h, m] = start.split(":").map(Number);
      const endMinutes = h * 60 + m + 30;
      const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(
        endMinutes % 60,
      ).padStart(2, "0")}`;

      await prisma.pickupSlot.upsert({
        where: { date_startTime: { date: day, startTime: start } },
        update: {},
        create: {
          date: day,
          startTime: start,
          endTime: end,
          // 12:00 时段设为 1 人，方便验证「时段已满」
          capacity: start === "12:00" ? 1 : 20,
          booked: 0,
        },
      });
      slotCount++;
    }
  }
  console.log(`✓ 取货时段 ${slotCount} 个（12:00 容量 1，用于验证售罄）`);

  // ── 管理员账号（登录后可访问 /admin） ──
  const adminEmail = process.env.ADMIN_EMAILS?.split(",")[0]?.trim();
  if (adminEmail) {
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash("admin123456", 10);
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: "ADMIN" },
      create: {
        email: adminEmail,
        name: "店主",
        role: "ADMIN",
        passwordHash,
        emailVerified: new Date(),
      },
    });
    console.log(`✓ 管理员 ${adminEmail}（初始密码 admin123456，请上线前修改）`);
  }

  console.log("播种完成 ✅");
}

main()
  .catch((e) => {
    console.error("播种失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
