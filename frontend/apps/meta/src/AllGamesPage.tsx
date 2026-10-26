import { useEffect, useMemo, useRef, type CSSProperties, type FormEvent, type MouseEvent } from 'react'
import { scrollToResults } from './scrollToResults'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@gamemap/auth'
import { defineMemoryRecord, isFiniteNumber, isString, memoryPolicy, useMemoryState } from '@gamemap/state-memory'
import {
  IconArrowLeft,
  IconArrowRight,
  IconX,
  IconBookmark,
  IconSearch,
} from '@tabler/icons-react'
import {
  GAME_CATEGORIES,
  countCatalogCategories,
  filterCatalogEntries,
  getGameCategories,
  paginateCatalogEntries,
  type GameCategory,
} from './gameCatalog'
import { siteHref, type SiteCard } from './sites'
import { useUserSystem } from './UserSystemState'
import './all-games.css'

const PAGE_SIZE = 20
const queryRecord = defineMemoryRecord({
  id: 'query', namespace: 'site', surface: 'games-catalog',
  ...memoryPolicy.sessionContext('clear-game-search'),
  schemaVersion: '1.0.0', defaultValue: () => '', validate: isString,
})
const categoryRecord = defineMemoryRecord({
  id: 'category', namespace: 'site', surface: 'games-catalog',
  ...memoryPolicy.sessionContext('clear-game-filters'),
  schemaVersion: '1.0.0', defaultValue: () => 'all' as GameCategory,
  validate: (value: unknown): value is GameCategory => GAME_CATEGORIES.includes(value as GameCategory),
})
const pageRecord = defineMemoryRecord({
  id: 'page', namespace: 'site', surface: 'games-catalog',
  ...memoryPolicy.sessionContext('clear-game-page'),
  schemaVersion: '1.0.0', defaultValue: () => 1,
  validate: (value: unknown): value is number => isFiniteNumber(value) && value >= 1,
})

interface AllGamesPageProps {
  sites: readonly SiteCard[]
  onAuthRequired: () => void
  onOpenSite: (site: SiteCard) => void
}

interface CatalogGame {
  site: SiteCard
  id: string
  categories: ReturnType<typeof getGameCategories>
  searchText: string
}

