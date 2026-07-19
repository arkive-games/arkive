import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Moon } from 'lucide-react'
import { ContentPage } from '../../components/ContentPage'
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

  const [file, setFile] = useState<FishingFile | null>(null)
  const [pals, setPals] = useState<PalsBundle | null>(null)
  const [items, setItems] = useState<ItemsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [area, setArea] = useState('all')

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

  const byArea = useMemo(() => {
    const out = new Map<string, FishingSpot[]>()
    for (const s of file?.spots ?? []) {
      const a = s.area ?? 'other'
      const list = out.get(a) ?? []
      list.push(s)
      out.set(a, list)
    }
    return out
  }, [file])

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

          <h2 className="mb-2 text-lg font-semibold">
            {t('fishing.baits')}
          </h2>
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
                {file.baits.map((b) => (
                  <tr key={b.item} className="border-t border-border/60">
                    <td className="px-3 py-1.5">
                      <ItemLink id={b.item} name={items.text[b.item]?.name ?? b.item} icon={items.byId.get(b.item)?.icon} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{b.attract ? `×${b.attract}` : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{b.hitBar ? `×${b.hitBar}` : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{b.missFight ? `×${b.missFight}` : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {b.palDropBonus || b.itemDropBonus
                        ? `+${b.palDropBonus ?? 0}% / +${b.itemDropBonus ?? 0}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

          <div className="space-y-8">
            {areas
              .filter((a) => area === 'all' || a === area)
              .map((a) => (
                <section key={a}>
                  <h2 className="mb-2 flex items-baseline gap-2 text-lg font-semibold">
                    {areaLabel(a)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {byArea.get(a)!.length} {t('fishing.spots')}
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
                    {byArea.get(a)!.map((s) => (
                      <SpotCard key={s.id} spot={s} pals={pals} t={t} />
                    ))}
                  </div>
                </section>
              ))}
          </div>
        </CatalogDataProvider>
      )}
    </ContentPage>
  )
}
