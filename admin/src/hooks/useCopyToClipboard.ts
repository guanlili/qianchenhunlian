// source: https://usehooks-ts.com/react-hook/use-copy-to-clipboard
import { useCallback, useEffect, useRef, useState } from "react"

type CopiedValue = string | null

type CopyFn = (text: string) => Promise<boolean>

export function useCopyToClipboard(): [CopiedValue, CopyFn] {
  const [copiedText, setCopiedText] = useState<CopiedValue>(null)
  // 自动复位定时器句柄: 卸载时清理, 避免 unmount 后 setState (watcher/定时器泄漏高发区)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const copy: CopyFn = useCallback(async (text) => {
    if (!navigator?.clipboard) {
      console.warn("剪贴板不可用")
      return false
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopiedText(text)

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopiedText(null), 2000)

      return true
    } catch (error) {
      console.warn("复制失败", error)
      setCopiedText(null)
      return false
    }
  }, [])

  return [copiedText, copy]
}
