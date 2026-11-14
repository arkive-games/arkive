import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  IconArrowRight,
  IconBookmark,
  IconSearch,
  IconTool,
  IconX,
} from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { localize, type GameFeature } from './featureCatalog'
import { GAME_CATEGORIES, prioritizeFavorites } from './gameCatalog'
import { GAME_LOGOS, type SiteCard } from './sites'
import {
  buildToolCatalog,
  filterTools,
  type CatalogTool,
  type ToolFilter,
} from './toolCatalog'
import { TOOL_ICONS } from './toolIcons'
import { useCatalogFavorite } from './useCatalogFavorite'
import { useUserSystem } from './UserSystemState'
import './all-games.css'
import './tools-page.css'

export function ToolsPage({
  sites,
  onOpenFeature,
  onAuthRequired,
}: {
  sites: readonly SiteCard[]
  onOpenFeature: (feature: GameFeature, site: SiteCard) => void
  onAuthRequired: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ToolFilter>('all')
  const inputRef = useRef<HTMLInputElement>(null)
  const { state, toggleFavoriteTool } = useUserSystem()
  const favorite = useCatalogFavorite(toggleFavoriteTool, onAuthRequired)
  const tools = useMemo(() => buildToolCatalog(sites), [sites])
  const names = (tool: CatalogTool) =>
    tool.site
      ? [
          t(tool.site.nameKey),
          t(`catalog.alias.${tool.site.id}`, { defaultValue: '' }),
        ]
      : []
  const searched = filterTools(tools, 'all', query, names)
  const visible = prioritizeFavorites(
    filterTools(searched, filter, '', names),
    favorite.authenticated ? state.favoriteToolIds : [],
  )
  const filters = [...GAME_CATEGORIES, 'other'] as const

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target
      if (
        event.key !== '/' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing
      )
        return
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]',
        )
      )
        return
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
  return (
    <main className="catalog-main tools-main">
      <section
        className="home-shell catalog-hero"
        aria-labelledby="tools-heading"
      >
        <h1 id="tools-heading" className="sr-only">
          {t('toolsLibrary.title')}
        </h1>
        <div className="catalog-controls">
          <form
            className="catalog-search"
            role="search"
            onSubmit={submitSearch}
          >
            <IconSearch
              className="size-5 shrink-0"
              stroke={1.8}
              aria-hidden="true"
            />
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
            {query && (
              <button
                type="button"
                className="catalog-search-clear"
                aria-label={t('toolsLibrary.clearSearch')}
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
              >
                <IconX className="size-4" />
              </button>
            )}
            <button type="submit" aria-label={t('toolsLibrary.searchAction')}>
              <IconArrowRight
                className="size-4"
                stroke={2.2}
                aria-hidden="true"
              />
            </button>
          </form>
          <div
            className="catalog-categories"
            role="group"
            aria-label={t('catalog.categoryLabel')}
          >
            <div>
              {filters.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={filter === value ? 'is-active' : undefined}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  <span>
                    {value === 'other'
                      ? t('catalogStatus.other')
                      : t(`catalog.genre.${value}`)}
                  </span>
                  <small>
                    {filterTools(searched, value, '', names).length}
                  </small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section
        className="home-shell catalog-results"
        aria-labelledby="tools-heading"
      >
        <span className="sr-only" role="status">
          {t('toolsLibrary.resultCount', { count: visible.length })}
        </span>
        {visible.length ? (
          <div className="tools-grid">
            {visible.map((tool) => (
              <LibraryToolCard
                key={tool.id}
                tool={tool}
                language={language}
                query={query}
                favorite={
                  favorite.authenticated &&
                  state.favoriteToolIds.includes(tool.id)
                }
                pending={
                  favorite.pending.includes(tool.id) || favorite.authLoading
                }
                failed={favorite.failed.includes(tool.id)}
                onFavorite={() => void favorite.toggle(tool.id)}
                onOpen={() => {
                  if (tool.feature && tool.site)
                    onOpenFeature(tool.feature, tool.site)
                }}
              />
            ))}
          </div>
        ) : (
          <div className="catalog-empty" role="status">
            <IconSearch className="size-8" stroke={1.5} aria-hidden="true" />
            <strong>
              {t('toolsLibrary.emptyTitle', { query: query.trim() })}
            </strong>
            <p>{t('toolsLibrary.emptyDescription')}</p>
          </div>
        )}
      </section>
    </main>
  )
}

function highlight(text: string, query: string): ReactNode {
  const needle = query.trim().toLocaleLowerCase()
  const index = needle ? text.toLocaleLowerCase().indexOf(needle) : -1
  return index < 0 ? (
    text
  ) : (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  )
}

function LibraryToolCard({
  tool,
  language,
  query,
  favorite,
  pending,
  failed,
  onFavorite,
  onOpen,
}: {
  tool: CatalogTool
  language: string
  query: string
  favorite: boolean
  pending: boolean
  failed: boolean
  onFavorite: () => void
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const ToolIcon = TOOL_ICONS[tool.id] ?? IconTool
  const name = localize(tool.name, language)
  const gameName = tool.site
    ? t(tool.site.nameKey)
    : tool.gameName
      ? localize(tool.gameName, language)
      : ''
  return (
    <article
      className="tools-card"
      style={
        {
          '--game-color': tool.site?.color ?? 'var(--muted-foreground)',
        } as CSSProperties
      }
    >
      <a
        className="tools-card-glyph"
        href={tool.href}
        onClick={onOpen}
        aria-label={name}
      >
        <ToolIcon stroke={1.8} aria-hidden="true" />
      </a>
      <a className="tools-card-name" href={tool.href} onClick={onOpen}>
        {highlight(name, query)}
      </a>
      {tool.description && (
        <a className="tools-card-desc" href={tool.href} onClick={onOpen}>
          {highlight(localize(tool.description, language), query)}
        </a>
      )}
      <div className="tools-card-foot">
        {gameName ? (
          <a className="tools-card-game" href={tool.gameHref ?? tool.href}>
            {tool.site && (
              <img src={tool.site.icon ?? GAME_LOGOS[tool.site.id]} alt="" />
            )}
            {gameName}
          </a>
        ) : (
          <span />
        )}
        <button
          type="button"
          className={`catalog-bookmark tools-card-favorite${favorite ? ' is-active' : ''}`}
          disabled={pending}
          aria-busy={pending || undefined}
          aria-pressed={favorite}
          aria-label={t('catalogStatus.favorite', { name })}
          onClick={onFavorite}
        >
          <IconBookmark className="size-5" aria-hidden="true" />
        </button>
      </div>
      {failed && (
        <div className="tools-card-error" role="alert">
          {t('catalogStatus.failed')}{' '}
          <button type="button" onClick={onFavorite} disabled={pending}>
            {t('catalogStatus.retry')}
          </button>
        </div>
      )}
    </article>
  )
}
