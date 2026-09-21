import { AxiosError } from "axios"
import type { ApiError } from "./client"

function extractErrorMessage(err: ApiError): string {
  if (err instanceof AxiosError) {
    return err.message
  }

  const errDetail = (err.body as { detail?: unknown } | undefined)?.detail
  if (Array.isArray(errDetail) && errDetail.length > 0) {
    // FastAPI 422 校验错误是 [{loc, msg, ...}] 数组，拼接所有 msg
    return errDetail
      .map((item) => (item as { msg?: string }).msg ?? "")
      .filter(Boolean)
      .join("；")
  }
  if (typeof errDetail === "string" && errDetail) {
    return errDetail
  }
  return "操作失败，请稍后再试"
}

/** 统一的接口错误文案提取：后端中文 detail 优先，其次 Error.message */
export function getApiErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "body" in err) {
    return extractErrorMessage(err as ApiError)
  }
  if (err instanceof Error) {
    return err.message
  }
  return "操作失败，请稍后再试"
}

export const handleError = function (
  this: (msg: string) => void,
  err: ApiError,
) {
  const errorMessage = extractErrorMessage(err)
  this(errorMessage)
}

export const getInitials = (name: string): string => {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
}
