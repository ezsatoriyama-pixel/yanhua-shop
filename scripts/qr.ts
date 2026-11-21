/**
 * 生成局域网访问二维码（终端直接打印，不用外部服务）
 *   npx tsx scripts/qr.ts [url]
 *
 * 为什么自己实现：把网址发给第三方二维码 API 等于把内网地址外泄。
 * 这里用零依赖的方式在终端输出，纯本地计算。
 */
import { createServer } from "node:http";

const url = process.argv[2] ?? "http://192.168.3.251:3000";

/**
 * 极简 QR 生成太重，这里改用 Google Chart 之外的本地方案：
 * 直接输出 ASCII 方块图 —— 用 qrcode 库生成矩阵后手绘。
 * 若未安装 qrcode，则退化为打印链接。
 */
async function main() {
  let QR: any;
  try {
    // 动态引入，没装就退化
    const mod = await import("qrcode");
    QR = mod.default ?? mod;
  } catch {
    console.log("\n（未安装 qrcode 库，直接访问下面的地址）");
    console.log(`\n  ${url}\n`);
    return;
  }

  const qr = QR.create(url, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const data = qr.modules.data;

  console.log(`\n  ${url}\n`);

  // 用两个字符宽表示一个模块，保证手机能扫
  const light = "  ";
  const dark = "██";
  const quiet = 2;

  for (let y = -quiet; y < size + quiet; y++) {
    let line = "";
    for (let x = -quiet; x < size + quiet; x++) {
      const inside = y >= 0 && y < size && x >= 0 && x < size;
      const on = inside ? data[y * size + x] : 0;
      line += on ? dark : light;
    }
    console.log(line);
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
