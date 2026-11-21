# 部署到 Vercel + Neon（永久在线、地址固定、关机不影响）

这份指南解决三个限制：

| 原有限制 | 部署后 |
|---|---|
| 地址每次重启就变 | ✅ 固定为 `https://你的项目.vercel.app` |
| 电脑关机网站就没了 | ✅ 跑在 Vercel 云端，7×24 在线 |
| 靠临时隧道进程 | ✅ 无进程依赖，自动伸缩 |

**总耗时约 20 分钟**，无需信用卡。免费额度对一个小店完全够用。

---

## 准备：你需要三个免费账号

1. **GitHub**：存代码（https://github.com/signup）
2. **Neon**：PostgreSQL 数据库（https://neon.tech，用 GitHub 登录最快）
3. **Vercel**：托管网站（https://vercel.com/signup，用 GitHub 登录最快）

> 三个都能用 GitHub 账号一键登录，实际只需注册一个 GitHub。

---

## 第一步：把代码传到 GitHub

我这里已经把本地 git 仓库初始化并提交好了（116 个文件，`.env` 等敏感文件已排除）。

在**你自己电脑**上执行（把 `<你的用户名>` 换成你的 GitHub 用户名）：

1. 打开 https://github.com/new，创建仓库：
   - Repository name: `yanhua-shop`
   - 选 **Private**（私有，代码不公开）
   - **不要**勾选 "Add a README file"（会冲突）
   - 点 Create repository

2. 回到项目目录执行：

```bash
cd "C:\Users\83668\Documents\deepseek-harness\default-workspace\shop"
git branch -M main
git remote add origin https://github.com/<你的用户名>/yanhua-shop.git
git push -u origin main
```

推送时会要求登录，用 GitHub 的 **Personal Access Token** 当密码（不是账号密码）：
- 生成地址：https://github.com/settings/tokens/new
- 勾选 `repo` 权限，有效期选 90 天
- 复制生成的 token 粘贴到密码位置

---

## 第二步：创建 Neon 数据库

1. 打开 https://console.neon.tech，用 GitHub 登录
2. 点 **New Project**
   - Name: `yanhua-shop`
   - Postgres version: 默认即可（16 或 17）
   - Region: **Asia Pacific (Singapore)** ← 离国内最近，延迟最低
3. 创建后进入 **Connection Details**，复制两个连接串：

**Pooled connection**（用于 `DATABASE_URL`）：
```
postgresql://neondb_owner:xxxxx@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```
特征：主机名里带 `-pooler`

**Direct connection**（用于 `DIRECT_URL`，执行迁移）：
```
postgresql://neondb_owner:xxxxx@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```
特征：主机名里**没有** `-pooler`

> ⚠️ 两个串都要留着。Vercel 的 Serverless 函数会并发建很多连接，
> 必须用 pooled 串，否则会打满 Neon 的连接数上限。

---

## 第三步：部署到 Vercel

1. 打开 https://vercel.com/new
2. 选 **Import Git Repository**，授权后选中 `yanhua-shop`
3. Framework Preset 会自动识别为 **Next.js**，保持默认
4. 展开 **Environment Variables**，逐条添加：

| 变量名 | 值 | 说明 |
|---|---|---|
| `DATABASE_URL` | Neon 的 **pooled** 连接串 | 应用运行时用 |
| `DIRECT_URL` | Neon 的 **direct** 连接串 | 仅迁移用 |
| `AUTH_SECRET` | 见下方生成命令 | 会话加密密钥 |
| `AUTH_TRUST_HOST` | `true` | 允许 Vercel 域名 |
| `ADMIN_EMAILS` | `1232456` | 管理员白名单 |
| `NEXT_PUBLIC_STORE_NAME` | `长夜烟花` | 门店名 |
| `BLOB_READ_WRITE_TOKEN` | 先留空，第四步再填 | 图片存储 |

生成 `AUTH_SECRET`（在你电脑上跑）：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> ⚠️ **不要**设置 `AUTH_URL`。Vercel 上留空，Auth.js 会自动用当前域名，
> 写死反而会导致登录失败。

5. 点 **Deploy**，等 2-3 分钟构建完成

---

## 第四步：开启图片存储（Vercel Blob）

Vercel 的文件系统是只读的，商品图必须存到 Blob。

