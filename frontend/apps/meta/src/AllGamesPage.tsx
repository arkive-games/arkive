import { useMemo, type FormEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@gamemap/auth'
import { defineMemoryRecord, isFiniteNumber, isString, memoryPolicy, useMemoryState } from '@gamemap/state-memory'
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowUpRight,
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
      searchText: `${t(site.nameKey)} ${t(site.descKey)}`,
    })),
    [sites, t],
  )
  const categoryCounts = useMemo(() => countCatalogCategories(entries), [entries])
  const filteredEntries = useMemo(
    () => filterCatalogEntries(entries, category, query),
    [category, entries, query],
  )
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE))
  const visibleEntries = paginateCatalogEntries(filteredEntries, page, PAGE_SIZE)

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
  }

  return (
    <main className="catalog-main">
      <section className="home-shell catalog-hero" aria-labelledby="catalog-heading">
        <div className="catalog-hero-copy">
          <p className="catalog-eyebrow">
            <span aria-hidden="true" />
            {t('catalog.eyebrow')}
          </p>
          <h1 id="catalog-heading">{t('catalog.title')}</h1>
          <p className="catalog-intro">{t('catalog.description')}</p>
        </div>

        <div className="catalog-controls">
          <form className="catalog-search" role="search" onSubmit={submitSearch}>
            <IconSearch className="size-5 shrink-0" stroke={1.8} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              aria-label={t('catalog.searchPlaceholder')}
              placeholder={t('catalog.searchPlaceholder')}
            />
            <button type="submit">{t('catalog.searchAction')}</button>
          </form>

          <div className="catalog-categories" aria-label={t('catalog.categoryLabel')}>
            <span>{t('catalog.categoryLabel')}</span>
            <div>
              {GAME_CATEGORIES.map((option) => (
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

      <section className="home-shell catalog-results" aria-labelledby="catalog-results-heading">
        <div className="catalog-results-heading">
          <h2 id="catalog-results-heading">{t('catalog.resultsTitle')}</h2>
          <p aria-live="polite">{t('catalog.resultCount', { count: filteredEntries.length })}</p>
        </div>

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
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setCategory('all')
                setPage(1)
              }}
            >
              {t('catalog.clearAction')}
            </button>
          </div>
        )}

        {totalPages > 1 && (
          <nav className="catalog-pagination" aria-label={t('catalog.paginationLabel')}>
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label={t('catalog.previousPage')}
            >
              <IconArrowLeft className="size-4" stroke={1.8} />
            </button>
            <span>{t('catalog.pageStatus', { page, total: totalPages })}</span>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
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
        <img src={game.site.bg} alt={name} />
        <span className="catalog-game-shade" aria-hidden="true" />
        {href && (
          <span className="catalog-game-open" aria-hidden="true">
            <IconArrowUpRight className="size-5" stroke={1.8} />
          </span>
        )}
      </span>
      <span className="catalog-game-copy">
        <strong>{name}</strong>
        {game.site.comingSoon && <span className="soon-badge">{t('comingSoon.badge')}</span>}
        {game.categories.length > 0 && (
          <span className="catalog-game-genres">
            {game.categories.map((item) => (
              <span key={item}>{t(`catalog.genre.${item}`)}</span>
            ))}
          </span>
        )}
        <small>{t(game.site.descKey)}</small>
      </span>
    </>
  )

  return (
    <article className={game.site.comingSoon ? 'catalog-game-card is-soon' : 'catalog-game-card'}>
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
