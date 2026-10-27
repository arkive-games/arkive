import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { IconArrowRight, IconSearch, IconTool, IconX } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { FEATURES, featureHref, localize, matchesTool, type GameFeature } from './featureCatalog'
import { GAME_LOGOS, siteHref, type SiteCard } from './sites'
import { TOOL_ICONS } from './toolIcons'
import './all-games.css'
import './tools-page.css'

/**
 * Every tool on every open game, filtered by game and by a search box that
 * looks only at tools. The controls reuse the All Games page's capsule and
 * search styles so the two library pages read as one family.
 */
export function ToolsPage({ sites, onOpenFeature }: {
  sites: readonly SiteCard[]
  onOpenFeature: (feature: GameFeature, site: SiteCard) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const [query, setQuery] = useState('')
  const [gameId, setGameId] = useState<string>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  const tools = useMemo(() => FEATURES.flatMap((tool) => {
    const site = sites.find((item) => item.id === tool.gameId && siteHref(item))
    return tool.kind === 'tool' && site ? [{ tool, site }] : []
  }), [sites])
  // Games in the portal's fixed order, each listed only when it has a tool.
  const games = sites.filter((site) => tools.some((entry) => entry.site.id === site.id))
  const gameNames = (site: SiteCard) => [t(site.nameKey), t(`catalog.alias.${site.id}`, { defaultValue: '' })]
  const searched = tools.filter(({ tool, site }) => matchesTool(tool, query, gameNames(site)))
  const visible = searched.filter(({ site }) => gameId === 'all' || site.id === gameId)

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]')) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', focusSearch)
    return () => document.removeEventListener('keydown', focusSearch)
  }, [])

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    inputRef.current?.blur()
  }
  const filters = [
    { id: 'all', label: t('toolsLibrary.all'), icon: undefined, count: searched.length },
    ...games.map((site) => ({
      id: site.id,
      label: t(site.nameKey),
      icon: site.icon ?? GAME_LOGOS[site.id],
      count: searched.filter((entry) => entry.site.id === site.id).length,
    })),
  ]

  return (
    <main className="catalog-main tools-main">
      <section className="home-shell catalog-hero" aria-labelledby="tools-heading">
        <h1 id="tools-heading" className="sr-only">{t('toolsLibrary.title')}</h1>

        <div className="catalog-controls">
          <form className="catalog-search" role="search" onSubmit={submitSearch}>
            <IconSearch className="size-5 shrink-0" stroke={1.8} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return
                if (query) setQuery('')
                else inputRef.current?.blur()
              }}
              aria-label={t('toolsLibrary.searchLabel')}
              placeholder={t('toolsLibrary.searchPlaceholder')}
              autoComplete="off"
            />
            {query && <button type="button" className="catalog-search-clear" aria-label={t('toolsLibrary.clearSearch')} onClick={() => { setQuery(''); inputRef.current?.focus() }}><IconX className="size-4" /></button>}
            <button type="submit" aria-label={t('toolsLibrary.searchAction')}><IconArrowRight className="size-4" stroke={2.2} aria-hidden="true" /></button>
          </form>

          <div className="catalog-categories" role="group" aria-label={t('toolsLibrary.filterLabel')}>
            <div>
              {filters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={gameId === filter.id ? 'is-active' : undefined}
                  aria-pressed={gameId === filter.id}
                  onClick={() => setGameId(filter.id)}
                >
                  {filter.icon && <img className="tools-filter-icon" src={filter.icon} alt="" />}
                  <span>{filter.label}</span>
                  <small>{filter.count}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="home-shell catalog-results" aria-labelledby="tools-heading">
        <span className="sr-only" role="status">{t('toolsLibrary.resultCount', { count: visible.length })}</span>
        {visible.length > 0 ? (
          <div className="tools-grid">
            {visible.map(({ tool, site }) => (
              <LibraryToolCard
                key={tool.id}
                tool={tool}
                site={site}
                language={language}
                query={query}
                onOpen={() => onOpenFeature(tool, site)}
              />
            ))}
          </div>
        ) : (
          <div className="catalog-empty" role="status">
            <IconSearch className="size-8" stroke={1.5} aria-hidden="true" />
            <strong>{t('toolsLibrary.emptyTitle', { query: query.trim() })}</strong>
            <p>{t('toolsLibrary.emptyDescription')}</p>
          </div>
        )}
      </section>
    </main>
  )
}

/** Wraps the first case-insensitive occurrence of `query` in `<mark>`. */
function highlight(text: string, query: string): ReactNode {
  const needle = query.trim().toLocaleLowerCase()
  const index = needle ? text.toLocaleLowerCase().indexOf(needle) : -1
  if (index < 0) return text
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + needle.length)}</mark>{text.slice(index + needle.length)}</>
}

/**
 * A tools-page card: a glyph tinted with the game's colour, the tool's name
 * and two lines of description, then its game. The frame stays neutral; the
 * game colour fills it only on hover, as on the All Games page.
 */
function LibraryToolCard({ tool, site, language, query, onOpen }: {
  tool: GameFeature
  site: SiteCard
  language: string
  query: string
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const href = featureHref(tool, site)
  const ToolIcon = TOOL_ICONS[tool.id] ?? IconTool
  if (!href) return null

  return (
    <a className="tools-card" href={href} onClick={onOpen} style={{ '--game-color': site.color ?? 'var(--muted-foreground)' } as CSSProperties}>
      <span className="tools-card-glyph" aria-hidden="true"><ToolIcon stroke={1.8} /></span>
      <strong className="tools-card-name">{highlight(localize(tool.name, language), query)}</strong>
      {tool.description && <p className="tools-card-desc">{highlight(localize(tool.description, language), query)}</p>}
      <span className="tools-card-foot">
        <span className="tools-card-game"><img src={site.icon ?? GAME_LOGOS[site.id]} alt="" />{t(site.nameKey)}</span>
        <span className="tools-card-open" aria-hidden="true">{t('toolsLibrary.open')}<IconArrowRight className="size-3.5" stroke={2.2} /></span>
      </span>
    </a>
  )
}
