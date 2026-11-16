import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useSearch } from '@tanstack/react-router'
import { ContentPage } from '../../components/ContentPage'
import { MobilePagination, useMobilePagination } from '../../components/MobilePagination'
import { loadPals, type PalsBundle } from '../../lib/pals'
import { palIconUrl } from '../../lib/assets'
import { loadDungeons, dungeonLevelRange, type DungeonsBundle } from '../../lib/dungeons'
import { CatalogPageLoading } from '../catalog/components'

interface Bundles {
  dungeons: DungeonsBundle
  pals: PalsBundle
}

/** Boss-pool preview icons per list row. */
const BOSS_PREVIEW_MAX = 3

export default function DungeonListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const { d: legacyId } = useSearch({ from: '/dungeons' })

  const [b, setB] = useState<Bundles | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadDungeons(lng), loadPals(lng)])
      .then(([dungeons, pals]) => {
        if (!cancelled) setB({ dungeons, pals })
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  // Ascending difficulty (the emit order is alphabetical).
  const ordered = useMemo(
    () =>
      b
        ? [...b.dungeons.file.dungeons].sort(
            (a, c) => a.bonusExpRate - c.bonusExpRate || a.id.localeCompare(c.id),
          )
        : [],
    [b],
  )
  const mobilePaging = useMobilePagination(ordered, { pageSize: 18 })

  // Legacy deep link (/dungeons?d=<id>) → the dungeon's own page.
  if (legacyId) return <Navigate to="/dungeons/$id" params={{ id: legacyId }} replace />

  return (
    <ContentPage browsing={{ section: 'dungeons', ready: !!b, resultsKey: '' }} active="/dungeons" title={t('dungeon.title')} heading>
      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !b ? (
        <CatalogPageLoading />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {mobilePaging.visibleItems.map((d) => {
            const range = dungeonLevelRange(d)
            const bosses = (d.enemies?.boss ?? []).slice(0, BOSS_PREVIEW_MAX)
            return (
                <Link
                  key={d.id}
                  to="/dungeons/$id"
                  params={{ id: d.id }}
                  data-testid="dungeon-row"
                  className="group flex min-h-36 flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 font-semibold text-lg group-hover:text-primary">{b.dungeons.text[d.id]?.name ?? d.id}</div>
                    {range ? <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs tabular-nums text-muted-foreground">Lv. {range.min}–{range.max}</span> : null}
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                      {t('dungeon.expBonus', { rate: d.bonusExpRate })}
                    </span>
                    {bosses.length ? (
                    <span className="flex shrink-0 -space-x-2">
                      {bosses.map((en, i) => {
                        const icon = b.pals.byId.get(en.pal)?.icon
                        return icon ? (
                          <img
                            key={`${en.pal}-${i}`}
                            src={palIconUrl(icon)}
                            alt={b.pals.text[en.pal]?.name ?? en.pal}
                            loading="lazy"
                            className="size-8 rounded-full border-2 border-card bg-card object-contain"
                          />
                        ) : null
                      })}
                    </span>
                  ) : null}
                  </div>
                </Link>
            )
          })}
        </div>
      )}
      <MobilePagination
        page={mobilePaging.page}
        pageCount={mobilePaging.pageCount}
        onPageChange={mobilePaging.goToPage}
      />
    </ContentPage>
  )
}