1. 进入 Vercel 项目 → **Storage** 标签
2. 选 **Blob** → Create
   - Name: `yanhua-shop-images`
   - Access: **Public**
3. 创建后会生成 `BLOB_READ_WRITE_TOKEN`
4. 回到 **Settings → Environment Variables**，确认该变量已自动注入（通常会）
   - 如果没有，手动添加：从 Storage 页面复制 token 值

5. **重新部署**（Deployments → 最新一条 → ⋯ → Redeploy），让新变量生效

免费额度：1GB 存储 + 每月 10GB 流量，小店的商品图用几年都够。

---

## 第五步：初始化数据库

部署成功后，数据库还是空的，需要建表 + 灌种子数据。在**你电脑上**执行：

```bash
cd "C:\Users\83668\Documents\deepseek-harness\default-workspace\shop"

# 临时指向 Neon（用 direct 串，迁移必须直连）
$env:DATABASE_URL="<你的 Neon direct 连接串>"
$env:DIRECT_URL="<你的 Neon direct 连接串>"

npx prisma migrate deploy
npx prisma db seed
```

完成后打开 `https://你的项目.vercel.app/api/health`，应返回：
```json
{"ok":true,"db":"up","timestamp":"..."}
```

---

## 第六步：改掉默认密码

种子数据里的管理员是 `1232456` / `123321`，**必须改**。

```bash
$env:DATABASE_URL="<Neon direct 串>"
npx tsx scripts/set-admin.ts <新账号> <新密码>
```

然后用新账号登录 `https://你的项目.vercel.app/login` 验证。

---

## 部署后的检查清单

按顺序验证，每一条都对应一个真实故障点：

| # | 检查 | 预期 | 失败原因 |
|---|---|---|---|
| 1 | `/api/health` | `{"ok":true,"db":"up"}` | 连接串错误或迁移未执行 |
| 2 | 首页能看到商品 | 正常渲染 | 种子数据未灌 |
| 3 | 商品图显示 | 图片正常 | Blob 未配置 / remotePatterns 未生效 |
| 4 | 未登录访问 `/admin` | 404 | proxy.ts 未生效 |
| 5 | 用新账号登录 | 进入后台 | `AUTH_SECRET` 或 `AUTH_TRUST_HOST` 未设 |
| 6 | 后台上传一张商品图 | 成功且能显示 | `BLOB_READ_WRITE_TOKEN` 缺失 |
| 7 | 前台完整下一单 | 拿到取货号 | 时段数据缺失（检查 seed 是否跑了） |
| 8 | 后台改价 → 前台刷新 | 价格更新 | 缓存未失效（通常是正常的，等几秒） |

---

## 常见问题

**构建失败：`Prisma Client not generated`**
`vercel.json` 里已配置 `buildCommand: "prisma generate && next build"`，如果仍失败，在 Vercel 项目设置里把 Build Command 手动改成这一条。

**登录后立刻跳回登录页**
99% 是 `AUTH_SECRET` 没设或换了值。换 `AUTH_SECRET` 会让所有已登录用户失效，属于正常现象。

**图片上传报错**
检查 `BLOB_READ_WRITE_TOKEN` 是否在当前环境（Production / Preview）都配置了。
改完环境变量**必须 Redeploy** 才生效。

**数据库连接超时**
确认 `DATABASE_URL` 用的是 `-pooler` 的连接串。用直连串在 Serverless 下会很快耗尽连接。

**中文显示成方块**
构建环境缺少中文字体。本项目用系统字体栈，一般不会出现；若出现，检查是否有自定义字体配置。

---

## 改代码后怎么更新

```bash
git add -A
git commit -m "描述你的改动"
git push
```

Vercel 会自动检测到 push 并重新部署，约 2 分钟生效。无需手动操作。

---

## 成本

| 服务 | 免费额度 | 够用吗 |
|---|---|---|
| Vercel Hobby | 100GB 带宽/月 | 足够 |
| Neon Free | 0.5GB 存储 | 足够（几千订单） |
| Vercel Blob | 1GB + 10GB 流量/月 | 足够 |

超过免费额度才需要付费。按一个小店的量，几年内不会碰到。

---

## 如果不想用 Vercel

`railway.app` / `render.com` 也能跑 Next.js，思路一样：连 GitHub → 配环境变量 → 部署。
但它们的免费额度更紧，Vercel 对 Next.js 的支持最好。
