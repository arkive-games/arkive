import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Map as MapIcon, Skull, Package } from 'lucide-react'
import { loadDungeonLayouts, layoutsByDungeon, pointCounts, type DungeonLayout } from '../../lib/dungeonLayouts'
import { CatalogSection } from '../catalog/components'

const TIER_DOT: [string, string][] = [
  ['reward.easy', 'bg-emerald-500'],
  ['reward.medium', 'bg-amber-500'],
  ['reward.hard', 'bg-rose-500'],
  ['reward.bonus', 'bg-violet-500'],
]

/** Layout gallery on the dungeon detail page: one card per interior variant
 *  with reward-tier / enemy / chest counts, linking to the layout page.
 *  Loads its own dataset; renders nothing while loading or when the dungeon
 *  has no extracted layouts. */
export function DungeonLayoutsSection({ dungeonId }: { dungeonId: string }) {
  const { t } = useTranslation()
  const [layouts, setLayouts] = useState<DungeonLayout[] | null>(null)

  useEffect(() => {
    let cancelled = false
    loadDungeonLayouts()
      .then((file) => {
        if (!cancelled) setLayouts(layoutsByDungeon(file).get(dungeonId) ?? [])
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLayouts([])
      })
    return () => {
      cancelled = true
    }
  }, [dungeonId])

  if (!layouts?.length) return null

  return (
    <CatalogSection title={t('dungeon.layout.title')} testId="dungeon-layouts">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {layouts.map((lay) => {
          const counts = pointCounts(lay.points)
          const enemies = [...counts].reduce(
            (s, [k, n]) => (k.startsWith('enemy.') ? s + n : s),
            0,
          )
          const chests = (counts.get('chest.normal') ?? 0) + (counts.get('chest.special') ?? 0)
          return (
            <Link
              key={lay.variant}
              to="/dungeons/$id/layouts/$variant"
              params={{ id: dungeonId, variant: lay.variant }}
              data-testid={`dungeon-layout-card-${lay.variant}`}
              className="group rounded-lg border border-border bg-secondary/30 p-2.5 transition hover:border-primary/60 hover:bg-accent"
            >
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <MapIcon className="size-3.5 text-muted-foreground" aria-hidden />
                {t('dungeon.layout.name', { variant: lay.variant })}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  {TIER_DOT.map(([key, cls]) =>
                    counts.get(key) ? (
                      <span key={key} className="inline-flex items-center gap-0.5">
                        <span className={`size-2 rounded-full ${cls}`} aria-hidden />
                        <span className="tabular-nums">{counts.get(key)}</span>
                      </span>
                    ) : null,
                  )}
                </span>
                {enemies ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Skull className="size-3" aria-hidden />
                    <span className="tabular-nums">{enemies}</span>
                  </span>
                ) : null}
                {chests ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Package className="size-3" aria-hidden />
                    <span className="tabular-nums">{chests}</span>
                  </span>
                ) : null}
              </div>
            </Link>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t('dungeon.layout.note', { count: layouts.length })}
      </p>
    </CatalogSection>
  )
}
