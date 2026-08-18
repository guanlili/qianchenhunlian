import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 后端文件服务的 origin (admin 与 backend 不同源: dashboard.qianyuan.website vs
// api.qianyuan.website), 用 VITE_API_URL 推导; 兼容带/不带 /api/v1 后缀的配置
const API_ORIGIN = (import.meta.env.VITE_API_URL || "")
  .replace(/\/api\/v\d+\/?$/, "")
  .replace(/\/+$/, "")

/**
 * 把后端返回的图片路径 (/files/xxx) 拼成可在 admin 侧访问的完整 URL.
 * - 相对路径 ('/files/...') → API host + path
 * - 老数据里的绝对 URL (含任意 host) → 剥掉 host 重拼当前 API host
 * - 其他 (外部图床等) / 空 → 原样返回, 调用方自行 fallback
 */
export function resolveFileUrl(u?: string | null): string {
  if (!u || typeof u !== "string" || u === "default") return ""
  if (u.startsWith("/")) return API_ORIGIN + u
  const m = u.match(/^https?:\/\/[^/]+(\/files\/.*)$/)
  if (m) return API_ORIGIN + m[1]
  return u
}
