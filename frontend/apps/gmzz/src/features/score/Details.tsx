import type { ReactNode } from 'react'
import { useMemory } from '@gamemap/state-memory'
import { IconChevronDown } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { gmzzMemory, isRecord } from '@/lib/memory'
import { TYPE } from '@/lib/typography'

/** Which details the player has folded away, by id; anything absent is open. */
type Folded = Record<string, boolean>

const foldedDraft = gmzzMemory.draft('score/folded', {
  default: (): Folded => ({}),
  validate: (value: unknown): value is Folded => isRecord(value) && Object.values(value).every((v) => typeof v === 'boolean'),
})

/** One detail's open state, remembered across reloads. */
export function useDetailsOpen(id: string): readonly [boolean, () => void] {
  const [folded, setFolded] = useMemory(foldedDraft)
  const open = !folded[id]
  return [open, () => setFolded((prev) => ({ ...prev, [id]: open }))] as const
}

/**
 * The one fold control on the score page: a chevron and "展开详情 / 收起详情".
 * Every detail — an item's own calculator and a calculator shared by a whole
 * group — opens and closes through this button, so they all read the same.
 */
export function DetailsToggle({ open, onToggle, controls, testId }: {
  open: boolean; onToggle: () => void; controls: string; testId: string
}) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls} data-testid={testId}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-[color:var(--arkive-nav-accent)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]">
      {t(open ? 'score.detailsHide' : 'score.detailsShow')}
      <IconChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} stroke={1.8} aria-hidden />
    </button>
  )
}

/**
 * The body of a detail. Folded content stays mounted and is only hidden: the
 * calculators inside report their totals up to the page while they live, so
 * unmounting one would drop its score from the rating.
 */
export function DetailsBody({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <div id={id} hidden={!open} className="mt-2.5 border-t border-border/70 pt-2.5">
      {children}
    </div>
  )
}

/**
 * The second shape: one calculator behind several items (封印物's three rows
 * all come from the relics). Its own card with a header naming the items it
 * computes, and the same fold control as a single item's detail.
 */
export function SharedDetails({ id, items, children }: { id: string; items: string[]; children: ReactNode }) {
  const { t } = useTranslation()
  const [open, toggle] = useDetailsOpen(id)
  const bodyId = `details-${id}`
  return (
    <section className="rounded-md border border-border bg-card p-2.5" data-testid={`score-details-${id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className={TYPE.name}>{t('score.sharedDetails')}</div>
          <div className="truncate text-xs text-muted-foreground">{t('score.sharedDetailsFor', { items: items.join(' · ') })}</div>
        </div>
        <DetailsToggle open={open} onToggle={toggle} controls={bodyId} testId={`score-details-toggle-${id}`} />
      </div>
      <DetailsBody id={bodyId} open={open}>{children}</DetailsBody>
    </section>
  )
}
