import { useId, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconArrowRight,
  IconBook2,
  IconCompass,
  IconHistory,
  IconMap2,
  IconSearch,
  IconTool,
} from '@tabler/icons-react'

import { LANGUAGES } from './i18n'
import {
  FEATURES,
  featureHref,
  featuresOf,
  localize,
  searchCatalog,
  type FeatureKind,
  type GameFeature,
  type RecentFeature,
  type SearchHit,
} from './featureCatalog'
import { siteHref, type SiteCard } from './sites'
import { ToolCard } from './ToolCard'

/** Feature links under each game card before the rest fold into "+N". */
const CARD_FEATURE_LIMIT = 4
/**
 * The same on a phone, where two cards share a row: one name plus "+N" is all
 * that fits a half-width card on one line without cutting the name short.
 */
const CARD_FEATURE_LIMIT_PHONE = 1
const SEARCH_RESULT_LIMIT = 8

const KIND_ICONS: Record<FeatureKind, typeof IconTool> = {
  tool: IconTool,
  map: IconMap2,
  wiki: IconBook2,
}

/**
 * The homepage's first screen: every open game and every tool, with a search
 * box over both.
 *
 * The portal is a directory before it is anything else, so this shows what the
 * site has rather than recommending one game from it. Both shelves are plain
 * wrapping grids -- a new game or tool adds a card, not a redesign.
 */
