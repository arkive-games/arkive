import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { GenusResult, Rating, SpeciesResult } from '@/features/score/data'
import { FormulaHint } from '@/features/score/FormulaHint'
import { ItemCard } from '@/features/score/SpeciesRow'
import { TYPE } from '@/lib/typography'

/**
 * How one of a group's items is shown.
 *
 * `derived` items show the figure the page computed and, optionally, the
 * calculator that produced it under the row; `typed` items are the box the
 * player copies the panel's number into, with a line saying why nothing
 * derives it. Keyed by the client's module name (`Player_Talent`), which is
 * the dataset's stable handle for a species.
 */
export type ItemPresentation =
  | {
      kind: 'derived'
      calculator?: ReactNode
      /**
       * Items naming the same `shared` key are one card with one detail: the
       * calculator of the first of them, which computes them all.
       */
      shared?: string
    }
  | { kind: 'typed' }

type Card = { id: string; items: SpeciesResult[]; details?: ReactNode }

/** Items in panel order, those sharing a calculator gathered into the first one's card. */
function cards(items: SpeciesResult[], present: (item: SpeciesResult) => ItemPresentation): Card[] {
  const out: Card[] = []
  const byKey = new Map<string, Card>()
  for (const item of items) {
    const how = present(item)
    const key = how.kind === 'derived' ? how.shared : undefined
    const existing = key === undefined ? undefined : byKey.get(key)
    if (existing) {
      existing.items.push(item)
      continue
    }
    const card: Card = { id: `item-${item.species.id}`, items: [item], details: how.kind === 'derived' ? how.calculator : undefined }
    if (key !== undefined) byKey.set(key, card)
    out.push(card)
  }
  return out
}

/**
 * One of the panel's four groups: its heading with the group total, its
 * hint, and one row per item in the panel's order. Every group on the page
 * goes through this, so a derived item and a typed one read the same way
 * wherever they sit.
 */
export function GroupSection({
  group,
  rating,
  hint,
  present,
  onScore,
  children,
}: {
  group: GenusResult
  rating: Rating
  hint: string
  present: (item: SpeciesResult) => ItemPresentation
  onScore: (speciesId: number, value: number) => void
  /** A calculator behind every item of the group: the whole group becomes one card. */
  children?: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <section aria-label={group.genus.name} data-testid={`score-genus-${group.genus.id}`}>
      <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className={TYPE.sectionTitle}>{group.genus.name}</span>
          <FormulaHint testId={`score-genus-hint-${group.genus.id}`}>{hint}</FormulaHint>
        </span>
        <span className="text-xs font-normal tabular-nums text-muted-foreground" data-testid={`score-genus-total-${group.genus.id}`}>
          {t('score.groupTotal', {
            score: group.score.toLocaleString(),
            expected: group.expected.toLocaleString(),
            percent: Math.round(group.percent * 100),
          })}
        </span>
      </h2>
      <div className="mt-2 space-y-2">
        {cards(group.items, children ? () => ({ kind: 'derived', shared: 'all' }) : present).map((card) => (
          <ItemCard key={card.id} id={children ? `genus-${group.genus.id}` : card.id} items={card.items} rating={rating}
            details={children ?? card.details}
            onScore={(item) => (present(item).kind === 'typed' ? (value) => onScore(item.species.id, value) : undefined)} />
        ))}
      </div>
    </section>
  )
}
