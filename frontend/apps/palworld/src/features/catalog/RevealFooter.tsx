import { useTranslation } from 'react-i18next'
import { Button } from '@gamemap/ui'

/**
 * Bottom-of-grid reveal control for useIncrementalList. The sentinel div
 * triggers the next chunk as it nears the viewport; the button is the manual
 * fallback for the same step (keyboard users, environments without
 * IntersectionObserver, deterministic e2e). Keyed by the shown count so the
 * sentinel remounts after each reveal — a remounted observer re-reports
 * intersection immediately, chaining reveals until the sentinel leaves the
 * pre-reveal margin.
 */
export function RevealFooter({
  shownCount,
  remaining,
  showMore,
  sentinelRef,
  testId,
}: {
  shownCount: number
  remaining: number
  showMore: () => void
  sentinelRef: (node: HTMLElement | null) => void
  testId: string
}) {
  const { t } = useTranslation()
  if (remaining <= 0) return null
  return (
    <div key={shownCount} ref={sentinelRef} className="mt-4 flex justify-center">
      <Button variant="outline" onClick={showMore} data-testid={testId}>
        {t('catalogShowMore', { count: remaining })}
      </Button>
    </div>
  )
}
