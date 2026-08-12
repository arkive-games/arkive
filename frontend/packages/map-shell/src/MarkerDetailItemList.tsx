import { cloneElement, type ReactElement, type ReactNode } from "react"
import { cn } from "@gamemap/ui"

export function MarkerDetailItemList({ children, className, testId = "marker-detail-item-list" }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div className={cn("divide-y divide-border", className)} data-testid={testId}>
      {children}
    </div>
  )
}

export function MarkerDetailItemRow({
  children,
  className,
}: {
  children: ReactElement<{ className?: string }>
  className?: string
}) {
  return cloneElement(children, {
    className: cn(
      "grid min-h-10 grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-2 px-1 py-1.5 transition-colors hover:bg-accent/55 max-[350px]:grid-cols-[1.75rem_minmax(0,1fr)_auto]",
      children.props.className,
      className,
    ),
  })
}

export function MarkerDetailItemIcon({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cn("flex size-8 items-center justify-center rounded-md bg-muted max-[350px]:size-7", className)}>
      {children}
    </span>
  )
}

export function MarkerDetailItemName({ children, className }: { children: ReactNode; className?: string }) {
  return <strong className={cn("min-w-0 truncate text-sm font-medium", className)}>{children}</strong>
}

export function MarkerDetailItemMeta({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("whitespace-nowrap text-xs font-medium text-muted-foreground", className)}>{children}</span>
}

export function MarkerDetailItemValue({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "min-w-10 rounded-md bg-primary/10 px-1.5 py-1 text-center text-xs font-semibold text-primary max-[350px]:hidden",
        className,
      )}
    >
      {children}
    </span>
  )
}