export function HomeDirectory({ sites, continueSiteId, recentlyUsed, onOpenSite, onOpenFeature }: {
  /** In display order; the caller decides whether a recent game leads. */
  sites: readonly SiteCard[]
  continueSiteId?: string
  /** Newest first; the row is omitted while this is empty. */
  recentlyUsed: readonly RecentFeature[]
  onOpenSite: (site: SiteCard) => void
  onOpenFeature: (feature: GameFeature, site: SiteCard) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const tools = FEATURES.filter((feature) => feature.kind === 'tool'
    && sites.some((site) => site.id === feature.gameId && siteHref(site)))

  return (
    <section className="home-shell home-directory" aria-labelledby="home-heading">
      <header className="directory-intro">
        <div>
          <h1 id="home-heading">{t('home.title')}</h1>
          <p>{t('home.description')}</p>
        </div>
        <HomeSearch sites={sites} onOpenSite={onOpenSite} onOpenFeature={onOpenFeature} />
      </header>

      {recentlyUsed.length > 0 && (
        <nav className="directory-recent" aria-label={t('home.recentlyUsed')}>
          <span className="directory-recent-label">
            <IconHistory className="size-4" stroke={1.8} aria-hidden="true" />
            {t('home.recentlyUsed')}
          </span>
          <ul>
            {recentlyUsed.map(({ feature, site }) => {
              const KindIcon = KIND_ICONS[feature.kind]
              return (
                <li key={feature.id}>
                  <a href={featureHref(feature, site)} onClick={() => onOpenFeature(feature, site)}>
                    <KindIcon className="size-4 shrink-0" stroke={1.8} aria-hidden="true" />
                    <strong>{localize(feature.name, language)}</strong>
                    <small>{t(site.nameKey)}</small>
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
      )}

      <section className="directory-section" aria-labelledby="home-games-heading">
        <div className="directory-heading">
          <h2 id="home-games-heading">
            {t('home.games')}
            <span>{t('home.gameCount', { count: sites.length })}</span>
          </h2>
          <a href="#games" className="text-action">
            {t('action.browseAll')}
            <IconArrowRight className="size-4" stroke={1.8} aria-hidden="true" />
          </a>
        </div>
        <div className="directory-games">
          {sites.map((site) => (
            <DirectoryGameCard
              key={site.id}
              site={site}
              continuing={site.id === continueSiteId}
              onOpen={() => onOpenSite(site)}
              onOpenFeature={(feature) => onOpenFeature(feature, site)}
            />
          ))}
        </div>
      </section>

      {tools.length > 0 && (
        <section className="directory-section" aria-labelledby="home-tools-heading">
          <div className="directory-heading">
            <h2 id="home-tools-heading">
              {t('home.tools')}
              <span>{t('home.toolCount', { count: tools.length })}</span>
            </h2>
            <a href="#tools" className="text-action">
              {t('home.allTools')}
              <IconArrowRight className="size-4" stroke={1.8} aria-hidden="true" />
            </a>
          </div>
          <div className="directory-tools">
            {tools.map((tool) => {
              const site = sites.find((item) => item.id === tool.gameId)
              return (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  site={site}
                  onOpen={site ? () => onOpenFeature(tool, site) : undefined}
                />
              )
            })}
          </div>
        </section>
      )}
    </section>
  )
}

function DirectoryGameCard({ site, continuing, onOpen, onOpenFeature }: {
  site: SiteCard
  continuing: boolean
  onOpen: () => void
  onOpenFeature: (feature: GameFeature) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const name = t(site.nameKey)
  const href = siteHref(site)
  // Tools have a shelf of their own just below, so the card lists the rest:
  // the map first, then the encyclopedia pages, in catalog order.
  const pages = featuresOf(site.id)
    .filter((feature) => feature.kind !== 'tool')
    .sort((left, right) => Number(right.kind === 'map') - Number(left.kind === 'map'))
  const shown = pages.slice(0, CARD_FEATURE_LIMIT)
  // A phone shows fewer links per card (CSS hides the rest), so it needs its
  // own count: two "+N" items are rendered and CSS shows the one that fits.
  const hidden = pages.length - shown.length
  const hiddenOnPhone = pages.length - Math.min(pages.length, CARD_FEATURE_LIMIT_PHONE)

  return (
    <article className="directory-game">
      <a href={href} className="directory-game-cover group" onClick={onOpen}>
        <img src={site.bg} alt="" style={{ objectPosition: site.bgPosition }} />
        <span className="directory-game-shade" aria-hidden="true" />
        {continuing && <small>{t('hero.continue')}</small>}
        <strong>{name}</strong>
      </a>
      {shown.length > 0 && (
        <ul className="directory-game-features" aria-label={t('home.featuresOf', { game: name })}>
          {shown.map((feature, index) => (
            <li key={feature.id} className={index >= CARD_FEATURE_LIMIT_PHONE ? 'is-desktop-only' : undefined}>
              <a href={featureHref(feature, site)} onClick={() => onOpenFeature(feature)}>{localize(feature.name, language)}</a>
            </li>
          ))}
          {hidden > 0 && (
            <li className="directory-more is-desktop-only">
              <a href={href} onClick={onOpen} aria-label={t('home.moreFeaturesLabel', { game: name, count: hidden })}>
                +{hidden}
              </a>
            </li>
          )}
          {hiddenOnPhone > 0 && (
            <li className="directory-more is-phone-only">
              <a href={href} onClick={onOpen} aria-label={t('home.moreFeaturesLabel', { game: name, count: hiddenOnPhone })}>
                +{hiddenOnPhone}
              </a>
            </li>
          )}
        </ul>
      )}
    </article>
  )
}

function hitHref(hit: SearchHit): string | undefined {
  return hit.type === 'game' ? siteHref(hit.site) : featureHref(hit.feature, hit.site)
}

/**
 * A combobox over games and their pages. Enter opens the highlighted result
 * (the first by default), so typing "配种" and pressing Enter lands on the
 * breeding calculator without touching the mouse.
 */
function HomeSearch({ sites, onOpenSite, onOpenFeature }: {
  sites: readonly SiteCard[]
  onOpenSite: (site: SiteCard) => void
  onOpenFeature: (feature: GameFeature, site: SiteCard) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const listId = useId()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [active, setActive] = useState(0)

  // Game names live in i18n, so gather every locale's: a visitor on the
  // English UI who types 帕鲁 should still find Palworld.
  const hits = useMemo(() => searchCatalog(
    query,
    sites,
    (site) => LANGUAGES.map((lng) => i18n.getFixedT(lng)(site.nameKey)),
  ).slice(0, SEARCH_RESULT_LIMIT), [i18n, query, sites])

  const showList = expanded && query.trim().length > 0
  const activeIndex = Math.min(active, Math.max(hits.length - 1, 0))

  const open = (hit: SearchHit | undefined) => {
    const href = hit && hitHref(hit)
    if (!hit || !href) return
    if (hit.type === 'feature') onOpenFeature(hit.feature, hit.site)
    else onOpenSite(hit.site)
    window.location.assign(href)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    open(hits[activeIndex])
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setExpanded(false)
      return
    }
    if (!hits.length || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
    event.preventDefault()
    setExpanded(true)
    const step = event.key === 'ArrowDown' ? 1 : -1
    setActive((activeIndex + step + hits.length) % hits.length)
  }

  return (
    <form className="directory-search" role="search" onSubmit={submit}>
      <div className="directory-search-field">
        <IconSearch className="size-5 shrink-0" stroke={1.8} aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-label={t('home.searchLabel')}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && hits.length ? `${listId}-${activeIndex}` : undefined}
          placeholder={t('home.searchPlaceholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setExpanded(true)
          }}
          onFocus={() => setExpanded(true)}
          onBlur={() => setExpanded(false)}
          onKeyDown={onKeyDown}
        />
        <button type="submit">{t('search.action')}</button>
      </div>
      {showList && (
        <ul id={listId} role="listbox" className="directory-search-results" aria-label={t('home.searchResults')}>
          {hits.length === 0 ? (
            <li className="directory-search-empty" role="presentation">{t('home.searchEmpty', { query: query.trim() })}</li>
          ) : hits.map((hit, index) => {
            const KindIcon = hit.type === 'game' ? IconCompass : KIND_ICONS[hit.feature.kind]
            const label = hit.type === 'game' ? t(hit.site.nameKey) : localize(hit.feature.name, language)
            const detail = hit.type === 'game'
              ? t('home.kind.game')
              : `${t(hit.site.nameKey)} · ${t(`home.kind.${hit.feature.kind}`)}`
            return (
              <li
                key={hit.type === 'game' ? `game:${hit.site.id}` : hit.feature.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'is-active' : undefined}
                // Keep focus in the input: a blur would close the list before
                // the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => open(hit)}
              >
                <KindIcon className="size-4 shrink-0" stroke={1.8} aria-hidden="true" />
                <strong>{label}</strong>
                <small>{detail}</small>
              </li>
            )
          })}
        </ul>
      )}
    </form>
  )
}
