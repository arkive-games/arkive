import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, useIsMobile } from '@gamemap/ui'

const MAX_VISIBLE_PAGES = 5

interface MobilePaginationOptions {
  pageSize?: number
  resetKey?: string
}

export function useMobilePagination<T>(
  items: T[],
  { pageSize = 24, resetKey = '' }: MobilePaginationOptions = {},
) {
  const isMobile = useIsMobile()
  const [page, setPage] = useState(1)
  const pageCount = isMobile ? Math.max(1, Math.ceil(items.length / pageSize)) : 1

  useEffect(() => {
    setPage(1)
  }, [resetKey])

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount))
  }, [pageCount])

  const visibleItems = useMemo(
    () => (isMobile ? items.slice((page - 1) * pageSize, page * pageSize) : items),
    [isMobile, items, page, pageSize],
  )

  const goToPage = useCallback(
    (nextPage: number) => {
      setPage(Math.min(Math.max(nextPage, 1), pageCount))
      const scroller = document.querySelector<HTMLElement>('[data-content-scroll]')
      if (!scroller) return
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      scroller.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
    },
    [pageCount],
  )

  return { isMobile, page, pageCount, visibleItems, goToPage }
}

export function MobilePagination({
  page,
  pageCount,
  onPageChange,
  className,
}: {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  className?: string
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
      className={cn('mt-5 flex flex-col items-center gap-1.5 md:hidden', className)}
      data-testid="mobile-pagination"
    >
      <div className="flex items-center justify-center gap-1">
        {pages.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            aria-current={pageNumber === page ? 'page' : undefined}
            aria-label={t('pagination.page', { page: pageNumber })}
            onClick={() => onPageChange(pageNumber)}
            className={cn(
              'flex size-8 items-center justify-center rounded-md border text-xs font-semibold tabular-nums',
              pageNumber === page
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground',
            )}
          >
            {pageNumber}
          </button>
        ))}
      </div>
      <div className="grid w-full max-w-xs grid-cols-2 gap-2">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex h-8 items-center justify-center gap-0.5 rounded-md border border-primary/35 bg-card px-2 text-xs font-medium text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" />
          {t('pagination.previous')}
        </button>
        <button
          type="button"
          disabled={page === pageCount}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex h-8 items-center justify-center gap-0.5 rounded-md border border-primary/35 bg-card px-2 text-xs font-medium text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          {t('pagination.next')}
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </nav>
  )
}
