/**
 * 部署到 GitHub Pages
 *   node scripts/deploy-gh-pages.mjs <GitHubToken>
 *
 * 做的事：
 *   1. 用 basePath 重新构建（GitHub Pages 部署在 /repo/ 子路径下）
 *   2. 把 out/ 内容推送到 gh-pages 分支
 *   3. 返回访问地址
 *
 * 为什么必须设 basePath：
 *   https://<user>.github.io/<repo>/ 是子路径，
 *   不设的话 CSS/JS/图片全部会 404（路径少了一层）。
 */
import { execSync } from "node:child_process";
import { existsSync, writeFileSync, rmSync } from "node:fs";

const TOKEN = process.argv[2];
const OWNER = process.argv[3] ?? "ezsatoriyama-pixel";
const REPO = process.argv[4] ?? "yanhua-shop";

if (!TOKEN) {
  console.error("用法: node scripts/deploy-gh-pages.mjs <GitHubToken> [owner] [repo]");
  process.exit(1);
}

const BASE_PATH = `/${REPO}`;
const run = (cmd, env = {}) => {
  console.log(`$ ${cmd}`);
  return execSync(cmd, {
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: true,
  });
};

async function main() {
  console.log("=== ① 构建（basePath = " + BASE_PATH + "）===");
  if (existsSync("out")) rmSync("out", { recursive: true, force: true });
  run("npx next build", { NEXT_PUBLIC_BASE_PATH: BASE_PATH });

  if (!existsSync("out")) {
    console.error("构建失败：out 目录不存在");
    process.exit(1);
  }

  console.log("\n=== ② 写入 .nojekyll ===");
  // GitHub Pages 默认用 Jekyll，会忽略 _next 这类下划线开头的目录
  // 没有这个文件，所有 CSS/JS 都会 404
  writeFileSync("out/.nojekyll", "", "utf8");
  console.log("✓ 已创建 out/.nojekyll");

  console.log("\n=== ③ 推送 gh-pages 分支 ===");
  const remote = `https://${OWNER}:${TOKEN}@github.com/${OWNER}/${REPO}.git`;

  run("git init -b gh-pages", { GIT_TERMINAL_PROMPT: "0" });
  run("git add -A", { GIT_TERMINAL_PROMPT: "0" });
  run(
    `git -c user.name="${OWNER}" -c user.email="${OWNER}@users.noreply.github.com" commit -m "deploy: GitHub Pages 静态版"`,
    { GIT_TERMINAL_PROMPT: "0" },
  );
  run(`git push -f "${remote}" gh-pages`, { GIT_TERMINAL_PROMPT: "0" });

  console.log("\n=== ④ 部署完成 ===");
  console.log(`访问地址: https://${OWNER}.github.io/${REPO}/`);
  console.log(`后台设置: https://github.com/${OWNER}/${REPO}/settings/pages`);
  console.log(
    "\n注意：若首次部署，需要在仓库 Settings → Pages 里把 Source 设为 gh-pages 分支。",
  );
}

main().catch((e) => {
  console.error("部署失败:", e.message);
  process.exit(1);
});
