import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@gamemap/ui'
import { TopNav } from '../../components/TopNav'
import {
  loadItems,
  loadBuildings,
  loadTech,
  type ItemsBundle,
  type BuildingsBundle,
  type TechBundle,
  type TechEntry,
} from '../../lib/catalog'
import { CatalogPageLoading } from '../catalog/components'
import { buildRegions, techImage, type LevelGroup } from './techModel'
import { TechTile, type ResolvedTechImage, type TechResolvers } from './components/TechTile'

interface Bundles {
  items: ItemsBundle
  buildings: BuildingsBundle
  tech: TechBundle
}

export default function TechnologyPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [b, setB] = useState<Bundles | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadItems(lng), loadBuildings(lng), loadTech(lng)])
      .then(([items, buildings, tech]) => {
        if (!cancelled) setB({ items, buildings, tech })
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  const nameOf = useMemo(
    () => (tech: TechEntry) => b?.tech.text[tech.id]?.name ?? tech.id,
    [b],
  )

  // Lookups every tile needs for its square + hover-card details.
  const resolvers = useMemo<TechResolvers | null>(() => {
    if (!b) return null
    return {
      name: nameOf,
      description: (tech) => b.tech.text[tech.id]?.description,
      image: (tech): ResolvedTechImage | null => {
        const ref = techImage(tech)
        if (!ref) return null
        const icon =
          ref.kind === 'item'
            ? b.items.byId.get(ref.id)?.icon
            : b.buildings.byId.get(ref.id)?.icon
        return icon ? { kind: ref.kind, icon } : null
      },
      requireTechName: (tech) =>
        tech.requireTech ? (b.tech.text[tech.requireTech]?.name ?? tech.requireTech) : undefined,
      iname: (id) => b.items.text[id]?.name ?? id,
      bname: (id) => b.buildings.text[id]?.name ?? id,
      itemIcon: (id) => b.items.byId.get(id)?.icon,
      buildingIcon: (id) => b.buildings.byId.get(id)?.icon,
    }
  }, [b, nameOf])

  const regions = useMemo(() => {
    if (!b) return { normal: [] as LevelGroup[], ancient: [] as LevelGroup[] }
    return buildRegions(b.tech.techs, nameOf, query)
  }, [b, nameOf, query])

  // Union of levels present in either region, so the two columns stay aligned.
  const levels = useMemo(() => {
    const normalByLevel = new Map(regions.normal.map((g) => [g.level, g.techs]))
    const ancientByLevel = new Map(regions.ancient.map((g) => [g.level, g.techs]))
    const all = [...new Set([...normalByLevel.keys(), ...ancientByLevel.keys()])].sort(
      (x, y) => x - y,
    )
    return all.map((level) => ({
      level,
      normal: normalByLevel.get(level) ?? [],
      ancient: ancientByLevel.get(level) ?? [],
    }))
  }, [regions])

  const matchCount = useMemo(
    () =>
      regions.normal.reduce((n, g) => n + g.techs.length, 0) +
      regions.ancient.reduce((n, g) => n + g.techs.length, 0),
    [regions],
  )

  let body: React.ReactNode
  if (loadError) {
    body = <div className="text-center text-destructive">{loadError}</div>
  } else if (!b || !resolvers) {
    body = <CatalogPageLoading />
  } else {
    body = (
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-[3rem_minmax(0,1fr)_auto]">
        {/* Header row */}
        <div className="hidden md:block" />
        <div className="sticky top-0 z-10 rounded-md bg-sky-500/15 px-3 py-1.5 text-sm font-bold text-sky-800 dark:text-sky-200">
          {t('tech.normalTitle')}
        </div>
        <div className="sticky top-0 z-10 rounded-md bg-purple-500/15 px-3 py-1.5 text-sm font-bold text-purple-800 dark:text-purple-200">
          {t('tech.ancientTitle')}
        </div>

        {levels.map(({ level, normal, ancient }) => (
          <Fragment key={level}>
            <div className="pt-1 text-sm font-bold tabular-nums text-muted-foreground md:text-right">
              {level}
            </div>
            <TileGrid techs={normal} ancient={false} resolvers={resolvers} />
            <TileGrid techs={ancient} ancient resolvers={resolvers} />
          </Fragment>
        ))}

        {levels.length === 0 ? (
          <div className="md:col-span-3 py-8 text-center text-muted-foreground">
            {t('tech.empty')}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopNav active="/technology" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{t('tech.title')}</h1>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('tech.searchPlaceholder')}
              className="max-w-xs"
            />
            {b ? (
              <span className="text-sm text-muted-foreground">
                {t('tech.count', { count: matchCount })}
              </span>
            ) : null}
          </div>
          {body}
        </div>
      </div>
    </div>
  )
}

function TileGrid({
  techs,
  ancient,
  resolvers,
}: {
  techs: TechEntry[]
  ancient: boolean
  resolvers: TechResolvers
}) {
  if (techs.length === 0) return <div className="hidden md:block" />
  return (
    <div className={ancient ? 'flex flex-col gap-2' : 'flex flex-wrap gap-2'}>
      {techs.map((tech) => (
        <TechTile key={tech.id} tech={tech} resolvers={resolvers} />
      ))}
    </div>
  )
}
