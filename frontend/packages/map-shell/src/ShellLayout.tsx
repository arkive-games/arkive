import type { ReactNode } from "react"
import { cn } from "@gamemap/ui"

export interface ShellLayoutProps {
  /** Sidebar on the left, below the top bar (e.g. <ShellSidebar/>). */
  sidebar: ReactNode
  /** Full-width top bar across the whole page. */
  topBar: ReactNode
  /** Main content, below the top bar. */
  children: ReactNode
  className?: string
}

/**
 * App shell layout: a full-width top bar, with a row below it holding the
 * sidebar on the left and the main content filling the rest. The sidebar
 * therefore starts below the top bar and never overlaps it.
 */
export function ShellLayout({ sidebar, topBar, children, className }: ShellLayoutProps) {
  return (
    <div className={cn("flex h-dvh w-screen flex-col overflow-hidden", className)}>
      {topBar}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebar}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  )
}
