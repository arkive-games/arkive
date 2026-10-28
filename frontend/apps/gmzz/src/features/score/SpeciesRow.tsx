import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { clamp, materialsFor, type Rating, type SpeciesResult } from '@/features/score/data'
import { TipOn } from '@/features/score/Tip'

/**
 * A band's colour variable (`--b1`..`--b4` in score.css, worst to best).
 *
 * Indexed by the band's *position* in the sorted list rather than keyed by its
 * threshold. Keying on the threshold looks tidier but couples the palette to
 * the client's current numbers: re-tune 99 to 98 and the lookup misses. A
 * position that runs off the end falls back to the last colour, which is wrong
 * but visible.
 */
export function bandVar(index: number): string {
  return `var(--b${Math.min(Math.max(index, 0), 3) + 1})`
}

/**
 * One of the panel's items as a ledger line: its name, a bar filled to its
 * share of the max benchmark in its band's colour, the score against the
 * expected one, and the percentage. Materials, benchmarks and the gap are in
 * the line's tooltip, and how the score is calculated is the score's own
 * tooltip (`formula`). An `unsupported` item — one the page does not know how
 * to derive yet — says so and scores nothing.
 */
export function ItemRow({ item, rating, unsupported = false, formula }: {
  item: SpeciesResult
  rating: Rating
  unsupported?: boolean
  /** How this item's score is calculated, shown in a question mark before the score. */
  formula?: ReactNode
}) {
  const { t } = useTranslation()
  const bandIndex = rating.bands.findIndex((band) => band.id === item.band?.id)
  // Guarded before it reaches a CSS width: a non-finite percentage would render
  // as `width: NaN%`, which the browser drops, leaving a bar stuck full-width
  // with no other symptom.
  const percent = Number.isFinite(item.percent) ? Math.round(clamp(item.percent, 0, 1) * 100) : 0
  const materials = materialsFor(rating, item.species)
  const gap = item.toExpected > 0
    ? t('score.gapToExpected', { points: item.toExpected.toLocaleString() })
    : item.toMax > 0
      ? t('score.gapToMax', { points: item.toMax.toLocaleString() })
      : t('score.atMax')
  // Where the item stands, under how it is calculated in the score's tooltip:
  // the share of the maximum, the benchmarks, the gap, the band, and on its own
  // labelled line what raises the item.
  const standing = [
    t('score.percentOfMax', { percent }),
    `${t('score.expectedValue', { value: item.expected.toLocaleString() })} · ${t('score.maxValue', { value: item.max.toLocaleString() })}`,
    gap,
    item.band?.label ? t('score.bandIs', { band: item.band.label }) : null,
    materials.length > 0 ? t('score.raiseWith', { list: materials.map((m) => m.name).join(' · ') }) : null,
  ].filter(Boolean).join('\n')

  return (
    <div className="gz-item" style={{ '--b': bandVar(bandIndex) } as CSSProperties} data-testid={`score-item-${item.species.id}`}>
      <div className="top">
        <span className="name">{item.species.name}</span>
        {unsupported ? (
          <span className="unsup" data-testid={`score-unsupported-${item.species.id}`}>{t('score.unsupported')}</span>
        ) : (
          <span className="val num">
            {formula ? (
              <TipOn title={item.species.name} content={<>{formula}<div className="mt-1.5">{standing}</div></>}>
                <b className="gz-hov" tabIndex={0} data-testid={`score-derived-${item.species.id}`}>{item.score.toLocaleString()}</b>
              </TipOn>
            ) : <b data-testid={`score-derived-${item.species.id}`}>{item.score.toLocaleString()}</b>}
          </span>
        )}
      </div>
      <div className="gz-bar">
        <i style={{ width: `${percent}%` }} />
        <span className="band num">{percent}%</span>
      </div>
    </div>
  )
}

/**
 * The calculator behind one or several items, as a tinted panel under the
 * group's ledger. The calculator draws its own head (title, meta, actions),
 * so the panel is only the surface. Items sharing a calculator share the
 * panel, so there is no second kind of details box.
 */
export function ItemPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <article className="gz-panel gz-tint" data-testid={`score-card-${id}`}>
      {children}
    </article>
  )
}
