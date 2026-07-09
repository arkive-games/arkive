import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearch } from '@tanstack/react-router'
import { Input } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
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
import { buildRegions, makeTechResolvers, type LevelGroup, type TechResolvers } from './techModel'
import { TechTile } from './components/TechTile'

interface Bundles {
  items: ItemsBundle
  buildings: BuildingsBundle
  tech: TechBundle
}

export default function TechnologyPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const { tech: focusId } = useSearch({ from: '/technology' })

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
  const resolvers = useMemo<TechResolvers | null>(
    () => (b ? makeTechResolvers(b.items, b.buildings, b.tech) : null),
    [b],
  )

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

  // Deep link (?tech=<id>): once the tiles are rendered, scroll the target into
  // view. TechTile also draws a highlight ring while the id is focused.
  useEffect(() => {
    if (!b || !focusId) return
    document.getElementById(`tech-${focusId}`)?.scrollIntoView({ block: 'center' })
  }, [b, focusId])

  let body: React.ReactNode
  if (loadError) {
    body = <div className="text-center text-destructive">{loadError}</div>
  } else if (!b || !resolvers) {
    body = <CatalogPageLoading />
  } else {
    body = (
      <div className="grid grid-cols-1 gap-x-2 gap-y-3 md:grid-cols-8">
        {/* Header row: normal (spans 7) + ancient (1). The grid is flush-left
            (no dedicated level column) so the tech squares line up with the
            Items/Buildings grids; the per-row level number hangs in the left
            margin (see TileGrid). */}
        <div className="sticky top-0 z-10 rounded-md bg-sky-500/15 px-3 py-1.5 text-sm font-bold text-sky-800 md:col-span-7 dark:text-sky-200">
          {t('tech.normalTitle')}
        </div>
        <div className="sticky top-0 z-10 rounded-md bg-purple-500/15 px-3 py-1.5 text-sm font-bold text-purple-800 dark:text-purple-200">
          {t('tech.ancientTitle')}
        </div>

        {levels.map(({ level, normal, ancient }) => (
          <Fragment key={level}>
            <TileGrid
              techs={normal}
              ancient={false}
              level={level}
              resolvers={resolvers}
              focusId={focusId}
            />
            <TileGrid techs={ancient} ancient resolvers={resolvers} focusId={focusId} />
          </Fragment>
        ))}

        {levels.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground md:col-span-8">
            {t('tech.empty')}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <ContentPage active="/technology" title={t('tech.title')} heading>
          <div className="mb-4 flex flex-wrap items-center gap-3">
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
    </ContentPage>
  )
}

function TileGrid({
  techs,
  ancient,
  resolvers,
  focusId,
  level,
}: {
  techs: TechEntry[]
  ancient: boolean
  resolvers: TechResolvers
  focusId?: string
  /** Level number, shown as a hanging label to the left of the normal block. */
  level?: number
}) {
  // Normal block spans 7 of the outer columns and subdivides into 7; the ancient
  // block is a single column. Both render even when empty so a level with only
  // one side keeps the other column aligned.
  return (
    <div
      className={
        ancient
          ? 'grid grid-cols-1 gap-2'
          : 'relative grid grid-cols-2 gap-2 sm:grid-cols-3 md:col-span-7 md:grid-cols-7'
      }
    >
      {!ancient && level != null ? (
        <span className="pointer-events-none absolute right-full top-1 mr-2 hidden text-sm font-bold tabular-nums text-muted-foreground md:block">
          {level}
        </span>
      ) : null}
      {techs.map((tech) => (
        <TechTile
          key={tech.id}
          tech={tech}
          resolvers={resolvers}
          highlighted={tech.id === focusId}
        />
      ))}
    </div>
  )
}
