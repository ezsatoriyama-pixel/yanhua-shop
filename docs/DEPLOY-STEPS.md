# 部署操作单（照着做，约 15 分钟）

> 生成时间：2026-11-21
> 本地代码已全部准备完毕，共 118 个文件已提交到 git，分支 `main`

---

## 当前状态

| 项 | 状态 |
|---|---|
| 代码 | ✅ 已提交到本地 git（3 次提交，分支 `main`） |
| 敏感文件 | ✅ `.env` / `.pgdata` / `cloudflared.exe` / `*.log` 已排除 |
| 生产构建 | ✅ 用假数据库连接串测试通过，不依赖本地环境 |
| 图片存储 | ✅ 已改为 Vercel Blob 双模式 |
| 图片域名白名单 | ✅ 已加 `*.public.blob.vercel-storage.com` |
| 部署配置 | ✅ `vercel.json` 已就绪 |

**你只剩三步：推代码 → 建数据库 → Vercel 导入。**

---

## 第一步：推到 GitHub

### 1.1 建仓库

打开 https://github.com/new

| 字段 | 填什么 |
|---|---|
| Repository name | `yanhua-shop` |
| Visibility | **Private**（私有） |
| Add a README file | **不要勾** |
| .gitignore / license | **都不要选** |

点 **Create repository**。

### 1.2 拿 Token

打开 https://github.com/settings/tokens/new

| 字段 | 填什么 |
|---|---|
| Note | `yanhua-deploy` |
| Expiration | 90 days |
| Scopes | 只勾 **`repo`**（整块） |

点 **Generate token**，**立刻复制**（离开页面就看不到了）。

### 1.3 推送

在项目目录执行（把 `<你的用户名>` 换成你的 GitHub 用户名）：

```powershell
cd "C:\Users\83668\Documents\deepseek-harness\default-workspace\shop"
git remote add origin https://github.com/<你的用户名>/yanhua-shop.git
git push -u origin main
```

推送时会提示输入：
- **Username**: 你的 GitHub 用户名
- **Password**: 粘贴刚才的 token（不是账号密码）

看到 `main -> main` 就成功了。

> 如果提示 `remote origin already exists`，先执行 `git remote remove origin` 再来一次。

---

## 第二步：建 Neon 数据库

### 2.1 创建项目

打开 https://console.neon.tech ，用 GitHub 账号登录（最快）。

点 **New Project**：

| 字段 | 填什么 |
|---|---|
| Project name | `yanhua-shop` |
| Postgres version | 默认即可 |
| Region | **Asia Pacific (Singapore)** ← 离国内最近 |

点 **Create**。

### 2.2 复制两个连接串

创建后页面会显示 **Connection Details**。你需要两个串：

**① Pooled connection**（给 `DATABASE_URL`）

格式特征：主机名里带 `-pooler`
```
postgresql://neondb_owner:AbC123@ep-cool-1234-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

**② Direct connection**（给 `DIRECT_URL`）

点 "Connection string" 旁边的下拉，切到 **Direct**。格式特征：主机名**不含** `-pooler`
```
postgresql://neondb_owner:AbC123@ep-cool-1234.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

> ⚠️ 两个串都要留着。Vercel 的 Serverless 会并发建大量连接，
> 用直连串会很快打满 Neon 的连接上限，网站直接 500。

### 2.3 生成本地密钥

在你电脑上执行，把结果复制下来待会儿用：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 第三步：Vercel 导入部署

### 3.1 导入仓库

打开 https://vercel.com/new ，用 GitHub 登录。

授权后找到 `yanhua-shop`，点 **Import**。

Framework Preset 会自动识别为 **Next.js**，**不要改**构建命令（`vercel.json` 已配好）。

### 3.2 填环境变量

展开 **Environment Variables**，逐条添加（注意大小写）：

| Key | Value | 从哪来 |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** 连接串 | 第二步 2.2 ① |
| `DIRECT_URL` | Neon **direct** 连接串 | 第二步 2.2 ② |
| `AUTH_SECRET` | 第二步 2.3 生成的值 | — |
| `AUTH_TRUST_HOST` | `true` | 手填 |
| `ADMIN_EMAILS` | `1232456` | 你的管理员账号 |
| `NEXT_PUBLIC_STORE_NAME` | `长夜烟花` | 门店名 |

> ⚠️ **绝对不要**加 `AUTH_URL`。Vercel 上留空，Auth.js 会自动用当前域名；
> 写死会导致登录后立刻被踢回登录页。

`BLOB_READ_WRITE_TOKEN` 先留空，第四步再补。

### 3.3 部署

点 **Deploy**，等 2-3 分钟。

成功后会给你一个地址，形如：
```
https://yanhua-shop-xxxx.vercel.app
```

**先别急着打开**，数据库还是空的，下一步先建表。

---

## 第四步：初始化数据库

在你电脑上执行（**用 Neon 的 direct 串**，迁移必须直连）：

