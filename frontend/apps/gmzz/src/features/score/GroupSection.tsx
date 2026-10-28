import type { CSSProperties, ReactNode } from 'react'

import type { GenusResult, Rating, SpeciesResult } from '@/features/score/data'
import { ItemPanel, ItemRow } from '@/features/score/SpeciesRow'

/**
 * How one of a group's items is shown.
 *
 * `derived` items show the figure the page computed and, optionally, the
 * calculator that produced it under the row. Every item the dataset carries
 * today is derived; `unsupported` is an item the page does not know yet —
 * shown, scored as nothing, and never an input box, because a score is never
 * something the player types. Keyed by the client's module name
 * (`Player_Talent`), the dataset's stable handle for a species.
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
  | { kind: 'unsupported' }

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
 * One of the panel's four groups: the inputs it follows, a ledger of every
 * item in the panel's order, and then one panel per calculator. Every group on the page goes
 * through this, so every item reads the same way wherever it sits.
 */
export function GroupSection({
  group,
  rating,
  present,
  lead,
  after,
  formula,
  children,
}: {
  group: GenusResult
  rating: Rating
  present: (item: SpeciesResult) => ItemPresentation
  /** Inputs the group's items are computed from, shown under the ledger. */
  lead?: ReactNode
  /** Panels of the group's own layout, shown below the ledger instead of per-item cards. */
  after?: ReactNode
  /** How an item's score is calculated, shown in a question mark on its ledger line. */
  formula?: (item: SpeciesResult) => ReactNode
  /** A calculator behind every item of the group: the whole group becomes one card. */
  children?: ReactNode
}) {
  const panels = cards(group.items, children ? () => ({ kind: 'derived', shared: 'all' }) : present)
    .filter((card) => (children ?? card.details) !== undefined)

  return (
    <section className="gz-sec" aria-label={group.genus.name} data-testid={`score-genus-${group.genus.id}`}>
      <div className="gz-items" style={{ '--n': group.items.length } as CSSProperties}>
        {group.items.map((item) => (
          <ItemRow key={item.species.id} item={item} rating={rating} unsupported={!children && present(item).kind === 'unsupported'} formula={formula?.(item)} />
        ))}
      </div>
      {lead}
      {panels.map((card) => (
        <ItemPanel key={card.id} id={children ? `genus-${group.genus.id}` : card.id}>
          {children ?? card.details}
        </ItemPanel>
      ))}
      {after}
    </section>
  )
}
