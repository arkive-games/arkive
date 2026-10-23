import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { GenusResult, Rating, SpeciesResult } from '@/features/score/data'
import { ItemRow } from '@/features/score/SpeciesRow'
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
  | { kind: 'derived'; calculator?: ReactNode }
  | { kind: 'typed'; note?: string }

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
  /** Drawn after the rows: a calculator that spans the whole group. */
  children?: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <section aria-label={group.genus.name} data-testid={`score-genus-${group.genus.id}`}>
      <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-1.5">
        <span className={TYPE.sectionTitle}>{group.genus.name}</span>
        <span className="text-xs font-normal tabular-nums text-muted-foreground" data-testid={`score-genus-total-${group.genus.id}`}>
          {t('score.groupTotal', {
            score: group.score.toLocaleString(),
            expected: group.expected.toLocaleString(),
            percent: Math.round(group.percent * 100),
          })}
        </span>
      </h2>
      <p className={`mt-1 ${TYPE.body}`}>{hint}</p>
      <div className="mt-2 space-y-2">
        {group.items.map((item) => {
          const how = present(item)
          if (how.kind === 'derived') {
            return (
              <ItemRow key={item.species.id} item={item} rating={rating}>
                {how.calculator}
              </ItemRow>
            )
          }
          return (
            <ItemRow key={item.species.id} item={item} rating={rating} onScore={(value) => onScore(item.species.id, value)}>
              {how.note ? <p className={TYPE.body}>{how.note}</p> : null}
            </ItemRow>
          )
        })}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  )
}
