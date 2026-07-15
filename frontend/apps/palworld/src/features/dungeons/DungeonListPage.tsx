import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useSearch } from '@tanstack/react-router'
import { ContentPage } from '../../components/ContentPage'
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

  // Legacy deep link (/dungeons?d=<id>) → the dungeon's own page.
  if (legacyId) return <Navigate to="/dungeons/$id" params={{ id: legacyId }} replace />

  return (
    <ContentPage active="/dungeons" title={t('dungeon.title')} heading>
      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !b ? (
        <CatalogPageLoading />
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border bg-card">
          {ordered.map((d) => {
            const range = dungeonLevelRange(d)
            const bosses = (d.enemies?.boss ?? []).slice(0, BOSS_PREVIEW_MAX)
            return (
              <li key={d.id}>
                <Link
                  to="/dungeons/$id"
                  params={{ id: d.id }}
                  data-testid="dungeon-row"
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{b.dungeons.text[d.id]?.name ?? d.id}</div>
                    <div className="font-mono text-xs text-muted-foreground">{d.id}</div>
                  </div>
                  {range ? (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      Lv. {range.min}–{range.max}
                    </span>
                  ) : null}
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                    {t('dungeon.expBonus', { rate: d.bonusExpRate })}
                  </span>
                  {bosses.length ? (
                    <span className="hidden shrink-0 -space-x-2 sm:flex">
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
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </ContentPage>
  )
}