export function AllGamesPage({ sites, onAuthRequired, onOpenSite }: AllGamesPageProps) {
  const { t } = useTranslation()
  const { status } = useAuth()
  const { state, toggleFavoriteGame } = useUserSystem()
  const [query, setQuery] = useMemoryState(queryRecord, { debounceMs: 200 })
  const [category, setCategory] = useMemoryState(categoryRecord)
  const [page, setPage] = useMemoryState(pageRecord)

  const entries = useMemo<CatalogGame[]>(
    () => sites.map((site) => ({
      site,
      id: site.id,
      categories: getGameCategories(site.id),
      searchText: `${t(site.nameKey)} ${t(site.descKey)} ${site.id} ${t(`catalog.alias.${site.id}`, { defaultValue: '' })}`,
    })),
    [sites, t],
  )
  const allCounts = useMemo(() => countCatalogCategories(entries), [entries])
  const categoryCounts = useMemo(() => countCatalogCategories(filterCatalogEntries(entries, 'all', query)), [entries, query])
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', focusSearch)
    return () => document.removeEventListener('keydown', focusSearch)
  }, [])
  const filteredEntries = useMemo(
    () => filterCatalogEntries(entries, category, query),
    [category, entries, query],
  )
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE))
  // Clamp the RESTORED page against the current filter. A persisted page survives a
  // filter change, and the pager is hidden when totalPages is 1 -- so a stale page 3
  // rendered the empty state with no control to get back.
  const safePage = Math.min(page, totalPages)
  const resultsRef = useRef<HTMLElement>(null)
  const goToPage = (next: number) => {
    setPage(next)
    scrollToResults(resultsRef.current)
  }
  const visibleEntries = paginateCatalogEntries(filteredEntries, safePage, PAGE_SIZE)

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
  }

  return (
    <main className="catalog-main">
      <section className="home-shell catalog-hero" aria-labelledby="catalog-heading">
        <h1 id="catalog-heading" className="sr-only">{t('nav.allGames')}</h1>

        <div className="catalog-controls">
          <form className="catalog-search" role="search" onSubmit={submitSearch}>
            <IconSearch className="size-5 shrink-0" stroke={1.8} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return
                if (query) { setQuery(''); setPage(1) } else inputRef.current?.blur()
              }}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              aria-label={t('catalog.searchLabel')}
              placeholder={t('catalog.searchPlaceholder')}
            />
            {query && <button type="button" className="catalog-search-clear" aria-label={t('catalog.clearSearch')} onClick={() => { setQuery(''); setPage(1); inputRef.current?.focus() }}><IconX className="size-4" /></button>}
            <button type="submit">{t('catalog.searchAction')}</button>
          </form>

          <div className="catalog-categories" aria-label={t('catalog.categoryLabel')}>
            <div>
              {GAME_CATEGORIES.filter((option) => allCounts[option] > 0).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={category === option ? 'is-active' : undefined}
                  aria-pressed={category === option}
                  onClick={() => {
                    setCategory(option)
                    setPage(1)
                  }}
                >
                  <span>{t(`catalog.genre.${option}`)}</span>
                  <small>{categoryCounts[option]}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="home-shell catalog-results" aria-labelledby="catalog-results-heading" ref={resultsRef}>
        <h2 id="catalog-results-heading" className="sr-only">{t('catalog.resultsTitle')}</h2>
        <span className="sr-only" role="status">{t('catalog.resultCount', { count: filteredEntries.length })}</span>

        {visibleEntries.length > 0 ? (
          <div className="catalog-grid">
            {visibleEntries.map((entry) => (
              <CatalogGameCard
                key={entry.site.id}
                game={entry}
                favorite={state.favoriteGameIds.includes(entry.site.id)}
                onFavorite={() => {
                  if (status !== 'authenticated') {
                    onAuthRequired()
                    return
                  }
                  toggleFavoriteGame(entry.site.id)
                }}
                onOpen={() => onOpenSite(entry.site)}
              />
            ))}
          </div>
        ) : (
          <div className="catalog-empty" role="status">
            <IconSearch className="size-8" stroke={1.5} aria-hidden="true" />
            <strong>{t('catalog.emptyTitle')}</strong>
            <p>{t('catalog.emptyDescription')}</p>
          </div>
        )}

        {totalPages > 1 && (
          <nav className="catalog-pagination" aria-label={t('catalog.paginationLabel')}>
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => goToPage(Math.max(1, safePage - 1))}
              aria-label={t('catalog.previousPage')}
            >
              <IconArrowLeft className="size-4" stroke={1.8} />
            </button>
            <span>{t('catalog.pageStatus', { page: safePage, total: totalPages })}</span>
            <button
              type="button"
              disabled={safePage === totalPages}
              onClick={() => goToPage(Math.min(totalPages, safePage + 1))}
              aria-label={t('catalog.nextPage')}
            >
              <IconArrowRight className="size-4" stroke={1.8} />
            </button>
          </nav>
        )}
      </section>
    </main>
  )
}

function CatalogGameCard({
  game,
  favorite: isFavorite,
  onFavorite,
  onOpen,
}: {
  game: CatalogGame
  favorite: boolean
  onFavorite: () => void
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const name = t(game.site.nameKey)
  const handleFavorite = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    onFavorite()
  }

  const href = siteHref(game.site)
  const body = (
    <>
      <span className="catalog-game-cover">
        <img src={game.site.banner} alt="" style={{ objectPosition: game.site.bannerPosition }} />
        <span className="catalog-game-glass" aria-hidden="true" />
      </span>
      <span className="catalog-game-copy">
        <span className="catalog-game-name"><img src={game.site.icon} alt="" /><strong>{name}</strong></span>
        {game.site.comingSoon && <span className="soon-badge">{t('comingSoon.badge')}</span>}
        <small>{t(`catalog.summary.${game.site.id}`, { defaultValue: t(game.site.descKey) })}</small>
      </span>
    </>
  )

  return (
    <article style={{ '--game-color': game.site.color } as CSSProperties} className={game.site.comingSoon ? 'catalog-game-card is-soon' : 'catalog-game-card'}>
      {href ? (
        <a href={href} className="catalog-game-link" onClick={onOpen}>{body}</a>
      ) : (
        <span className="catalog-game-link is-inert">{body}</span>
      )}
      <button
        type="button"
        className={isFavorite ? 'catalog-bookmark is-active' : 'catalog-bookmark'}
        onClick={handleFavorite}
        aria-pressed={isFavorite}
        aria-label={t('action.favorite', { game: name })}
      >
        <IconBookmark className="size-5" stroke={1.8} />
      </button>
    </article>
  )
}
