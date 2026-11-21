import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 健康检查。
 * 部署后第一时间访问它，确认「应用起来了 + 数据库连得上」，
 * 而不是等用户下单失败才发现连接串错了。
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      db: "up",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
}
