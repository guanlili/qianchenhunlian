import { Link } from "@tanstack/react-router"

import { cn } from "@/lib/utils"
import mark from "/assets/images/qianyuan-mark.svg"

interface LogoProps {
  variant?: "full" | "icon" | "responsive"
  className?: string
  asLink?: boolean
}

export function Logo({
  variant = "full",
  className,
  asLink = true,
}: LogoProps) {
  const content = (
    <div className="flex items-center gap-2">
      <img
        src={mark}
        alt="乾缘婚恋标识"
        className={cn(
          variant === "full"
            ? "size-14"
            : variant === "icon"
              ? "size-6"
              : "size-8",
          className,
        )}
      />
      {variant !== "icon" && (
        <span
          className={cn(
            "font-semibold tracking-wide text-foreground",
            variant === "full" ? "text-2xl" : "text-lg",
            variant === "responsive" && "group-data-[collapsible=icon]:hidden",
          )}
        >
          乾缘婚恋
        </span>
      )}
    </div>
  )

  if (!asLink) {
    return content
  }

  return <Link to="/dashboard">{content}</Link>
}
