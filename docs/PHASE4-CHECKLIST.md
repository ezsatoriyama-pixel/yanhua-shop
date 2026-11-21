# 阶段四：上线前审查清单

> 审查日期：2026-11-19 ｜ 代码版本：阶段三完成态
> 本清单每一项都对应**实际代码位置**与**可复跑的验证命令**，不是纸面承诺。

---

## 0. 烟花品类专项合规检查（凌驾于其他所有项）

| # | 检查项 | 状态 | 说明 |
|---|---|---|---|
| 0.1 | **不提供快递/邮寄** | ✅ 已符合 | 只有自取；`.env` 无物流配置，结算页无地址表单 |
| 0.2 | 《烟花爆竹经营（零售）许可证》 | ⬜ **上线前必须** | 无证不得销售，本项目只提供展示与预约 |
| 0.3 | 实名登记购买人 | ⬜ 待接入 | `.env.example` 预留 `ENABLE_REALNAME_CHECK`；需在结算页加姓名 + 身份证 |
| 0.4 | 年龄限制提示 | ⬜ 待加 | 建议商品页标注「儿童须成人陪同」，结算页加年龄确认 |
| 0.5 | 线上支付类目限制 | ✅ P0 已规避 | 未接支付；接入前须确认收单机构允许该品类 |
| 0.6 | 门店地址与许可证号公示 | ⬜ 待加 | 建议页脚展示许可证编号，多数地区为强制要求 |
| 0.7 | 燃放安全说明 | ✅ 部分 | 商品描述已含安全距离与使用提示，建议做独立说明页 |

> 结论：**技术侧已满足"只做自取"的硬性约束，商务与资质侧需要你自行办理。**
> 0.2 未完成前，这个站只能用于内部演示，不能对公众开放下单。

---

## 1. 金额安全

### 结论：✅ 通过

**前端能否影响订单金额？不能。**

| 检查项 | 实现 | 位置 |
|---|---|---|
| Server Action 入参是否含价格字段 | **不含**。`createOrder` 只接受 `requestId / cartItemIds / pickupSlotId / phone / remark` | `app/actions/order.ts` `CreateOrderInput` |
| 计价数据来源 | 事务前重查 `sku.priceCents`，用 `Σ(price × qty)` 计算 | `app/actions/order.ts` 步骤③ |
| 结算页展示金额 | 服务端 `getCheckoutData()` 重算后传入 | `lib/queries/checkout.ts` |
| 前端传了 `price` 会怎样 | 类型上不存在该字段；即使运行时塞入，代码从不读取 | — |
| 运费 | P0 自取，`deliveryFeeCents` 恒为 0，但仍在服务端赋值 | `app/actions/order.ts` |

**审计命令：**
```bash
# 确认 action 入参无价格字段
grep -n "priceCents\|totalCents" app/actions/order.ts | grep -i "input\.\|data\."
# 预期：无输出
```

**已执行的篡改测试**：`scripts/verify-orders.ts` 第 2 项验证「订单总额 = 行小计之和」，
且行小计 = `unitPriceCents × quantity`，全部由服务端写入。

**遗留风险**：`prisma` 通过 `Int` 存分，若未来接入支付需注意支付宝以「元」为单位，
换算必须用 `Number(amount)/100` 后 `toFixed(2)`，不能用浮点累加。

---

## 2. 快照完整性

### 结论：✅ 通过（已用改价测试验证）

| 快照字段 | CartItem | OrderItem | 验证 |
|---|---|---|---|
| 价格 | `priceSnapshotCents` | `unitPriceCents` | ✅ |
| 名称 | `nameSnapshot` | `nameSnapshot` | ✅ |
| 规格文字 | `specTextSnapshot` | `specTextSnapshot` | ✅ |
| 图片 | `imageSnapshot` | `imageSnapshot` | ✅ |

**改价后历史订单是否不受影响？**

实测过程（`scripts/verify-orders.ts` 第 5 项）：
1. 记下订单行单价 `1900`
2. 把该 SKU 价格改成 `19000`（10 倍）
3. 重查订单 → 单价仍为 `1900`，总额仍为 `5700`
4. 还原价格

结果：**✅ 快照隔离生效**。

