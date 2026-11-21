# 线上地址

**前台：** https://yanhua-shop.vercel.app
**后台：** https://yanhua-shop.vercel.app/login

账号：`1232456`
密码：`123321`

> ⚠️ 这个密码很短，且曾出现在对话记录里。正式对外营业前建议改掉：
> ```powershell
> $env:DATABASE_URL="<Neon direct 连接串>"
> npx tsx scripts/sync-prod-password.ts <新账号> <新密码>
> ```

---

## 架构

| 层 | 服务 | 说明 |
|---|---|---|
| 托管 | Vercel（Hobby 免费） | 7×24 在线，推送自动部署 |
| 数据库 | Neon（Free） | PostgreSQL 18.7，Singapore 区域 |
| 图片 | Vercel Blob | 免费 1GB + 10GB/月 |
| 认证 | NextAuth (JWT) | Cookie 会话，7 天有效 |

---

## 日常操作

### 改代码后更新线上

```powershell
cd "C:\Users\83668\Documents\deepseek-harness\default-workspace\shop"
git add -A
git commit -m "描述改动"
git push
```

Vercel 自动检测 push 并部署，约 2 分钟生效。不用手动操作。

推送需要 GitHub token（`ghp_...`）。如果没有，去 https://github.com/settings/tokens 生成一个，勾 `repo`。

### 改后台密码

```powershell
$env:DATABASE_URL="<Neon direct 连接串>"
npx tsx scripts/sync-prod-password.ts 新账号 新密码
```

改完记得同步更新 Vercel 的 `ADMIN_EMAILS` 环境变量（如果账号变了）。

### 查看/修改数据

```powershell
$env:DATABASE_URL="<Neon direct 连接串>"
$env:DIRECT_URL=$env:DATABASE_URL
npx prisma studio
```

---

## 环境变量（Vercel 项目设置里）

| 变量 | 用途 |
|---|---|
| `DATABASE_URL` | Neon pooled 连接串（带 `-pooler`） |
| `DIRECT_URL` | Neon direct 连接串（迁移用） |
| `AUTH_SECRET` | 会话加密密钥 |
| `AUTH_TRUST_HOST` | `true` |
| `ADMIN_EMAILS` | `1232456` |
| `NEXT_PUBLIC_STORE_NAME` | `长夜烟花` |
| `BLOB_READ_WRITE_TOKEN` | 图片存储（Blob 创建后自动注入） |

**不要添加 `AUTH_URL`** —— 会导致登录失败。

---

## 部署时踩过的坑

| 问题 | 原因 | 解决 |
|---|---|---|
| 构建失败 `Invalid Version` | `embedded-postgres` 是预发布版本，Vercel 的 npm 解析失败 | 从 package.json 移除，重建 lockfile（用官方 registry） |
| 网站打开是 Vercel 登录页 | 新项目默认开启 Deployment Protection | API 设置 `ssoProtection: null` |
| 线上登录失败但本地正常 | 线上数据库密码还是 seed 的默认值 | 跑 `sync-prod-password.ts` 同步 |
| `api.vercel.com` 连不上 | 国内网络间歇性阻断 | 重试；PowerShell 比 Node fetch 更稳 |

---

## 免费额度

| 服务 | 额度 | 够用吗 |
|---|---|---|
| Vercel Hobby | 100GB 带宽/月 | 足够小店 |
| Neon Free | 0.5GB 存储 | 足够（数千订单） |
| Vercel Blob | 1GB + 10GB 流量/月 | 足够 |

超了才收费。按小店体量几年内不会产生费用。

---

## 本地开发（可选）

线上已部署，本地不再是必须的。若要本地开发：

1. 装 PostgreSQL（或用 Docker）
2. 改 `.env` 的 `DATABASE_URL` 指向本地库
3. `npx prisma migrate dev && npx prisma db seed`
4. `npm run dev`

**注意**：`embedded-postgres` 已从依赖里移除（它导致 Vercel 构建失败）。要恢复本地便携数据库需重新安装，但那会再次引入构建问题——建议直接用 Docker 或本地安装的 PostgreSQL。
