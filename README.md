# 长夜烟花 · 到店自取点单站

扫码点单式的交互，但卖的是自营**烟花爆竹**。移动优先的 Web 站点，不做小程序。

- **技术栈**：Next.js 16（App Router）+ TypeScript + Tailwind CSS 4
- **数据库**：PostgreSQL + Prisma 6
- **认证**：NextAuth (Auth.js v5) + Prisma Adapter
- **当前进度**：P0 闭环跑通 + Apple 极简视觉 + 烟花品类 + **管理后台**

> 前台主路径：首页 → 商品详情选规格 → 加购 → 购物车 → 结算 → 事务下单 → **取货号**。
> 后台：`/admin` 登录后可管理订单、商品、价格、库存、分类与图片。

## 后台（`/admin`）

访问 `http://localhost:3000/login`（局域网内用 `http://<本机IP>:3000/login`）。

**当前账号：`1232456` / `123321`**

改账号密码：

```bash
npx tsx scripts/set-admin.ts <新账号> <新密码>
```

再用 `npx tsx scripts/qr.ts http://<本机IP>:3000` 生成扫码入口。

### 让别人的设备也能访问

#### 方式 A：局域网（同一 Wi-Fi）

```bash
npm run build
npm run start        # 已固定 -H 0.0.0.0 -p 3000，监听所有网卡
```

- 访问 `http://<本机IP>:3000`，本机 IP 用 `Get-NetIPAddress -AddressFamily IPv4` 查
- `AUTH_URL` **不要写死 localhost**，留空让 Auth.js 按请求 Host 推断
- `AUTH_TRUST_HOST=true`

#### 方式 B：公网 HTTPS（cloudflared 快速隧道）

```bash
node scripts/start-all.mjs
```

这个脚本会依次：检查/启动数据库 → 检查/启动网站 → 启动 cloudflared 隧道
→ 解析并打印公网地址，同时写入 `.tunnel-url.txt`。

输出形如：

```
✅ 公网地址: https://xxx-yyy-zzz.trycloudflare.com
```

**特点与限制**：

| 项 | 说明 |
|---|---|
| HTTPS | 自带，浏览器不会警告 |
| 有效期 | 临时隧道，**每次重启地址都会变** |
| 存活 | 依赖电脑开机且 tunnel 进程在跑 |
| 费用 | 免费，无需 Cloudflare 账号 |
| 稳定性 | 官方明确说明「无 uptime 保证」，仅适合演示/试用 |

> 要固定域名 + 长期运行，需注册 Cloudflare 账号并创建 named tunnel；
> 或直接把项目部署到 Vercel（见下文）。

#### 方式 C：开机自启