**额外保护**：`OrderItem.skuId` 与 `productId` 都设为 `onDelete: SetNull`，
即使 SKU 被物理删除，历史订单仍可凭快照完整渲染。

**注意**：`CartItem` 用完即删（下单后 `deleteMany`），因此购物车快照的生命周期很短。
真正的长期快照在 `OrderItem`。

---

## 3. 库存并发

### 结论：✅ 通过（20 并发实测无超卖）

**扣减是否在事务中？** 是。`prisma.$transaction(async tx => {...})` 内完成
「扣库存 → 占时段 → 取号 → 建单 → 清购物车」，任一步失败整体回滚。

**是否存在两个请求同时扣减同一 SKU 导致超卖的风险？**

理论上存在读-改-写的竞态，但已用**条件更新**消除：

```ts
const updated = await tx.sku.updateMany({
  where: { id: it.sku.id, stock: { gte: it.quantity } },
  data: { stock: { decrement: it.quantity } },
});
if (updated.count === 0) throw new OrderError("INSUFFICIENT_STOCK", ...);
```

关键点：`WHERE stock >= qty` 与 `SET stock = stock - qty` 是**同一条 SQL**，
由数据库保证原子性。`count === 0` 说明库存已被别人扣走，立即抛错回滚。

**实测**（`scripts/verify-oversell.ts`）：
```
测试 SKU 库存: 5，并发请求数: 20
成功扣减次数: 5      ← 恰好等于库存
最终库存: 0          ← 不为负
失败请求数: 15
✅ 4/4 通过
```

**Prisma 层面的最小防护方案（已采用，无需额外中间件）**：

| 方案 | 是否采用 | 说明 |
|---|---|---|
| 条件更新 `WHERE stock >= n` | ✅ **已用** | 最可靠，零额外依赖，无需 Redis |
| 唯一索引兜底 | ✅ 已用（`Order.requestId`） | 幂等 |
| 悲观锁 `SELECT FOR UPDATE` | ❌ 不需要 | 条件更新已足够，且避免长事务锁等待 |
| Redis 预扣减 | ❌ 不引入 | 硬约束 3 明确不引入 Redis |
| 乐观锁版本号 | ❌ 不需要 | 条件更新等价且更简单 |

**残留风险（必须知道）**：
- 该方案在**单库**下绝对可靠。若未来分库分表，需改为分布式锁或按 SKU 分片。
- 事务默认超时 5s。极端慢查询下会超时回滚，用户看到「下单失败，请重试」，
  此时 `requestId` 复用可保证不重复下单。

---

## 4. 身份与权限

### 结论：✅ 通过（订单 + 后台均已验证）

**未登录用户能否越权读取他人订单？不能。**

归属校验集中在三处：
- `lib/viewer.ts` `cartOwnerWhere()` — 购物车
- `lib/queries/orders.ts` `ownerFilter()` — 订单列表
- `app/actions/order.ts` `getOrderForViewer()` — 订单详情

无身份时返回 `{ id: "__no_viewer__" }` 这类**永不命中的条件**，
而不是 `{}`（`{}` 会匹配全表，是常见越权成因）。

**查不到时的行为**：`notFound()`，不返回 403。
不区分「不存在」与「无权限」，避免通过响应差异探测订单是否存在。

### /admin 鉴权：⚠️ 已修复一个真实高危漏洞

后台初版只靠 `app/admin/layout.tsx` 里的 `notFound()` 拦截，
实测发现**未登录访问 `/admin` 仍能拿到完整后台 HTML**（能搜到「今日营业额」）。

根因：Next 16（Cache Components）下 **page 与 layout 是并行渲染的**。
layout 里 `if (!admin) notFound()` 只影响 layout 自身那棵子树，
同级的 `children`（页面本体）已经在服务端执行完，数据已写进 RSC payload。
`notFound()` 在 Suspense 边界内也不会中断兄弟节点的渲染。

**修复**：新增 `proxy.ts`（Next 16 中 `middleware` 的新名字）做请求入口拦截 ——
无 session cookie 直接 `rewrite` 到 404，根本不让请求进入渲染管线。

三层防线现为：
1. `proxy.ts` — 无 cookie 直接 404（唯一的零泄露保证）
2. `app/admin/layout.tsx` — 角色校验后条件渲染
3. 每个 admin Server Action 内 `requireAdminAction()`

