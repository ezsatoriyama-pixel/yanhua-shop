"use server";

/**
 * 图片上传。
 *
 * 双模式存储：
 *  1. 配置了 BLOB_READ_WRITE_TOKEN → 用 Vercel Blob（生产环境必须）
 *  2. 否则写本地 public/uploads/（仅本地开发用）
 *
 * 为什么必须这样：
 *   Vercel 的 Serverless 文件系统是**只读**的，写 public/ 会直接失败。
 *   线上必须用对象存储。Vercel Blob 免费额度 1GB，够小店用很久。
 *
 * 换其他存储（阿里云 OSS / 腾讯云 COS）只需改 saveFile() 一处。
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireAdminAction } from "@/lib/admin/guard";

/** 只接受这几种图片格式，其它一律拒绝（防止上传 svg/html 造成 XSS） */
const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

/** 单张上限 5MB */
const MAX_BYTES = 5 * 1024 * 1024;

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

export async function uploadImage(formData: FormData): Promise<UploadResult> {
  // ── 鉴权：action 是公开端点，必须自己校验 ──
  try {
    await requireAdminAction();
  } catch {
    return { ok: false, message: "无权限" };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, message: "没有收到文件" };
  }

  const ext = ALLOWED.get(file.type);
  if (!ext) {
    return { ok: false, message: "只支持 JPG / PNG / WebP / AVIF 格式" };
  }

  if (file.size <= 0) {
    return { ok: false, message: "文件为空" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "图片不能超过 5MB" };
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const name = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    const url = await saveFile(bytes, name);
    return { ok: true, url };
  } catch (error) {
    console.error("[uploadImage]", error);
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("BLOB") || msg.includes("blob")) {
      return { ok: false, message: "存储服务未配置，请检查 BLOB_READ_WRITE_TOKEN" };
    }
    return { ok: false, message: "上传失败，请重试" };
  }
}

/**
 * 落盘 / 上云。换存储后端只改这里。
 *
 * 文件名用 UUID + 时间戳而非原始名：
 *  原始名可能含中文、空格、路径穿越字符（../），
 *  直接拼进路径有安全风险，也容易被浏览器编码搞坏。
 */
async function saveFile(bytes: Buffer, name: string): Promise<string> {
  // ── 生产：Vercel Blob ──
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`products/${name}`, bytes, {
      access: "public",
      contentType: guessContentType(name),
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
    });
    return blob.url;
  }

  // ── 本地开发：写 public/uploads ──
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/${name}`;
}

function guessContentType(name: string): string {
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}
