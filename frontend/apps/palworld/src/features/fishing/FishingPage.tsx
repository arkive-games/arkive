import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Moon } from 'lucide-react'
import { useIsMobile } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { MobilePagination, useMobilePagination } from '../../components/MobilePagination'
import { loadFishing, type FishingFile, type FishingSpot } from '../../lib/fishing'
import { loadItems, type ItemsBundle } from '../../lib/catalog'
import { loadPals, type PalsBundle } from '../../lib/pals'
import {
  CatalogDataProvider,
  CatalogPageLoading,
  ItemLink,
  PalLink,
} from '../catalog/components'

const TIER_STYLE: Record<string, string> = {
  Easy: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  Normal: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  Hard: 'bg-red-500/15 text-red-600 dark:text-red-400',
}

function SpotCard({
  spot,
  pals,
  t,
}: {
  spot: FishingSpot
  pals: PalsBundle
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3" data-testid="fishing-spot">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        {spot.spotDifficulty ? (
          <span
            className={
              'rounded px-1.5 py-0.5 text-xs font-medium ' +
              (TIER_STYLE[spot.spotDifficulty] ?? 'bg-secondary text-secondary-foreground')
            }
          >
            {t(`fishing.tier.${spot.spotDifficulty}`, { defaultValue: spot.spotDifficulty })}
          </span>
        ) : null}
        <span className="font-mono text-xs text-muted-foreground">{spot.id}</span>
      </div>
      <div className="divide-y divide-border/60">
        {spot.fish.map((f, i) => (
          <div key={`${f.shadow}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 text-sm">
            <PalLink id={f.pal} name={pals.text[f.pal]?.name ?? f.pal} icon={pals.byId.get(f.pal)?.icon} />
            {f.alpha ? (
              <span className="rounded bg-red-500/15 px-1 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                {t('fishing.alpha')}
              </span>
            ) : null}
            <span className="rounded bg-secondary px-1 py-0.5 text-xs text-secondary-foreground">
              {t('fishing.shadow')} {f.size}
            </span>
            {f.night ? <Moon className="size-3.5 text-indigo-400" aria-label={t('pal.nightOnly')} /> : null}
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
              Lv{f.lvMin === f.lvMax ? f.lvMin : `${f.lvMin}–${f.lvMax}`}
            </span>
            <span className="w-12 shrink-0 text-right tabular-nums">{f.sharePct}%</span>
            {f.rare || (f.boss && !f.alpha) || f.king ? (
              <span className="shrink-0 text-xs text-fuchsia-500">
                {[
                  f.rare ? `${t('fishing.rare')} ${f.rare}%` : null,
                  f.boss && !f.alpha ? `${t('fishing.alpha')} ${f.boss}%` : null,
                  f.king ? `${t('fishing.king')} ${f.king}%` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Fishing catalog: bait modifiers + every fishing-spot lottery grouped by
 *  region — the fish (pals) each shadow resolves to, draw share, level band,
 *  day/night gate and special-variant rates. Data: data-palworld/fishing.json. */
export default function FishingPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const isMobile = useIsMobile()

  const [file, setFile] = useState<FishingFile | null>(null)
  const [pals, setPals] = useState<PalsBundle | null>(null)
  const [items, setItems] = useState<ItemsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [area, setArea] = useState('all')
  const [mobileSection, setMobileSection] = useState<'baits' | 'regions'>('baits')

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadFishing(), loadPals(lng), loadItems(lng)])
      .then(([f, p, i]) => {
        if (cancelled) return
        setFile(f)
        setPals(p)
        setItems(i)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  const areas = useMemo(() => {
    const seen: string[] = []
    for (const s of file?.spots ?? []) {
      const a = s.area ?? 'other'
      if (!seen.includes(a)) seen.push(a)
    }
    return seen
  }, [file])

  const areaLabel = (a: string) =>
    items?.areaLabels[a] ?? t(`bp.area.${a}`, { defaultValue: a })

  const filteredSpots = useMemo(
    () => (file?.spots ?? []).filter((spot) => area === 'all' || (spot.area ?? 'other') === area),
    [area, file],
  )
  const mobilePaging = useMobilePagination(filteredSpots, { pageSize: 12, resetKey: area })
  const displayedByArea = useMemo(() => {
    const out = new Map<string, FishingSpot[]>()
    for (const s of mobilePaging.visibleItems) {
      const a = s.area ?? 'other'
      const list = out.get(a) ?? []
      list.push(s)
      out.set(a, list)
    }
    return out
  }, [mobilePaging.visibleItems])
  const displayedAreas = areas.filter((candidate) => displayedByArea.has(candidate))

  return (
    <ContentPage
      active="/fishing"
      title={t('fishing.title')}
      heading
      maxWidth="max-w-5xl"
    >
      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !file || !pals || !items ? (
        <CatalogPageLoading />
      ) : (
        <CatalogDataProvider pals={pals} items={items}>
          <p className="mb-3 text-sm text-muted-foreground">
            {t('fishing.caption')}
          </p>

          {isMobile ? (
            <div
              className="mb-4 grid grid-cols-2 gap-0.5 rounded-lg border border-primary/30 bg-primary/5 p-0.5"
              role="tablist"
              aria-label={t('fishing.title')}
            >
              <button
                type="button"
                role="tab"
                aria-selected={mobileSection === 'baits'}
                onClick={() => setMobileSection('baits')}
                className={
                  'rounded-md px-3 py-2 text-sm font-medium transition ' +
                  (mobileSection === 'baits'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-primary hover:bg-primary/10')
                }
              >
                {t('fishing.baits')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileSection === 'regions'}
                onClick={() => setMobileSection('regions')}
                className={
                  'rounded-md px-3 py-2 text-sm font-medium transition ' +
                  (mobileSection === 'regions'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-primary hover:bg-primary/10')
                }
              >
                {t('mapRegion')}
              </button>
            </div>
          ) : null}

          {!isMobile || mobileSection === 'baits' ? (
            <section>
              <h2 className="mb-2 text-lg font-semibold">
                {t('fishing.baits')}
              </h2>
              {isMobile ? (
                <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
                  {file.baits.map((bait) => (
                    <article
                      key={bait.item}
                      className="rounded-lg border border-primary/25 bg-card p-3 shadow-sm"
                    >
                      <ItemLink
                        id={bait.item}
                        name={items.text[bait.item]?.name ?? bait.item}
                        icon={items.byId.get(bait.item)?.icon}
                      />
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{t('fishing.attract')}</dt>
                          <dd className="tabular-nums">
                            {bait.attract ? `×${bait.attract}` : '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{t('fishing.hitBar')}</dt>
                          <dd className="tabular-nums">
                            {bait.hitBar ? `×${bait.hitBar}` : '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{t('fishing.missFight')}</dt>
                          <dd className="tabular-nums">
                            {bait.missFight ? `×${bait.missFight}` : '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{t('fishing.dropBonus')}</dt>
                          <dd className="tabular-nums">
                            {bait.palDropBonus || bait.itemDropBonus
                              ? `+${bait.palDropBonus ?? 0}% / +${bait.itemDropBonus ?? 0}%`
                              : '—'}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mb-6 overflow-x-auto rounded-lg border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">{t('fishing.bait')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('fishing.attract')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('fishing.hitBar')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('fishing.missFight')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('fishing.dropBonus')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {file.baits.map((bait) => (
                        <tr key={bait.item} className="border-t border-border/60">
                          <td className="px-3 py-1.5">
                            <ItemLink
                              id={bait.item}
                              name={items.text[bait.item]?.name ?? bait.item}
                              icon={items.byId.get(bait.item)?.icon}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {bait.attract ? `×${bait.attract}` : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {bait.hitBar ? `×${bait.hitBar}` : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {bait.missFight ? `×${bait.missFight}` : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {bait.palDropBonus || bait.itemDropBonus
                              ? `+${bait.palDropBonus ?? 0}% / +${bait.itemDropBonus ?? 0}%`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {!isMobile || mobileSection === 'regions' ? (
            <section>
              {isMobile ? (
                <div className="mb-4">
                  <label
                    htmlFor="fishing-region"
                    className="mb-1.5 block text-xs font-semibold text-muted-foreground"
                  >
                    {t('mapRegion')}
                  </label>
                  <select
                    id="fishing-region"
                    value={area}
                    onChange={(event) => setArea(event.target.value)}
                    className="h-11 w-full rounded-lg border border-primary bg-card px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary/25"
                  >
                    <option value="all">{t('fishing.all')}</option>
                    {areas.map((candidate) => (
                      <option key={candidate} value={candidate}>
                        {areaLabel(candidate)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {['all', ...areas].map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setArea(a)}
                      className={
                        'rounded-md px-3 py-1.5 text-sm transition ' +
                        (area === a
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground hover:bg-accent')
                      }
                    >
                      {a === 'all' ? t('fishing.all') : areaLabel(a)}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-8">
                {displayedAreas.map((a) => (
                  <section key={a}>
                    <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-lg font-semibold">
                      {areaLabel(a)}
                      <span className="text-sm font-normal text-muted-foreground">
                        {displayedByArea.get(a)!.length} {t('fishing.spots')}
                      </span>
                      <Link
                        to="/regions/$id"
                        params={{ id: a }}
                        className="text-sm font-normal text-primary hover:underline"
                      >
                        {t('fishing.viewRegion')}
                      </Link>
                    </h2>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {displayedByArea.get(a)!.map((s) => (
                        <SpotCard key={s.id} spot={s} pals={pals} t={t} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <MobilePagination
                page={mobilePaging.page}
                pageCount={mobilePaging.pageCount}
                onPageChange={mobilePaging.goToPage}
              />
            </section>
          ) : null}
        </CatalogDataProvider>
      )}
    </ContentPage>
  )
}