```powershell
cd "C:\Users\83668\Documents\deepseek-harness\default-workspace\shop"

$env:DATABASE_URL="<Neon direct 连接串>"
$env:DIRECT_URL="<Neon direct 连接串>"

npx prisma migrate deploy
npx prisma db seed
```

`migrate deploy` 会建所有表，`db seed` 会灌入：
- 3 个分类、6 个商品（含 1 个 DRAFT 测试商品）、14 个 SKU
- 12 个取货时段
- 管理员账号 `1232456` / `123321`

### 验证

浏览器打开：
```
https://你的地址/api/health
```

应返回：
```json
{"ok":true,"db":"up","timestamp":"..."}
```

如果是 `{"ok":false,"db":"down"}`，说明连接串有问题，检查是不是用了 pooled 串在跑 migrate。

---

## 第五步：开启图片存储

Vercel 的文件系统是只读的，商品图必须存 Blob。

1. Vercel 项目页 → 顶部 **Storage** 标签
2. 点 **Create** → 选 **Blob**
3. Name 填 `yanhua-shop-images`，Access 选 **Public**
4. 创建后会自动生成 `BLOB_READ_WRITE_TOKEN` 并注入项目
5. 回到 **Deployments** → 最新一条 → ⋯ → **Redeploy**

> 改环境变量**必须 Redeploy 才生效**，这一步经常被漏。

免费额度：1GB 存储 + 10GB 流量/月，小店的商品图几年都用不完。

---

## 第六步：改掉默认密码

种子数据里的密码是公开的，**上线前必须改**：

```powershell
cd "C:\Users\83668\Documents\deepseek-harness\default-workspace\shop"
$env:DATABASE_URL="<Neon direct 连接串>"
npx tsx scripts/set-admin.ts <新账号> <新密码>
```

然后登录 `https://你的地址/login` 验证。

别忘了同步更新 Vercel 里的 `ADMIN_EMAILS` 为新账号。

---

## 验收清单

按顺序测，每条都对应一个真实故障点：

| # | 检查 | 预期 | 失败怎么办 |
|---|---|---|---|
| 1 | `/api/health` | `{"ok":true,"db":"up"}` | 连接串错 / 没跑 migrate |
| 2 | 首页显示商品 | 看到 5 个商品 | 没跑 seed |
| 3 | 商品图显示 | 能看到图 | Blob 没配 / 没 redeploy |
| 4 | 未登录访问 `/admin` | **404** | proxy.ts 失效 |
| 5 | 用新密码登录 | 进入后台 | `AUTH_SECRET` 或 `AUTH_TRUST_HOST` 没设 |
| 6 | 后台上传商品图 | 成功且能显示 | `BLOB_READ_WRITE_TOKEN` 缺失 |
| 7 | 前台完整下一单 | 拿到取货号 | 时段数据缺失（重跑 seed） |
| 8 | 后台改价 → 前台刷新 | 价格更新 | 等 3-5 秒，缓存过期 |

---

## 常见错误对照

| 报错 | 原因 | 解决 |
|---|---|---|
| `Prisma Client not generated` | 构建命令没跑 generate | `vercel.json` 已配好，检查是否被手动覆盖 |
| 登录后跳回登录页 | `AUTH_SECRET` 缺失 | 补上并 Redeploy |
| `too many connections` | 用了 direct 串当 `DATABASE_URL` | 换成 `-pooler` 串 |
| 图片 400 / 不显示 | Blob 域名没白名单 | 已配好，检查是否 redeploy |
| 上传报错 `BLOB` | token 没注入 | Storage 里检查，或手动加环境变量 |
| 中文变方块 | 字体问题 | 本项目用系统字体栈，一般不会出现 |

---

## 部署完怎么更新代码

```powershell
cd "C:\Users\83668\Documents\deepseek-harness\default-workspace\shop"
git add -A
git commit -m "描述改动"
git push
```

Vercel 自动检测 push 并重新部署，约 2 分钟生效。

---

## 部署后本地那套还要留着吗

可以留着当开发环境用：

- `npm run dev` 本地开发（用本地 PostgreSQL，不碰线上库）
- 改完代码 `git push` 更新线上

本地数据库和线上 Neon 是完全独立的两个库，互不影响。

---

## 成本

| 服务 | 免费额度 | 够用吗 |
|---|---|---|
| Vercel Hobby | 100GB 带宽/月 | 足够 |
| Neon Free | 0.5GB 存储 | 足够（数千订单） |
| Vercel Blob | 1GB + 10GB/月 | 足够 |

按小店体量，几年内不会产生费用。

---

## 卡住了怎么办

把**具体的报错文字**发给我（截图或复制文本都行），我来判断。

最容易出错的三处，提前提醒：

1. **Neon 两个连接串搞混** —— `DATABASE_URL` 必须带 `-pooler`
2. **忘了 Redeploy** —— 改完环境变量不重新部署等于没改
3. **`AUTH_URL` 手贱填了** —— 填了就登不上
