import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { cn, useIsMobile } from '@gamemap/ui'
import { defineMemoryRecord, isFiniteNumber, memoryPolicy, useMemoryState } from '@gamemap/state-memory'

const MAX_VISIBLE_PAGES = 3
const pageRecord = defineMemoryRecord({
  id: 'page',
  namespace: 'palworld',
  surface: 'catalog',
  ...memoryPolicy.sessionContext('clear-catalog-page'),
  schemaVersion: '1.0.0',
  defaultValue: () => 1,
  validate: (value: unknown): value is number => isFiniteNumber(value) && value >= 1,
})

interface MobilePaginationOptions {
  pageSize?: number
  resetKey?: string
  desktop?: boolean
  desktopPageSize?: number
}

export function useMobilePagination<T>(
  items: T[],
  { pageSize = 24, resetKey = '', desktop = false, desktopPageSize = pageSize }: MobilePaginationOptions = {},
) {
  const isMobile = useIsMobile()
  const activePageSize = isMobile ? pageSize : desktopPageSize
  const pagePartition = `${typeof window === 'undefined' ? 'catalog' : window.location.pathname}:${resetKey || 'default'}:${activePageSize}`
  const [page, setPage] = useMemoryState(pageRecord, { partition: pagePartition })
  const enabled = isMobile || desktop
  const pageCount = enabled ? Math.max(1, Math.ceil(items.length / activePageSize)) : 1
  const currentPage = enabled && items.length > 0 ? Math.min(page, pageCount) : page
  const previousResetKey = useRef(resetKey)

  useEffect(() => {
    if (previousResetKey.current === resetKey) return
    previousResetKey.current = resetKey
    setPage(1)
  }, [resetKey, setPage])

  useEffect(() => {
    if (!enabled || items.length === 0) return
    setPage((current) => Math.min(current, pageCount))
  }, [enabled, items.length, pageCount, setPage])

  const visibleItems = useMemo(
    () => (enabled ? items.slice((currentPage - 1) * activePageSize, currentPage * activePageSize) : items),
    [enabled, items, currentPage, activePageSize],
  )

  const goToPage = useCallback(
    (nextPage: number) => {
      setPage(Math.min(Math.max(nextPage, 1), pageCount))
      const scroller = document.querySelector<HTMLElement>('[data-content-scroll]')
      if (!scroller) return

      // Land on the first `[data-pagination-anchor]` rather than the very top, so a
      // page change shows results instead of the hero and title the reader has
      // already passed. Pages without an anchor keep the old top-of-scroller
      // behaviour; see the note in the mobile spec for which ones those are.
      const anchor = scroller.querySelector<HTMLElement>('[data-pagination-anchor]')
      const top = anchor
        ? Math.max(
          0,
          anchor.getBoundingClientRect().top
          - scroller.getBoundingClientRect().top
          + scroller.scrollTop,
        )
        : 0
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      scroller.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' })
    },
    [pageCount, setPage],
  )

  return { isMobile, page: currentPage, pageCount, visibleItems, goToPage }
}

export function MobilePagination({
  page,
  pageCount,
  onPageChange,
  className,
  desktop = false,
}: {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  className?: string
  desktop?: boolean
}) {
  const { t } = useTranslation()
  if (pageCount <= 1) return null

  const firstPage = Math.min(
    Math.max(page - Math.floor(MAX_VISIBLE_PAGES / 2), 1),
    Math.max(1, pageCount - MAX_VISIBLE_PAGES + 1),
  )
  const pages = Array.from(
    { length: Math.min(MAX_VISIBLE_PAGES, pageCount) },
    (_, index) => firstPage + index,
  )

  return (
    <nav
      aria-label={t('pagination.label')}
      className={cn('mt-5 flex items-center justify-center gap-2', !desktop && 'md:hidden', className)}
      data-testid="mobile-pagination"
    >
      <button
        type="button"
        disabled={page === 1}
        aria-label={t('pagination.previous')}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <IconChevronLeft className="size-5" stroke={1.8} />
      </button>

      <span className="min-w-24 text-center text-sm font-semibold tabular-nums min-[390px]:hidden">
        {page} / {pageCount}
      </span>

      <div className="hidden items-center justify-center gap-1.5 min-[390px]:flex">
        {pages.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            aria-current={pageNumber === page ? 'page' : undefined}
            aria-label={t('pagination.page', { page: pageNumber })}
            onClick={() => onPageChange(pageNumber)}
            className={cn(
              'flex size-11 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
              pageNumber === page
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card text-foreground',
            )}
          >
            {pageNumber}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={page === pageCount}
        aria-label={t('pagination.next')}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <IconChevronRight className="size-5" stroke={1.8} />
      </button>
    </nav>
  )
}
