import { useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  Check,
  ArrowLeft,
  Bookmark,
  BookOpen,
  ChevronRight,
  Compass,
  ExternalLink,
  Gamepad2,
  MapPinned,
  MessageCircle,
  Ghost,
  PawPrint,
  Search,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Wrench,
  X,
} from 'lucide-react'
import { ArkiveMapTopBar, ArkiveMobileHeader, useTheme, type ShellNavItem } from '@gamemap/map-shell'
import { SiteFooter, VersionHistory, resolveChangelog, type ChangelogFile } from '@gamemap/ui'
import { filterGuides, type GuideEntry, type GuideScope, type GuideSort } from './guideCatalog'
import {
  cardFrameVariant,
  countCardsByCategory,
  countCardsByQuality,
  filterCards,
  localizedText,
  stripGameMarkup,
  type CardCategory,
  type CardFilters,
  type CardFrameVariant,
  type WikiCard,
} from './cardCatalog'
import { loadWikiData, type WikiData } from './wikiData'
import { MonsterWiki, PetWiki } from './CreatureWiki'
import { ProfessionWiki } from './ProfessionWiki'
import { TalentWiki } from './TalentWiki'
import { resourceUrl } from './lib/urls'
import heroImage from './assets/ro3-hero.webp'
import emptyImage from './assets/ro3-guide-empty.webp'
import cardFrame01 from './assets/native-ui/card_img_item_01_01.webp'
import cardFrame02 from './assets/native-ui/card_img_item_02_01.webp'
import cardFrame03 from './assets/native-ui/card_img_item_03_01.webp'
import cardFrame04 from './assets/native-ui/card_img_item_04_01.webp'
import cardFrame05 from './assets/native-ui/card_img_item_05_01.webp'
import cardFrame06 from './assets/native-ui/card_img_item_06_01.webp'
import cardFrame07 from './assets/native-ui/card_img_item_07_01.webp'
import cardFrame08 from './assets/native-ui/card_img_item_08_01.webp'
import collectionNamePurple from './assets/native-ui/card_img_item_name_01.webp'
import collectionNameYellow from './assets/native-ui/card_img_item_name_02.webp'
import collectionNameRed from './assets/native-ui/card_img_item_name_03.webp'
import content from './locales/zh-CN.json'
import changelogRaw from './changelog.json'

const HOME_URL = import.meta.env.VITE_HOME_URL
  ?? (import.meta.env.DEV ? 'http://localhost:15172' : 'https://tc-imba.com')

const DESTINATIONS = {
  map: import.meta.env.VITE_RO3_MAP_URL,
  gameplay: import.meta.env.VITE_RO3_GAMEPLAY_URL,
  tools: import.meta.env.VITE_RO3_TOOLS_URL,
}

const WIKI_URL = import.meta.env.VITE_RO3_WIKI_URL
const CHANGELOG = changelogRaw as ChangelogFile
const SITE_VERSION = CHANGELOG.entries[0].version

const CARD_PART_ASSETS: Record<number, string | null> = {
  1: 'icons/other/icon_equip_weapon_02.webp',
  2: 'icons/other/icon_equip_offhand_02.webp',
  3: 'icons/other/icon_equip_armor_02.webp',
  4: 'icons/other/icon_equip_cloak_02.webp',
  5: 'icons/other/icon_equip_shoes_02.webp',
  6: 'icons/other/icon_equip_accessory_02.webp',
  7: 'icons/other/icon_equip_headwear_02.webp',
  8: null,
  9: null,
}

const CARD_FRAME_ASSETS: Record<CardFrameVariant, string> = {
  '01': cardFrame01,
  '02': cardFrame02,
  '03': cardFrame03,
  '04': cardFrame04,
  '05': cardFrame05,
  '06': cardFrame06,
  '07': cardFrame07,
  '08': cardFrame08,
}

const COLLECTION_CARD_NAME_ASSETS: Partial<Record<CardFrameVariant, string>> = {
  '06': collectionNamePurple,
  '07': collectionNameYellow,
  '08': collectionNameRed,
}

const INITIAL_CARD_FILTERS: CardFilters = {
  category: 'ordinary',
  parts: [],
  qualities: [],
  baseAttributes: [],
  primaryAttributes: [],
}

const GUIDES: GuideEntry[] = []

type DestinationKey = keyof typeof DESTINATIONS
type IconComponent = ComponentType<{ 'aria-hidden'?: boolean | 'true' }>
type Page = 'overview' | 'wiki' | 'changelog'
type WikiView = 'skills' | 'talents' | 'cards' | 'pets' | 'monsters'