已安装：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\yanhua-shop-start.bat`

登录 Windows 后自动执行 `node scripts/start-all.mjs`，完成数据库 + 网站 + 隧道启动。
无需管理员权限（用的是用户级启动文件夹，不是任务计划程序）。

停止自启：删掉该 .bat 即可。

**每次开机后地址会变**，用这个命令查当前地址：

```bash
Get-Content .tunnel-url.txt
```

### 后端启动脚本说明

`scripts/start-all.mjs` 对每一步都先检查「是否已在运行」，可安全重复执行。
日志写到 `startup.log`（UTF-8）。踩过的坑：

1. `spawn` + `detached + unref` 会在父进程退出后杀掉子进程 → 改用 PowerShell `Start-Process`
2. 固定文件名 `tunnel.log` 会被残留进程占用导致 `EBUSY` → 改用带时间戳的唯一文件名
3. 解析旧日志会拿到已失效的地址 → 每次启动用新文件，并取最后一个匹配

| 页面 | 能力 |
|---|---|
| `/admin` | 概览：待处理订单、今日营业额、在售商品、库存告急 |
| `/admin/orders` | 按状态筛选、搜索订单号/手机号、一键确认/完成/取消 |
| `/admin/orders/[id]` | 订单详情（含快照明细） |
| `/admin/products` | 商品列表，**内联改价/改库存**，一键上下架 |
| `/admin/products/new` | 添加商品：图片上传 + 规格组 + 自动生成 SKU 组合定价 |
| `/admin/products/[id]` | 编辑商品 |
| `/admin/categories` | 分类一览 |

### 安全设计（重要）

三层防线，缺一不可：

1. **`proxy.ts`（请求网关）** — 无 session cookie 时直接返回 404。
   这是唯一能保证「后台数据零泄露」的一层：Next 16 下 page 与 layout **并行渲染**，
   只在 layout 判断权限时，页面本身仍会执行并把数据写进 RSC payload。
2. **`app/admin/layout.tsx`** — 校验角色后再渲染导航与内容。
3. **每个 Server Action 内部 `requireAdminAction()`** — Server Action 是公开 POST 端点，
   页面拦截完全挡不住直接调用，必须逐个再校验。

未通过鉴权一律返回 **404**（而不是跳登录页），避免暴露「这里有个后台」。

### ⚠️ 图片存储的部署限制

当前实现写到 `public/uploads/`，**只在本地开发有效**。
Vercel 的文件系统是只读的，上线必须换成对象存储（Vercel Blob / 阿里云 OSS / 腾讯云 COS）。
换实现只需改 `lib/admin/upload.ts` 里的 `saveFile()` 一个函数。

## ⚠️ 合规前置（上线前必读）

烟花属于**特许经营**商品，以下不是建议而是硬约束：

1. **不能快递。**《烟花爆竹安全管理条例》禁止邮寄、在托运的行李和包裹中夹带。
   因此本站**只做到店自取**，`FulfillmentType.DELIVERY` 字段保留但业务上禁用。
2. **需《烟花爆竹经营（零售）许可证》。** 没有许可证不得销售，网站最多只能做展示。
3. **实名登记。** 多数地区要求登记购买人姓名与身份证件。`.env.example` 预留了
   `ENABLE_REALNAME_CHECK`，接入时在结算页增加姓名 + 身份证字段。
4. **线上支付受限。** 收单机构对该品类有严格类目限制，这也是 P0 不接支付的
   额外理由（原本的理由是"先跑通订单状态机"）。
5. **未成年人。** 建议在结算页加年龄确认，并在商品页标注"儿童须成人陪同"。

代码层面已经配合的点：不提供地址表单、不计算运费、`deliveryFeeCents` 恒为 0。

## 视觉风格

参照 apple.com 的极简语言，全部落在 `app/globals.css` 的 design token 上：

| 要素 | 采用 |
|---|---|
| 字体 | 系统字体栈（macOS/iOS 即 SF Pro，Windows 回落 Segoe UI，**不外链字体**） |
| 字距 | 全局 `-0.01em`，大标题 `-0.022em`（`.tracking-display`） |
| 背景 | 纯白 `#ffffff` + Apple 标志性浅灰 `#f5f5f7` 面板分层 |
| 分割 | 1px `#d2d2d7` 极细线，**不用卡片描边与阴影** |
| 强调色 | 单一 Apple 蓝 `#0071e3`，只用于主按钮与链接 |
| 按钮 | 胶囊 (`border-radius: 980px`)、44px 高、按压轻微缩放 |
| 选中态 | 加深描边重量（而非填充色），这是 Apple 配置器的核心手法 |

预览截图见 `docs/screens/`。

---

## 1. 本地启动

### 1.1 装依赖

```bash
npm install
```

### 1.2 启动数据库（便携 PostgreSQL，零手工安装）

本项目不要求你预装 PostgreSQL 或 Docker。`scripts/db.mjs` 会用
`embedded-postgres` 拉起一个真实的 PostgreSQL 18 实例，数据存在 `.pgdata/`。

```bash
# 终端 A：保持运行
npm run db:start
```

启动成功会打印连接串。默认值：

```
postgresql://shop:shoppw@127.0.0.1:55432/shopdev?schema=public
```

> **Windows 中文系统注意**：脚本已显式传 `--encoding=UTF8 --locale=C`。
> 不加这两个参数时，initdb 会因系统 GBK locale 推导失败 —— 这是踩过的坑，勿删。

### 1.3 配置环境变量

```bash
cp .env.example .env
```

然后填 `AUTH_SECRET`：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 1.4 建表 + 灌种子数据

```bash
npm run db:migrate    # 应用 prisma/migrations
npm run db:seed       # 分类、商品、SKU、取货时段、管理员
```

种子数据（烟花品类，用于验证各条分支）：

| 分类 | 商品 | 规格 | 备注 |
|---|---|---|---|
| 手持烟花 | 冷光仙女棒 | 长度 × 包装（4 组合） | 含 1 个 **0 库存**组合，验证置灰 |
| 儿童烟花 | 地面旋转烟花 | 规格（6枚/12枚） | |
| 儿童烟花 | 喷泉烟花 | 尺寸 × 颜色（4 组合） | |
| 手持烟花 | 点火套装 | **无规格** | 验证单 SKU 自动选中 |
| 组合礼盒 | 派对组合礼盒 | 版本（标准/豪华） | |
| 组合礼盒 | 下架测试商品 | 无规格 | **DRAFT**，验证前台不可达 |