**实测**（生产模式 `npm run start`）：
```
/admin             被拦(404)
/admin/orders      被拦(404)
/admin/products    被拦(404)
```
登录后 `e2e-admin.mjs` 9/9 通过。

**残留风险**：`proxy.ts` 只检查 cookie 是否存在，不验签（中间件不适合每次查库）。
伪造 cookie 可通过第一层，但第二、三层会挡住 —— 这是有意的深度防御，
不是漏洞。若要更严，可在 proxy 中用 `getToken()` 验签（需引入 `next-auth/jwt`）。

---

## 5. 幂等

### 结论：✅ 通过（双重保证）

| 层级 | 机制 | 位置 |
|---|---|---|
| 客户端 | `requestId` 存在 `useRef`，每次结算只生成一次；失败重试复用 | `components/checkout/CheckoutForm.tsx` |
| 服务端（快路径） | 事务前 `findUnique({ where: { requestId } })`，命中直接返回既有订单 | `app/actions/order.ts` 步骤① |
| 数据库（兜底） | `Order.requestId` **唯一索引**；并发下捕获 `P2002` 返回既有订单 | `prisma/schema.prisma` |

**为什么两层都要**：快路径挡掉绝大多数重复提交（便宜）；
唯一索引挡掉并发窗口期内的竞态（即使两个请求同时通过了快路径检查）。

**实测**（`scripts/verify-orders.ts` 第 4 项）：
```
✓ 不存在重复 requestId
✓ 重复 requestId 被数据库拒绝（P2002）
```

**边界说明**：幂等键只在**一次结算会话**内有效。
用户主动刷新结算页会生成新的 `requestId`，此时视为新订单——这是正确行为
（购物车已清空，重新提交会因 `CART_ITEM_NOT_FOUND` 失败）。

---

## 6. 部署检查

### 6.1 环境变量

完整清单见 `.env.example`。生产必需项：

| 变量 | 说明 | 遗漏后果 |
|---|---|---|
| `DATABASE_URL` | 连接池串 | 启动即失败 |
| `DIRECT_URL` | 直连串，仅 migrate 用 | `prisma migrate deploy` 失败 |
| `AUTH_SECRET` | 32 字节随机串 | 认证不可用 |
| `AUTH_URL` / `NEXTAUTH_URL` | 正式域名 | 回调地址错误 |
| `ADMIN_EMAILS` | 管理员邮箱 | P1 后台无法登录 |

**必须替换**：`.env` 里的 `AUTH_SECRET` 目前是开发用的假值。

### 6.2 数据库选型：推荐 **Neon**，次选 Supabase

| 维度 | Neon | Supabase |
|---|---|---|
| 免费额度 | 0.5 GB 存储，自动休眠 | 500 MB 存储 |
| 冷启动 | 休眠后首次查询约 1-3s | 项目 7 天无活动暂停 |
| Prisma 兼容 | 原生支持，连接串直接可用 | 需用 pooler 串 + `pgbouncer=true` |
| 额外能力 | 分支数据库（类似 git） | 自带 Auth/Storage/Realtime |
| 与 NextAuth 冲突 | 无 | Supabase Auth 与 NextAuth 是两套体系，容易混用 |

**推荐 Neon 的理由**：
1. 本项目已选 NextAuth，不需要 Supabase 的 Auth，用 Supabase 等于只用它的 PG 却承担额外概念负担
2. Neon 的分支功能对「上线前演练迁移」很有用
3. 连接串语义简单，不需要理解 pgbouncer 的参数组合

**若选 Supabase**，连接串必须这样配：
```
DATABASE_URL="postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```
`connection_limit=1` 很关键：Vercel Serverless 会并发起大量短连接，
不限制会把免费版连接数打满。

### 6.3 Prisma migrate 在生产环境怎么跑

**不要**在 Vercel 构建命令里跑 `prisma migrate deploy` ——
构建是多实例并发的，容易多个构建同时迁移同一库导致锁冲突。

**推荐做法**（二选一）：