// Bare `/` opens the encyclopedias rather than the guide hub: the hub has no
// guides yet, so it would land every visitor on an empty state while the
// content that does exist sits one click away. The hub still needs a URL of
// its own, or reload and deep links would silently bounce back to the wiki.
function getInitialPage(): Page {
  if (window.location.pathname.replace(/\/$/, '').endsWith('/changelog')) return 'changelog'
  return new URLSearchParams(window.location.search).get('view') === 'overview' ? 'overview' : 'wiki'
}

function getInitialWikiView(): WikiView {
  const value = new URLSearchParams(window.location.search).get('wiki')
  return value === 'talents' || value === 'cards' || value === 'pets' || value === 'monsters' ? value : 'skills'
}

function App() {
  const { theme, setTheme } = useTheme()
  const [page, setPage] = useState<Page>(getInitialPage)
  const [wikiView, setWikiView] = useState<WikiView>(getInitialWikiView)
  const [query, setQuery] = useState('')
  const [classId, setClassId] = useState('')
  const [dungeonId, setDungeonId] = useState('')
  const [scope, setScope] = useState<GuideScope>('all')
  const [sort, setSort] = useState<GuideSort>('latest')
  const [noticeId, setNoticeId] = useState(0)

  const navItems: ShellNavItem[] = useMemo(() => content.navigation.map((item) => {
    if (item.key !== 'wiki') {
      return { key: item.key, label: item.label, active: item.key === page }
    }
    return {
      key: item.key,
      label: item.label,
      active: page === 'wiki',
      children: [
        {
          key: 'wiki-skills',
          label: content.wiki.tabs.skills,
          active: page === 'wiki' && wikiView === 'skills',
        },
        {
          key: 'wiki-talents',
          label: content.wiki.tabs.talents,
          active: page === 'wiki' && wikiView === 'talents',
        },
        {
          key: 'wiki-cards',
          label: content.wiki.tabs.cards,
          active: page === 'wiki' && wikiView === 'cards',
        },
        {
          key: 'wiki-pets',
          label: content.wiki.tabs.pets,
          active: page === 'wiki' && wikiView === 'pets',
        },
        {
          key: 'wiki-monsters',
          label: content.wiki.tabs.monsters,
          active: page === 'wiki' && wikiView === 'monsters',
        },
      ],
    }
  }), [page, wikiView])

  useEffect(() => {
    document.title = page === 'wiki'
      ? content.wiki.documentTitle
      : page === 'changelog'
        ? content.changelog.documentTitle
        : content.documentTitle
  }, [page])

  useEffect(() => {
    const handlePopState = () => {
      setPage(getInitialPage())
      setWikiView(getInitialWikiView())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!noticeId) return
    const timeout = window.setTimeout(() => setNoticeId(0), 3600)
    return () => window.clearTimeout(timeout)
  }, [noticeId])

  const guides = useMemo(() => filterGuides(GUIDES, {
    scope,
    classId,
    dungeonId,
    query,
    sort,
  }), [classId, dungeonId, query, scope, sort])

  const showUnavailable = () => setNoticeId((value) => value + 1)

  const openDestination = (key: DestinationKey) => {
    const href = DESTINATIONS[key]
    if (href) {
      window.location.assign(href)
      return
    }
    showUnavailable()
  }

  const navigateToPage = (nextPage: Page, nextWikiView: WikiView = wikiView) => {
    const url = new URL(window.location.href)
    url.pathname = nextPage === 'changelog' ? '/changelog' : '/'
    if (nextPage === 'wiki') {
      url.searchParams.set('view', 'wiki')
      url.searchParams.set('wiki', nextWikiView)
    } else if (nextPage === 'overview') {
      url.searchParams.set('view', 'overview')
      url.searchParams.delete('wiki')
    } else {
      url.searchParams.delete('view')
      url.searchParams.delete('wiki')
    }
    window.history.pushState({}, '', url)
    setPage(nextPage)
    setWikiView(nextWikiView)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openWiki = (nextWikiView: WikiView = 'skills') => {
    if (WIKI_URL) {
      const url = new URL(WIKI_URL, window.location.href)
      url.searchParams.set('view', 'wiki')
      url.searchParams.set('wiki', nextWikiView)
      window.location.assign(url)
      return
    }
    navigateToPage('wiki', nextWikiView)
  }

  const handleNavigation = (key: string) => {
    if (key === 'overview') {
      navigateToPage('overview')
      return
    }
    if (key === 'classes' || key === 'dungeons') {
      if (page !== 'overview') navigateToPage('overview')
      setScope(key === 'classes' ? 'class' : 'dungeon')
      window.setTimeout(() => document.querySelector('#guide-browser')?.scrollIntoView({ behavior: 'smooth' }))
      return
    }
    if (key === 'wiki' || key === 'wiki-skills') {
      openWiki('skills')
      return
    }
    if (key === 'wiki-cards') {
      openWiki('cards')
      return
    }
    if (key === 'wiki-talents') {
      openWiki('talents')
      return
    }
    if (key === 'wiki-pets') {
      openWiki('pets')
      return
    }
    if (key === 'wiki-monsters') {
      openWiki('monsters')
      return
    }
    if (key in DESTINATIONS) openDestination(key as DestinationKey)
  }

  const clearFilters = () => {
    setQuery('')
    setClassId('')
    setDungeonId('')
    setScope('all')
    setSort('latest')
  }

  const hasFilters = Boolean(query || classId || dungeonId || scope !== 'all' || sort !== 'latest')

  return (
    <div className="ro3-app">
      <ArkiveMobileHeader
        homeUrl={HOME_URL}
        homeLabel={content.homeLabel}
        brandName={content.brandName}
        pageTitle={content.pageTitle}
        loginLabel={content.login}
        onLogin={showUnavailable}
      />

      <ArkiveMapTopBar
        homeUrl={HOME_URL}
        homeLabel={content.homeLabel}
        brandName={content.brandName}
        brandSlogan={content.brandSlogan}
        nav={{
          items: navItems,
          onDropdownTriggerClick: (item) => {
            if (item.key === 'wiki') openWiki('skills')
          },
          renderItem: (item, className, labelClassName) => (
            <button type="button" className={className} onClick={() => handleNavigation(item.key)}>
              <span data-slot="nav-item-label" className={labelClassName}>{item.label}</span>
            </button>
          ),
        }}
        languageSwitcher={{
          languages: [{ code: 'zh-CN', label: content.language }],
          current: 'zh-CN',
          onChange: () => undefined,
          menuLabel: content.language,
          shortLabel: content.languageShort,
        }}
        themeSwitcher={{
          labels: content.theme,
          current: theme,
          onChange: setTheme,
          menuLabel: content.themeMenu,
          shortLabel: content.themeMenu,
        }}
        loginLabel={content.login}
        onLogin={showUnavailable}
      />

      <nav className="ro3-mobile-nav" aria-label={content.navigationLabel}>
        {navItems.flatMap((item) => item.children ?? [item]).map((item) => (
          <button
            type="button"
            key={item.key}
            className={item.active ? 'is-active' : undefined}
            onClick={() => handleNavigation(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {page === 'wiki' ? (
        <WikiPage view={wikiView} onViewChange={openWiki} />
      ) : page === 'changelog' ? (
        <ChangelogPage onBack={() => navigateToPage('wiki')} />
      ) : (
      <main>
        <section className="ro3-hero" aria-labelledby="ro3-title">
          <img src={heroImage} alt="" />
          <div className="ro3-hero-shade" />
          <div className="ro3-shell ro3-hero-inner">
            <div className="ro3-identity">
              <span>{content.hero.eyebrow}</span>
              <h1 id="ro3-title">{content.hero.title}</h1>
              <p>{content.hero.description}</p>
            </div>
            <label className="ro3-search">
              <Search aria-hidden="true" />
              <span className="sr-only">{content.search.label}</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={content.search.placeholder}
              />
              {query ? (
                <button type="button" aria-label={content.search.clear} onClick={() => setQuery('')}>
                  <X aria-hidden="true" />
                </button>
              ) : null}
            </label>
          </div>
        </section>

        <section className="ro3-entry-band" aria-labelledby="quick-entry-title">
          <div className="ro3-shell">
            <h2 id="quick-entry-title" className="sr-only">{content.entries.title}</h2>
            <div className="ro3-entry-grid">
              <QuickEntry icon={Swords} label={content.entries.classGuides} onClick={() => handleNavigation('classes')} />
              <QuickEntry icon={Compass} label={content.entries.dungeonGuides} onClick={() => handleNavigation('dungeons')} />
              <QuickEntry icon={Gamepad2} label={content.entries.gameplay} onClick={() => openDestination('gameplay')} available={Boolean(DESTINATIONS.gameplay)} />
              <QuickEntry icon={Wrench} label={content.entries.tools} onClick={() => openDestination('tools')} available={Boolean(DESTINATIONS.tools)} />
              <QuickEntry icon={BookOpen} label={content.entries.wiki} onClick={openWiki} />
              <QuickEntry icon={MapPinned} label={content.entries.map} onClick={() => openDestination('map')} available={Boolean(DESTINATIONS.map)} />
            </div>
          </div>
        </section>

        <div className="ro3-shell ro3-layout">
          <div className="ro3-main-column">
            <section id="guide-browser" className="guide-browser" aria-labelledby="guide-heading">
              <div className="section-heading">
                <div>
                  <span>{content.filters.eyebrow}</span>
                  <h2 id="guide-heading">{content.filters.title}</h2>
                </div>
                <div className="scope-tabs" aria-label={content.filters.scopeLabel}>
                  {content.filters.scopes.map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      className={scope === item.key ? 'is-active' : undefined}
                      aria-pressed={scope === item.key}
                      onClick={() => setScope(item.key as GuideScope)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <FilterGroup
                label={content.filters.classLabel}
                value={classId}
                options={content.filters.classes}
                onChange={setClassId}
              />
              <FilterGroup
                label={content.filters.dungeonLabel}
                value={dungeonId}
                options={content.filters.dungeons}
                onChange={setDungeonId}
              />
            </section>

            <section className="guide-stream" aria-labelledby="guide-results-title">
              <div className="guide-toolbar">
                <div>
                  <h2 id="guide-results-title">{content.results.title}</h2>
                  <span>{content.results.count.replace('{count}', String(guides.length))}</span>
                </div>
                <label>
                  <SlidersHorizontal aria-hidden="true" />
                  <span className="sr-only">{content.results.sortLabel}</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value as GuideSort)}>
                    {content.results.sorts.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </label>
              </div>

              {guides.length > 0 ? (
                <div className="guide-list">
                  {guides.map((guide) => <GuideRow key={guide.id} guide={guide} />)}
                </div>
              ) : (
                <div className="guide-empty">
                  <img src={emptyImage} alt="" />
                  <div>
                    <Sparkles aria-hidden="true" />
                    <h3>{hasFilters ? content.results.emptyFilteredTitle : content.results.emptyTitle}</h3>
                    <p>{hasFilters ? content.results.emptyFilteredDescription : content.results.emptyDescription}</p>
                    {hasFilters ? (
                      <button type="button" onClick={clearFilters}>{content.results.clearFilters}</button>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          </div>

          <aside className="ro3-sidebar" aria-label={content.sidebar.title}>
            <DestinationPanel
              icon={MapPinned}
              eyebrow={content.sidebar.map.eyebrow}
              title={content.sidebar.map.title}
              description={content.sidebar.map.description}
              action={content.sidebar.map.action}
              available={Boolean(DESTINATIONS.map)}
              onClick={() => openDestination('map')}
              featured
            />
            <section className="sidebar-section">
              <div className="sidebar-heading">
                <h2>{content.sidebar.resourcesTitle}</h2>
                <span>{content.unavailable}</span>
              </div>
              <DestinationRow icon={Gamepad2} title={content.entries.gameplay} onClick={() => openDestination('gameplay')} available={Boolean(DESTINATIONS.gameplay)} />
              <DestinationRow icon={Wrench} title={content.entries.tools} onClick={() => openDestination('tools')} available={Boolean(DESTINATIONS.tools)} />
              <DestinationRow icon={BookOpen} title={content.entries.wiki} onClick={openWiki} available />
            </section>
            <section className="sidebar-section contribution-section">
              <div>
                <h2>{content.sidebar.contribution.title}</h2>
                <p>{content.sidebar.contribution.description}</p>
              </div>
              <button type="button" disabled>
                {content.sidebar.contribution.action}
                <span>{content.unavailable}</span>
              </button>
            </section>
          </aside>
        </div>
      </main>
      )}

      <SiteFooter
        className={page === 'wiki' ? 'ro3-footer ro3-footer--wiki' : 'ro3-footer'}
        homeUrl={HOME_URL}
        githubUrl={import.meta.env.VITE_GITHUB_URL}
        icpBeian={import.meta.env.VITE_ICP_BEIAN}
        versionLink={(
          <a
            href="/changelog"
            onClick={(event) => {
              event.preventDefault()
              navigateToPage('changelog')
            }}
          >
            v{SITE_VERSION}
          </a>
        )}
      />

      {noticeId > 0 ? (
        <div key={noticeId} className="ro3-toast" role="status" aria-live="polite">
          <span><Sparkles aria-hidden="true" /></span>
          <div>
            <strong>{content.notice.title}</strong>
            <small>{content.notice.description}</small>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ChangelogPage({ onBack }: { onBack: () => void }) {
  const entries = useMemo(() => resolveChangelog(CHANGELOG, 'zh-CN'), [])

  return (
    <main className="ro3-changelog">
      <div className="ro3-shell">
        <button type="button" className="wiki-back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {content.changelog.back}
        </button>
        <header>
          <span>{content.changelog.eyebrow}</span>
          <h1>{content.changelog.title}</h1>
          <p>{content.changelog.description}</p>
        </header>
        <VersionHistory
          entries={entries}
          labels={{
            current: content.changelog.current,
            empty: content.changelog.empty,
            kinds: content.changelog.kinds,
          }}
        />
      </div>
    </main>
  )
}

function WikiPage({ view, onViewChange }: { view: WikiView; onViewChange: (view: WikiView) => void }) {
  const [cardQuery, setCardQuery] = useState('')
  const [cardFilters, setCardFilters] = useState<CardFilters>(INITIAL_CARD_FILTERS)
  const [wikiData, setWikiData] = useState<WikiData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [selectedCard, setSelectedCard] = useState<WikiCard | null>(null)
  const collectionCardIds = useMemo(
    () => new Set(wikiData?.cards.flashCardPools.flatMap((pool) => pool.cards) ?? []),
    [wikiData],
  )
  const cards = useMemo(
    () => filterCards(wikiData?.cards.cards ?? [], cardQuery, cardFilters, collectionCardIds),
    [cardFilters, cardQuery, collectionCardIds, wikiData],
  )

  useEffect(() => {
    if (view !== 'cards' || wikiData) return
    let active = true
    loadWikiData()
      .then((data) => {
        if (!active) return
        setWikiData(data)
        setDataError(false)
      })
      .catch(() => { if (active) setDataError(true) })
    return () => { active = false }
  }, [view, wikiData])

  useEffect(() => {
    if (!selectedCard) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedCard(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedCard])

  return (
    <main className="wiki-page">
      <nav className="ro3-shell wiki-section-nav" aria-label={content.wiki.tabsLabel}>
        <button type="button" className={view === 'skills' ? 'is-active' : undefined} aria-current={view === 'skills' ? 'page' : undefined} onClick={() => onViewChange('skills')}><Swords aria-hidden="true" />{content.wiki.tabs.skills}</button>
        <button type="button" className={view === 'talents' ? 'is-active' : undefined} aria-current={view === 'talents' ? 'page' : undefined} onClick={() => onViewChange('talents')}><Sparkles aria-hidden="true" />{content.wiki.tabs.talents}</button>
        <button type="button" className={view === 'cards' ? 'is-active' : undefined} aria-current={view === 'cards' ? 'page' : undefined} onClick={() => onViewChange('cards')}><BookOpen aria-hidden="true" />{content.wiki.tabs.cards}</button>
        <button type="button" className={view === 'pets' ? 'is-active' : undefined} aria-current={view === 'pets' ? 'page' : undefined} onClick={() => onViewChange('pets')}><PawPrint aria-hidden="true" />{content.wiki.tabs.pets}</button>
        <button type="button" className={view === 'monsters' ? 'is-active' : undefined} aria-current={view === 'monsters' ? 'page' : undefined} onClick={() => onViewChange('monsters')}><Ghost aria-hidden="true" />{content.wiki.tabs.monsters}</button>
      </nav>
      {view === 'skills' ? <ProfessionWiki /> : view === 'talents' ? <TalentWiki /> : view === 'cards' ? (
        <CardWiki
          query={cardQuery}
          filters={cardFilters}
          cards={cards}
          data={wikiData}
          dataError={dataError}
          selectedCard={selectedCard}
          onQueryChange={setCardQuery}
          onFiltersChange={setCardFilters}
          onSelect={setSelectedCard}
        />
      ) : view === 'pets' ? <PetWiki /> : <MonsterWiki />}
    </main>
  )
}

function CardWiki({
  query,
  filters,
  cards,
  data,
  dataError,
  selectedCard,
  onQueryChange,
  onFiltersChange,
  onSelect,
}: {
  query: string
  filters: CardFilters
  cards: WikiCard[]
  data: WikiData | null
  dataError: boolean
  selectedCard: WikiCard | null
  onQueryChange: (query: string) => void
  onFiltersChange: (filters: CardFilters) => void
  onSelect: (card: WikiCard | null) => void
}) {
  const [showFilters, setShowFilters] = useState(false)
  const allCards = data?.cards.cards ?? []
  const collectionCardIds = new Set(data?.cards.flashCardPools.flatMap((pool) => pool.cards) ?? [])
  const categories: Array<{ key: CardCategory; label: string; count: number }> = [
    { key: 'ordinary', label: content.wiki.cards.categories.ordinary, count: countCardsByCategory(allCards, 'ordinary', collectionCardIds) },
    { key: 'collection', label: content.wiki.cards.categories.collection, count: countCardsByCategory(allCards, 'collection', collectionCardIds) },
  ]
  const categoryCards = filters.category === 'ordinary' ? allCards : allCards.filter((card) => collectionCardIds.has(card.id))
  const baseAttributes = data?.cards.attributes.filter((attribute) => attribute.type === 1) ?? []
  const primaryAttributes = data?.cards.attributes.filter((attribute) => attribute.type === 2) ?? []
  const activeFilterCount = filters.parts.length + filters.qualities.length + filters.baseAttributes.length + filters.primaryAttributes.length
  const activeCard = selectedCard && cards.some((card) => card.id === selectedCard.id) ? selectedCard : cards[0] ?? null

  const toggleFilterValue = (key: 'parts' | 'qualities' | 'baseAttributes' | 'primaryAttributes', value: number) => {
    const current = filters[key]
    onFiltersChange({
      ...filters,
      [key]: current.includes(value) ? current.filter((candidate) => candidate !== value) : [...current, value],
    })
  }

  const selectCategory = (category: CardCategory) => {
    onSelect(null)
    onFiltersChange({ ...filters, category })
  }

  const clearFilters = () => onFiltersChange({ ...INITIAL_CARD_FILTERS, category: filters.category })

  return (
    <div className="ro3-shell wiki-card-workspace" role="tabpanel">
      <div className="card-native-layout">
        <section className="card-native-center" aria-labelledby="wiki-cards-title">
          <div className="card-native-center-head">
            <h2 id="wiki-cards-title">{content.wiki.cards.title}</h2>
          </div>
          <div className="card-catalog-toolbar">
            <div className="card-category-tabs" role="tablist" aria-label={content.wiki.cards.filterLabel}>
              {categories.map((category) => (
                <button type="button" role="tab" key={category.key} className={filters.category === category.key ? 'is-active' : undefined} aria-selected={filters.category === category.key} onClick={() => selectCategory(category.key)}>
                  {category.key === 'collection' ? <Sparkles aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
                  <strong>{category.label}</strong>
                  <small>{category.count}</small>
                </button>
              ))}
            </div>
            <div className="card-native-toolbar">
              <button type="button" className={`card-filter-trigger${showFilters ? ' is-active' : ''}`} aria-expanded={showFilters} onClick={() => setShowFilters((visible) => !visible)}>
                <SlidersHorizontal aria-hidden="true" />
                <span>{content.wiki.cards.filters.action}</span>
                {activeFilterCount > 0 ? <strong>{activeFilterCount}</strong> : null}
              </button>
              <label className="wiki-search">
                <Search aria-hidden="true" />
                <span className="sr-only">{content.wiki.cards.searchLabel}</span>
                <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={content.wiki.cards.searchPlaceholder} />
                {query ? <button type="button" aria-label={content.search.clear} onClick={() => onQueryChange('')}><X aria-hidden="true" /></button> : null}
              </label>
            </div>
          </div>
          {showFilters ? (
            <section className="card-filter-panel" aria-label={content.wiki.cards.filters.panelTitle}>
              <header>
                <strong>{content.wiki.cards.filters.panelTitle}</strong>
                <div>
                  <button type="button" onClick={clearFilters} disabled={activeFilterCount === 0}>{content.wiki.cards.filters.clear}</button>
                  <button type="button" aria-label={content.wiki.cards.filters.close} onClick={() => setShowFilters(false)}><X aria-hidden="true" /></button>
                </div>
              </header>
              <CardFilterGroup
                label={content.wiki.cards.filters.part}
                options={Object.keys(CARD_PART_ASSETS).map(Number).map((part) => ({ value: part, label: cardPartLabel(part), count: categoryCards.filter((card) => card.part === part).length }))}
                selected={filters.parts}
                onToggle={(value) => toggleFilterValue('parts', value)}
              />
              <CardFilterGroup
                label={content.wiki.cards.filters.quality}
                options={[1, 2, 3, 4, 5, 6].map((quality) => ({ value: quality, label: content.wiki.cards.quality.replace('{quality}', String(quality)), count: countCardsByQuality(categoryCards, quality) }))}
                selected={filters.qualities}
                onToggle={(value) => toggleFilterValue('qualities', value)}
              />
              <CardFilterGroup
                label={content.wiki.cards.filters.baseAttribute}
                options={baseAttributes.map((attribute) => ({ value: attribute.id, label: localizedText(attribute.name) }))}
                selected={filters.baseAttributes}
                onToggle={(value) => toggleFilterValue('baseAttributes', value)}
              />
              <CardFilterGroup
                label={content.wiki.cards.filters.primaryAttribute}
                options={primaryAttributes.map((attribute) => ({ value: attribute.id, label: localizedText(attribute.name) }))}
                selected={filters.primaryAttributes}
                onToggle={(value) => toggleFilterValue('primaryAttributes', value)}
              />
            </section>
          ) : null}
          <div className="card-catalog-grid" aria-label={content.wiki.cards.title}>
            {dataError ? <div className="wiki-empty">{content.wiki.dataError}</div> : !data ? <div className="wiki-empty">{content.wiki.loading}</div> : cards.length > 0 ? cards.map((card) => <CardTile key={card.id} card={card} collection={filters.category === 'collection'} active={activeCard?.id === card.id} onSelect={onSelect} />) : <div className="wiki-empty">{content.wiki.cards.empty}</div>}
          </div>
        </section>

        <aside className="card-native-detail" aria-label={content.wiki.cards.title}>
          {activeCard && data ? <CardWorkspaceDetail card={activeCard} data={data} /> : <div className="card-detail-empty">{dataError ? content.wiki.dataError : content.wiki.loading}</div>}
        </aside>
      </div>
      {selectedCard && data ? (
        <div className="card-mobile-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) onSelect(null)
        }}>
          <aside className="card-mobile-dialog" role="dialog" aria-modal="true" aria-label={localizedText(selectedCard.name)}>
            <button type="button" className="wiki-dialog-close" aria-label={content.wiki.cards.closeDetail} onClick={() => onSelect(null)}><X aria-hidden="true" /></button>
            <CardWorkspaceDetail card={selectedCard} data={data} />
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function CardFilterGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: Array<{ value: number; label: string; count?: number }>
  selected: number[]
  onToggle: (value: number) => void
}) {
  return (
    <div className="card-filter-group">
      <strong>{label}</strong>
      <div>
        {options.map((option) => (
          <button type="button" key={option.value} className={selected.includes(option.value) ? 'is-active' : undefined} aria-pressed={selected.includes(option.value)} disabled={option.count === 0} onClick={() => onToggle(option.value)}>
            <span>{selected.includes(option.value) ? <Check aria-hidden="true" /> : null}</span>
            {option.label}
            {option.count !== undefined ? <small>{option.count}</small> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

function cardPartLabel(part: number): string {
  return (content.wiki.cards.parts as Record<string, string>)[String(part)] ?? content.wiki.cards.part.replace('{part}', String(part))
}

function CardFrame({ card, collection }: { card: WikiCard; collection: boolean }) {
  const variant = cardFrameVariant(card.quality, collection)
  const frameAsset = variant ? CARD_FRAME_ASSETS[variant] : null
  const collectionNameAsset = variant ? COLLECTION_CARD_NAME_ASSETS[variant] : null
  const cardName = localizedText(card.name)
  const cardNameLength = [...cardName].length
  const cardNameClass = cardNameLength >= 9 ? 'is-extra-long-name' : cardNameLength >= 8 ? 'is-long-name' : undefined

  return (
    <span className={`card-game-frame${collection ? ' is-collection' : ''}`}>
      <span className="card-game-frame-art"><img src={resourceUrl(card.icon)} alt="" loading="lazy" /></span>
      {frameAsset ? <img className="card-game-frame-rarity" src={frameAsset} alt="" aria-hidden="true" /> : null}
      {collectionNameAsset ? (
        <>
          <span className="card-game-frame-nameplate-fill" aria-hidden="true" />
          <img className="card-game-frame-nameplate" src={collectionNameAsset} alt="" aria-hidden="true" />
        </>
      ) : null}
      <strong className={cardNameClass}>{cardName}</strong>
    </span>
  )
}

function CardTile({ card, collection, active, onSelect }: { card: WikiCard; collection: boolean; active: boolean; onSelect: (card: WikiCard) => void }) {
  return (
    <button type="button" className={`card-tile${active ? ' is-active' : ''}`} aria-label={`${localizedText(card.name)}, ${content.wiki.cards.quality.replace('{quality}', String(card.quality))}, ${cardPartLabel(card.part)}`} onClick={() => onSelect(card)}>
      <CardFrame card={card} collection={collection} />
    </button>
  )
}

function CardWorkspaceDetail({ card, data }: { card: WikiCard; data: WikiData }) {
  const attributeById = new Map(data.cards.attributes.map((attribute) => [attribute.id, attribute]))
  const effectById = new Map(data.cards.specialEffects.map((effect) => [effect.id, effect]))
  const effectIds = [...new Set(card.tiers.flatMap((tier) => tier.specialEffects))]
  return (
    <>
      <header className="card-detail-heading">
        <h3>{localizedText(card.name)}</h3>
        <span>{content.wiki.cards.quality.replace('{quality}', String(card.quality))} · {cardPartLabel(card.part)}</span>
      </header>
      <h4 className="card-detail-section-title">{content.wiki.cards.attributesTitle}</h4>
      <div className="card-detail-tiers">
        {card.tiers.map((tier) => (
          <section key={tier.configId}>
            <header><strong>{content.wiki.cards.tier.replace('{tier}', String(tier.tier + 1))}</strong><span>{content.wiki.cards.power.replace('{power}', String(tier.power))}</span></header>
            <small>{content.wiki.cards.requiredLevel.replace('{level}', String(tier.level))}</small>
            <div>{tier.attributes.map(([attributeId, value]) => {
              const attribute = attributeById.get(attributeId)
              return <span key={attributeId}>{localizedText(attribute?.name) || content.wiki.cards.attributeId.replace('{id}', String(attributeId))} +{value}</span>
            })}</div>
          </section>
        ))}
      </div>
      {effectIds.length > 0 ? <div className="card-detail-series"><strong>{content.wiki.cards.specialEffects}</strong>{effectIds.map((effectId) => <span key={effectId}>{stripGameMarkup(localizedText(effectById.get(effectId)?.description) || content.wiki.cards.effectId.replace('{id}', String(effectId)))}</span>)}</div> : null}
    </>
  )
}

function QuickEntry({
  icon: Icon,
  label,
  onClick,
  available = true,
}: {
  icon: IconComponent
  label: string
  onClick: () => void
  available?: boolean
}) {
  return (
    <button type="button" className="quick-entry" onClick={onClick}>
      <span><Icon aria-hidden="true" /></span>
      <strong>{label}</strong>
      {!available ? <small>{content.unavailable}</small> : <ChevronRight aria-hidden="true" />}
    </button>
  )
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ key: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className="filter-group">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            type="button"
            key={option.key}
            className={value === option.key ? 'is-active' : undefined}
            aria-pressed={value === option.key}
            onClick={() => onChange(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function GuideRow({ guide }: { guide: GuideEntry }) {
  return (
    <article className="guide-row">
      {guide.coverUrl ? <img src={guide.coverUrl} alt="" /> : null}
      <div>
        <span className="guide-scope">{guide.scope}</span>
        <h3><a href={guide.href}>{guide.title}</a></h3>
        <p>{guide.summary}</p>
        <div className="guide-author">
          {guide.author.avatarUrl ? <img src={guide.author.avatarUrl} alt="" /> : <span />}
          <strong>{guide.author.name}</strong>
          <time dateTime={guide.updatedAt}>{guide.updatedAt}</time>
        </div>
      </div>
      <div className="guide-signals">
        <span><Bookmark aria-hidden="true" />{guide.savedCount}</span>
        <span><MessageCircle aria-hidden="true" />{guide.replyCount}</span>
      </div>
    </article>
  )
}

function DestinationPanel({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  available,
  onClick,
  featured = false,
}: {
  icon: IconComponent
  eyebrow: string
  title: string
  description: string
  action: string
  available: boolean
  onClick: () => void
  featured?: boolean
}) {
  return (
    <section className={featured ? 'destination-panel is-featured' : 'destination-panel'}>
      <span className="destination-eyebrow"><Icon aria-hidden="true" />{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button" onClick={onClick}>
        {available ? action : content.unavailable}
        {available ? <ExternalLink aria-hidden="true" /> : null}
      </button>
    </section>
  )
}

function DestinationRow({
  icon: Icon,
  title,
  available,
  onClick,
}: {
  icon: IconComponent
  title: string
  available: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className="destination-row" onClick={onClick}>
      <span><Icon aria-hidden="true" /></span>
      <strong>{title}</strong>
      <small>{available ? content.sidebar.open : content.unavailable}</small>
      <ChevronRight aria-hidden="true" />
    </button>
  )
}

// Kept as small, data-oriented building blocks for the legacy detail routes.
export default App