> 换品类后旧商品不会自动消失（seed 用 upsert）。
> 需要清理时运行 `npx tsx scripts/purge-legacy.ts`。

### 1.5 启动

```bash
npm run dev
```

打开 http://localhost:3000

---

## 2. 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:start` / `db:stop` | 启停本地 PostgreSQL |
| `npm run db:migrate` | 创建并应用迁移 |
| `npm run db:seed` | 灌种子数据（幂等） |
| `npm run db:studio` | 打开 Prisma Studio 直接改库（P1 后台做出来之前，用它改商品） |
| `npx tsx scripts/verify-sku.ts` | 验证 SKU 规格键与可选性逻辑 |

---

## 3. 目录结构

```
shop/
├── app/
│   ├── layout.tsx                  全站骨架：顶栏 + Suspense 包裹的底部 Tab
│   ├── page.tsx                    /                 首页（分类 + 商品列表）
│   ├── globals.css                 Tailwind 4 主题变量
│   ├── error.tsx                   / 错误边界
│   ├── not-found.tsx               / 404
│   ├── product/[slug]/page.tsx     /product/[slug]   商品详情 + 规格选择
│   ├── cart/page.tsx               /cart             购物车
│   ├── checkout/page.tsx           /checkout         确认订单
│   ├── orders/
│   │   ├── page.tsx                /orders           订单列表
│   │   ├── lookup/page.tsx         /orders/lookup    游客查单
│   │   └── [id]/page.tsx           /orders/[id]      订单详情
│   ├── admin/page.tsx              /admin            P1 占位（无鉴权，见页面提示）
│   ├── api/health/route.ts         /api/health       健康检查（含 DB 连通性）
│   └── actions/
│       ├── cart.ts                 购物车 Server Actions（空实现 + 占位返回）
│       └── order.ts                订单 Server Actions（空实现 + 事务流程注释）
├── components/
│   ├── layout/TopBar.tsx
│   ├── layout/BottomTabBar.tsx     底部 Tab（usePathname 需 Suspense）
│   ├── product/ProductCard.tsx     商品卡片（起售价 + 库存状态）
│   ├── product/SkuSelector.tsx     规格选择（specKey 命中唯一 SKU）
│   ├── cart/CartLine.tsx           购物车行（快照价 + 数量上限）
│   ├── cart/CartView.tsx           购物车客户端容器
│   ├── checkout/CheckoutForm.tsx   结算表单（requestId 幂等）
│   ├── order/OrderStatusBadge.tsx  订单状态徽章
│   ├── order/OrderLookupForm.tsx   游客查单表单
│   └── common/EmptyState.tsx       空状态
├── lib/
│   ├── sku.ts                      buildSpecKey / matchSku / formatPrice ← 单一真相
│   ├── prisma.ts                   Prisma 单例
│   └── mock-data.ts                阶段二占位数据（阶段三删除）
├── prisma/
│   ├── schema.prisma               完整数据模型
│   ├── seed.ts                     幂等种子数据
│   └── migrations/                 迁移历史
├── scripts/
│   ├── db.mjs                      便携 PostgreSQL 启停
│   └── verify-sku.ts               SKU 逻辑回归检查
├── .env.example                    环境变量清单
└── .pgdata/                        本地数据库文件（已 gitignore）
```

---

## 4. 关键设计决策

### 4.1 认证选 NextAuth，不选 Supabase Auth

已定 PostgreSQL + Prisma 为单一数据源。Supabase Auth 把用户放在 `auth.users`，
Prisma 侧要双写或建视图，用户数据分裂成两套真相，且迁到自建服务器时要重写认证。
NextAuth 的 `User / Account / Session` 就是 Prisma 模型，换库换平台零改动。

### 4.2 SKU 规格用 `specKey` 字符串做唯一锚点

不建 `OptionGroup / OptionValue / SkuOption` 三表。`Sku.optionValues` 存 JSON 供展示，
`specKey` 存归一化键（组名按 Unicode 码点升序，用 `|` 连接）供前端 O(1) 命中。

**`buildSpecKey()` 是唯一真相来源（`lib/sku.ts`），服务端与前端必须调用同一个函数。**
`Sku.specKey` 上加了 `@@unique([productId, specKey])` 从库层防重复组合。

