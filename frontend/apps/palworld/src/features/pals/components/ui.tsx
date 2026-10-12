import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { cn, NotFoundMessage, PageSkeleton } from '@gamemap/ui'

/** A titled panel — the encyclopedia's section container. */
export function PalSection({
  title,
  action,
  children,
  className,
  testId,
  collapsible = false,
  expanded = true,
  onExpandedChange,
  expandLabel = 'Expand',
  collapseLabel = 'Collapse',
}: {
  title?: string
  /** Rendered right-aligned on the title row (e.g. a related-page link). */
  action?: ReactNode
  children: ReactNode
  className?: string
  testId?: string
  /** Mobile-only disclosure. Desktop sections always remain fully visible. */
  collapsible?: boolean
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  expandLabel?: string
  collapseLabel?: string
}) {
  const heading = title ? (
    <h2 className="min-w-0 flex-1 text-base font-semibold sm:text-lg">{title}</h2>
  ) : null

  return (
    <section
      className={cn(
        'rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm sm:p-4',
        className,
      )}
      data-testid={testId}
    >
      {title ? (
        <div
          className={cn(
            'flex items-center gap-2',
            expanded || !collapsible ? 'mb-3' : '',
            collapsible && 'md:mb-3',
          )}
        >
          {heading}
          {action != null ? <div className="shrink-0">{action}</div> : null}
          {collapsible ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? collapseLabel : expandLabel}
              title={expanded ? collapseLabel : expandLabel}
              onClick={() => onExpandedChange?.(!expanded)}
              className="-mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground md:hidden"
            >
              <ChevronDown className={cn('size-5 transition-transform', expanded && 'rotate-180')} />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className={cn(collapsible && !expanded && 'hidden md:block')}>{children}</div>
    </section>
  )
}

export function InfoRows({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-border/60 text-sm">{children}</dl>
}

/** A label/value pair; used for stats and header facts. */
export function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(6rem,auto)_minmax(0,1fr)] items-center gap-3 py-1.5 first:pt-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums break-words">{value}</dd>
    </div>
  )
}

export function PalPageLoading() {
  const { t } = useTranslation()
  return <PageSkeleton label={t('pal.loading')} />
}

export function PalNotFound({ id }: { id: string }) {
  const { t } = useTranslation()
  return (
    <NotFoundMessage
      message={t('pal.notFound', { id })}
      action={
        <Link to="/pals" className="text-sm text-primary hover:underline">
          {t('pal.backToList')}
        </Link>
      }
    />
  )
}
