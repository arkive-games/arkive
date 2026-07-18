import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '../../components/ContentPage'
import {
  loadBuildings,
  loadInvaders,
  loadItems,
  type BuildingsBundle,
  type InvadersFile,
  type ItemsBundle,
  type RaidEnemy,
} from '../../lib/catalog'
import { loadPals, type PalsBundle } from '../../lib/pals'
import {
  BuildingLink,
  CatalogDataProvider,
  CatalogPageLoading,
  ItemLink,
  PalLink,
} from '../catalog/components'

/** One wave enemy: a roster pal links to its page; human NPCs render as a
 *  plain chip (they have no detail page); an Otomo companion pal links too. */
function EnemyChip({ e, pals }: { e: RaidEnemy; pals: PalsBundle }) {
  const pal = pals.byId.get(e.char)
  const otomo = e.otomo ? pals.byId.get(e.otomo) : undefined
  return (
    <span className="inline-flex items-center gap-1.5">
      {pal ? (
        <PalLink id={pal.id} name={pals.text[pal.id]?.name ?? pal.id} icon={pal.icon} />
      ) : (
        <span className="rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm">
          {e.char}
        </span>
      )}
      {otomo ? (
        <PalLink id={otomo.id} name={pals.text[otomo.id]?.name ?? otomo.id} icon={otomo.icon} />
      ) : null}
      <span className="text-xs tabular-nums text-muted-foreground">
        ×{e.count} · Lv{e.lvMin === e.lvMax ? e.lvMin : `${e.lvMin}–${e.lvMax}`}
      </span>
    </span>
  )
}

/** Base raids: every invader group by biome — grade band, wave composition
 *  (linked pals / NPC labels with level bands and head counts) and the clear
 *  rewards. Data: data-palworld/invaders.json (DT_PalInvader + Reward). */
export default function RaidsPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [file, setFile] = useState<InvadersFile | null>(null)
  const [pals, setPals] = useState<PalsBundle | null>(null)
  const [items, setItems] = useState<ItemsBundle | null>(null)
  const [buildings, setBuildings] = useState<BuildingsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [biome, setBiome] = useState('all')

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadInvaders(), loadPals(lng), loadItems(lng), loadBuildings(lng)])
      .then(([f, p, i, b]) => {
        if (cancelled) return
        setFile(f)
        setPals(p)
        setItems(i)
        setBuildings(b)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  const biomes = useMemo(() => {
    const seen: string[] = []
    for (const r of file?.raids ?? []) if (!seen.includes(r.biome)) seen.push(r.biome)
    return seen
  }, [file])

  const list = useMemo(
    () => (file?.raids ?? []).filter((r) => biome === 'all' || r.biome === biome),
    [file, biome],
  )

  return (
    <ContentPage
      active="/raids"
      title={t('raids.title', { defaultValue: 'Base Raids' })}
      heading
      maxWidth="max-w-5xl"
    >
      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !file || !pals || !items || !buildings ? (
        <CatalogPageLoading />
      ) : (
        <CatalogDataProvider pals={pals} items={items} buildings={buildings}>
          <p className="mb-3 text-sm text-muted-foreground">
            {t('raids.caption', {
              defaultValue:
                'Invader groups that can attack your base, by biome: base-grade range, wave composition, and clear rewards.',
            })}
          </p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {['all', ...biomes].map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBiome(b)}
                className={
                  'rounded-md px-3 py-1.5 text-sm transition ' +
                  (biome === b
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-accent')
                }
              >
                {b === 'all'
                  ? t('raids.all', { defaultValue: 'All' })
                  : t(`raids.biome.${b}`, { defaultValue: b })}
              </button>
            ))}
            <span className="self-center text-sm text-muted-foreground">{list.length}</span>
          </div>
          <div className="space-y-3">
            {list.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-border bg-card p-4"
                data-testid="raid-card"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                    {t(`raids.biome.${r.biome}`, { defaultValue: r.biome })}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t('raids.grade', { defaultValue: 'Base grade' })}{' '}
                    <span className="tabular-nums">
                      {r.gradeMin === r.gradeMax ? r.gradeMin : `${r.gradeMin}–${r.gradeMax}`}
                    </span>
                  </span>
                  {r.condition ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      {t('raids.condition', { defaultValue: 'Requires placed' })}:
                      <BuildingLink
                        id={r.condition}
                        name={buildings.text[r.condition]?.name ?? r.condition}
                        icon={buildings.byId.get(r.condition)?.icon}
                      />
                    </span>
                  ) : null}
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{r.id}</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {/* Rows can share a Wave number (weighted variant compositions
                      of the same wave) — key by position, label by wave. */}
                  {r.waves.map((w, wi) => (
                    <div key={`${w.wave}-${wi}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {r.waves.length > 1 ? (
                        <span className="w-14 shrink-0 text-xs text-muted-foreground">
                          {t('raids.wave', { defaultValue: 'Wave {{n}}', n: w.wave })}
                        </span>
                      ) : null}
                      {w.enemies.map((e, i) => (
                        <EnemyChip key={`${e.char}-${i}`} e={e} pals={pals} />
                      ))}
                    </div>
                  ))}
                </div>
                {r.rewards.length ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
                    <span className="text-xs text-muted-foreground">
                      {t('raids.rewards', { defaultValue: 'Rewards' })}:
                    </span>
                    {r.rewards.map((rw) => (
                      <span key={rw.item} className="inline-flex items-center gap-1">
                        <ItemLink
                          id={rw.item}
                          name={items.text[rw.item]?.name ?? rw.item}
                          icon={items.byId.get(rw.item)?.icon}
                        />
                        <span className="text-xs tabular-nums text-muted-foreground">
                          ×{rw.min === rw.max ? rw.max : `${rw.min}–${rw.max}`}
                          {rw.rate < 100 ? ` (${rw.rate}%)` : ''}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </CatalogDataProvider>
      )}
    </ContentPage>
  )
}