> ⚠️ 已踩过的坑：曾有 mock 数据手写 `specKey` 字面量，与函数的排序规则不一致
> （`切` < `尺`，所以 `切片` 排在 `尺寸` 前），导致前端**永远命中不到任何 SKU**、
> 所有规格选项被误判为不可用。**specKey 必须生成，禁止手写。**

### 4.3 金额一律 `Int` 存「分」

禁用 `Float`。前端只做 `÷100` 展示，计算全在服务端。
所有 Server Action 的入参**不接收任何价格字段**，价格一律由服务端查 SKU 得到。

### 4.4 Next 16 Cache Components 的写法约束

项目默认开启 `cacheComponents: true` + `partialPrefetching: true`。
这会让「请求时才有的数据」必须显式处理，否则**构建直接失败**：

| 数据类型 | 正确写法 |
|---|---|
| `params` / `searchParams` | 包进 `<Suspense>`，在其内部 `await` |
| `cookies()` / `headers()` | 同上 |
| `usePathname()` 等客户端 hook | 同上（见 `app/layout.tsx` 的 `BottomTabBar`） |
| 跨用户共享且可缓存的数据 | `"use cache"` + `cacheLife()` |

页面的「静态外壳」（导航、骨架、公告）会预渲染进 HTML，动态部分流式补齐。
构建输出里的 `◐` 就是这个含义。

> **已知取舍**：在 Suspense 内调用 `notFound()` 时，响应头已发出，
> HTTP 状态码仍是 `200`（Next.js 会注入 `noindex`）。若要真正的 404 状态码，
> 需在 Proxy（原 middleware）里提前判断 slug。当前不引入该中间件，记入阶段四清单。

### 4.5 金额与订单快照

`CartItem` 与 `OrderItem` 都存 `priceSnapshotCents / nameSnapshot / specTextSnapshot / imageSnapshot`。
商品改价不影响购物车里已加的商品，更不影响历史订单。
`Order.requestId` 唯一索引 = 幂等锁。

---

## 5. 当前阶段状态

### 已完成（阶段三 / P0）

- [x] 首页服务端读已上架商品，分类筛选走 `?category=`，DRAFT 商品前台不可达
- [x] 起售价 = 最低 ACTIVE SKU 价（实时聚合，不依赖冗余字段）
- [x] 商品详情：规格组由 SKU `optionValues` 反推，`specKey` O(1) 命中唯一 SKU
- [x] 库存 0 的组合置灰；整品售罄显示遮罩
- [x] 加入购物车写入完整快照：价格 / 名称 / 规格文字 / 图片
- [x] 购物车身份：游客 cookie `sid`，登录 `userId`（`lib/viewer.ts` 统一解析）
- [x] 购物车数量增减（夹紧到 SKU 库存）、删除、乐观更新 + 失败回滚
- [x] 结算页服务端重读并用 **SKU 当前价**重算金额
- [x] 事务下单：幂等 → 条件扣库存 → 占时段 → 取货号 → 建单 → 清购物车
- [x] 订单列表 / 详情，归属校验（他人订单 → 404，不泄露存在性）
- [x] 游客查单：订单号 + 手机号双因子

### 验证结果（可复跑）

| 脚本 | 覆盖 | 结果 |
|---|---|---|
| `npx tsx scripts/verify-sku.ts` | specKey 归一化、可选性、唯一命中 | 15/15 通过 |
| `node scripts/e2e-order.mjs` | 加购→结算→下单→订单详情→越权→查单全链路 | **17/17 通过** |
| `node scripts/e2e-isolation.mjs` | 独立浏览器上下文越权隔离 | 6/6 通过 |
| `npx tsx scripts/verify-orders.ts` | 快照完整性、金额自洽、取货号、幂等索引、改价隔离 | 8/8 通过 |
| `npx tsx scripts/verify-oversell.ts` | 20 并发抢 5 件库存 | 4/4 通过（恰好 5 成功，库存不为负） |

> 注：`e2e-order.mjs` 早期用 CDP `/json/new` 建页面，多个"新页面"共享 cookie jar
> 导致越权项假失败。已改为 `Target.createBrowserContext` 独立上下文，现全部通过。

### 未做（P1）

- [ ] `/admin` 服务端鉴权 + 商品/SKU 管理（当前 `/admin` 是空壳且**无鉴权**）
- [ ] 支付宝网页支付
- [ ] 订单通知（邮件/webhook）
- [ ] 登录体系接入（NextAuth 已装好，`getViewer()` 预留 userId 分支）
- [ ] 游客购物车登录后合并到账号（`mergeGuestCart` 未实现）
