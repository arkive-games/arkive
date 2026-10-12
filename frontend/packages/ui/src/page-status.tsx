import type { ReactNode } from "react"
import { cn } from "./utils"

/**
 * The loading placeholder catalogue and detail pages show before their data
 * arrives: a heading bar, two text lines and a content block.
 */
export function PageSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn("space-y-4", className)} role="status" aria-label={label}>
      <div className="h-7 w-56 animate-pulse rounded bg-secondary" />
      <div className="h-4 w-full max-w-xl animate-pulse rounded bg-secondary" />
      <div className="h-4 w-2/3 max-w-md animate-pulse rounded bg-secondary" />
      <div className="h-64 w-full animate-pulse rounded-md bg-secondary" />
    </div>
  )
}

/** "Not found" text with an optional way back (usually a router link). */
export function NotFoundMessage({
  message,
  action,
  className,
}: {
  message: ReactNode
  action?: ReactNode
  className?: string
}) {
  if (action == null) return <p className={cn("text-muted-foreground", className)}>{message}</p>
  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-muted-foreground">{message}</p>
      {action}
    </div>
  )
}