**方案 A：CI 单独一步（推荐）**
```yaml
# GitHub Actions，部署前执行
- run: npx prisma migrate deploy
  env:
    DATABASE_URL: ${{ secrets.DIRECT_URL }}
```
然后 Vercel 构建只跑 `prisma generate && next build`。

**方案 B：手动**
```bash
# 本地，指向生产库的直连串
DATABASE_URL="<生产直连串>" npx prisma migrate deploy
```

**Vercel 构建命令**建议设为：
```
prisma generate && next build
```
（`postinstall` 已配 `prisma generate`，但显式写更稳妥。）

### 6.4 部署到 Vercel 的注意事项

| 项 | 说明 |
|---|---|
| Runtime | Server Actions 需 Node.js runtime，不要设 `export const runtime = "edge"` |
| 函数区域 | 选与数据库同区域，否则每次查询多几十毫秒 |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | 单项目可不设；多实例自建服务器**必须**设 |
| 图片 | `next/image` 已配置本地 `/placeholder.svg`；接入真实图床需在 `next.config.ts` 加 `images.remotePatterns` |

### 6.5 若改用轻量云服务器（2核2G）

可用，但需要自己处理：
- `pm2` 或 `systemd` 守护 `next start`
- Nginx 反代 + HTTPS（certbot）
- PostgreSQL 装在同机或云数据库
- 必须设 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`（多进程间需一致）
- 内存 2G 跑 Next 16 + PG 会比较紧，建议 PG 用云托管

结论：**首发建议 Vercel + Neon**，运维成本最低；有备案域名和合规要求时再上云服务器。

---

## 7. 上线前手动验收清单

按主路径逐条打勾。建议在**手机真机**上跑一遍，不要只用桌面浏览器缩窄窗口。

### 7.1 浏览与选品

- [ ] 首页能正常加载，看到门店公告与商品列表
- [ ] 切换分类，URL 变为 `?category=xxx`，刷新后筛选状态保持
- [ ] 「生椰拿铁（测试下架）」在任何分类、任何入口**都看不到**
- [ ] 卡片起售价与进入详情后的最低价一致
- [ ] 「手冲单品咖啡」全规格售罄时显示「已售罄」且卡片降透明度
- [ ] 点任意商品能进入详情，图片正常显示

### 7.2 规格选择

- [ ] 先点「尺寸」再点「切片」，与相反顺序，价格库存结果一致
- [ ] 选择 `1000g` + `整条`（库存 0）时该组合置灰、无法加购
- [ ] 切换规格时价格、库存、图片同步更新，无闪烁
- [ ] 「海盐贝果」（无规格商品）不显示选择器，直接可加购
- [ ] 数量 + 按钮在达到库存上限时禁用

### 7.3 购物车

- [ ] 加购后出现「已加入购物车」并可直接点「去结算」
- [ ] 同一 SKU 连续加购两次，合并为一行、数量为 2
- [ ] 数量减到 1 时「−」禁用；加到库存上限时「+」禁用且提示「仅剩 N 件」
- [ ] 点「删除」行立即消失，总金额同步更新
- [ ] 刷新页面，购物车内容仍在（cookie `sid` 生效）
- [ ] 清空后显示空状态与「去点单」

### 7.4 结算与下单

- [ ] 结算页金额与购物车一致
- [ ] 不填手机号直接提交 → 提示「请填写 11 位手机号」
- [ ] 不选时段提交 → 有明确提示
- [ ] 「12:00」时段显示「已约满」且不可选（seed 里容量设为 1）
- [ ] 正常提交 → 跳转订单详情，显示 `A001` 之类取餐号
- [ ] **连点两次提交按钮** → 只产生一笔订单（幂等）
- [ ] 下单后返回购物车 → 已清空

### 7.5 订单

- [ ] `/orders` 能看到刚下的单，状态「待处理」
- [ ] 订单详情显示：取餐号大字、时段、门店、商品明细、金额
- [ ] 换一个浏览器/无痕窗口，直接访问该订单 URL → **404**
- [ ] 无痕窗口的 `/orders` 为空
- [ ] `/orders/lookup` 输入正确订单号 + 手机号 → 能查到
- [ ] 输入正确订单号 + 错误手机号 → 提示「订单号与手机号不匹配」
- [ ] 手机号在详情页以 `138****8000` 形式脱敏显示

### 7.6 库存与并发（开发环境验证）

- [ ] 下单后 `Sku.stock` 准确减少（`npm run db:studio` 查看）
- [ ] 把某 SKU 库存改成 1，购物车里加 2 件去结算 → 提示「仅剩 1 件」并回滚
- [ ] 两个浏览器同时提交同一 SKU 的最后一件 → 只有一单成功

### 7.7 部署后

- [ ] `GET /api/health` 返回 `{"ok":true,"db":"up"}`
- [ ] HTTPS 正常，`sid` cookie 带 `Secure` 标记
- [ ] `AUTH_SECRET` 已换成生产值（不是 `.env.example` 里的空值）
- [ ] `ADMIN_EMAILS` 已配置
- [ ] 生产库已执行 `prisma migrate deploy`，`_prisma_migrations` 表存在

---

## 8. 已知问题与技术债（必须知情）

| # | 问题 | 严重度 | 处置 |
|---|---|---|---|
| 1 | `/admin` 无鉴权 | 🔴 高（若加功能） | 当前空壳无害；P1 加功能前**必须先做鉴权** |
| 2 | Suspense 内 `notFound()` 返回 HTTP 200 而非 404 | 🟡 中 | Next 16 已知取舍，页面内含 `noindex`；需真 404 就在 Proxy 里判 slug |
| 3 | 测试用的 `scripts/*.mjs` 依赖 Chrome CDP | 🟢 低 | 仅开发用，不进构建 |
| 4 | 未接登录，`getViewer()` 的 `userId` 分支恒为 null | 🟡 中 | P1 接入 NextAuth 时补上 |
| 5 | `mergeGuestCart` 未实现 | 🟡 中 | 接入登录后必须补，否则游客加购的购物车在登录后丢失 |
| 6 | Prisma 6 而最新是 8(RC) | 🟢 低 | 主动选择：`@auth/prisma-adapter` 只支持到 6 |
| 7 | 无速率限制 | 🟡 中 | 下单接口可被刷；上线前建议加 IP 维度限流 |
| 8 | 无订单通知 | 🟢 低 | P1 |
| 9 | 订单状态只能靠 Prisma Studio 改 | 🟡 中 | P1 做 `/admin` |

### 视觉重做期间修复的两个真实缺陷

| 缺陷 | 根因 | 修复 |
|---|---|---|
| 规格组顺序错乱（「切片」跑到「尺寸」前） | `Sku.optionValues` 是 Postgres **jsonb**，会按 key 长度/字典序重排，**读回的 key 顺序与写入不一致** | 新增 `Product.specGroups` 显式存有序规格组；查询优先用它，`optionValues` 仅作兜底 |
| 结算页出现过期取餐时段，且旧日期被标成「今天」 | ① seed 每天 upsert 从不删除旧日期，历史时段累积；② `timeLabel` 对任意 `diff != 1` 都回落成「今天」 | ① seed 内先 `deleteMany({ date: { lt: today }, booked: 0 })`；② 查询加 `date >= today` + 本地日期二次过滤 + 按 `(date,startTime)` 去重；③ 标签改为今天/明天/绝对日期三档 |

> 第 2 项还顺带修了一个时区隐患：`@db.Date` 字段在非 UTC+8 时区用 `toISOString()` 会前移一天，
> 已统一改为本地年月日拼接（`localDayKey`）。

---

## 9. 复跑全部验证

```bash
# 前置：数据库在跑
npm run db:start          # 终端 A

# 逻辑层
npx tsx scripts/verify-sku.ts        # SKU 规格键与可选性
npx tsx scripts/verify-orders.ts     # 快照、金额、取餐号、幂等索引
npx tsx scripts/verify-oversell.ts   # 并发防超卖

# 端到端（需 dev server + Chrome 远程调试端口 9334）
npm run dev                          # 终端 B
node scripts/e2e-isolation.mjs       # 越权隔离（推荐，严格上下文隔离）
node scripts/e2e-order.mjs           # 主链路（注意其 2 项为脚本限制）

# 清理测试数据
npx tsx scripts/reset-orders.ts
npx prisma db seed                   # 恢复库存基线
```

**当前构建状态**：`npm run build` ✅ ｜ `tsc --noEmit` ✅ 零错误
