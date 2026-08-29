import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from 'react'
import {
  Check,
  ArrowLeft,
  Bookmark,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Compass,
  Database,
  ExternalLink,
  Gamepad2,
  GitBranch,
  Hash,
  Layers3,
  MapPinned,
  MessageCircle,
  Search,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Wrench,
  X,
  Zap,
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
import {
  filterWikiSkillIds,
  WIKI_CLIENT_VERSION,
  WIKI_PROFESSION_LINES,
  WIKI_PROFESSION_STAGES,
  WIKI_PACKAGE_SOURCE,
  WIKI_SKILL_COUNT,
  WIKI_STAGE_BY_ID,
  type WikiProfessionLine,
  type WikiProfessionStage,
} from './wikiCatalog'
import { loadSkillLevels, loadWikiData, type SkillIndexEntry, type SkillLevelRow, type WikiData } from './wikiData'
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

const roleAssetModules = import.meta.glob('./assets/roles/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const roleAssets = Object.entries(roleAssetModules).map(([modulePath, path]) => ({
  name: modulePath.split('/').pop()?.replace(/\.png$/, '') ?? '',
  path,
}))

function getProfessionAsset(lineId: string) {
  return roleAssets.find((asset) => asset.name.startsWith(`icon_role_${lineId}_`))?.path ?? null
}

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
type WikiView = 'skills' | 'cards'

interface SelectedSkill {
  stage: WikiProfessionStage
  skillId: string
  skill?: SkillIndexEntry
}

function getInitialPage(): Page {
  if (window.location.pathname.replace(/\/$/, '').endsWith('/changelog')) return 'changelog'
  return 'wiki'
}

function getInitialWikiView(): WikiView {
  return new URLSearchParams(window.location.search).get('wiki') === 'cards' ? 'cards' : 'skills'
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
          key: 'wiki-cards',
          label: content.wiki.tabs.cards,
          active: page === 'wiki' && wikiView === 'cards',
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
        {navItems.map((item) => (
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
        className="ro3-footer"
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
  const [lineId, setLineId] = useState(WIKI_PROFESSION_LINES[0]?.id ?? '')
  const [stageId, setStageId] = useState('')
  const [query, setQuery] = useState('')
  const [cardQuery, setCardQuery] = useState('')
  const [cardFilters, setCardFilters] = useState<CardFilters>(INITIAL_CARD_FILTERS)
  const [wikiData, setWikiData] = useState<WikiData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [selectedCard, setSelectedCard] = useState<WikiCard | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<SelectedSkill | null>(null)
  const line = WIKI_PROFESSION_LINES.find((candidate) => candidate.id === lineId) ?? WIKI_PROFESSION_LINES[0]
  const lineStageIds = line ? [line.baseStageId, ...line.paths.flat()] : []
  const lineStages = lineStageIds.flatMap((id) => {
    const stage = WIKI_STAGE_BY_ID.get(id)
    return stage ? [stage] : []
  })
  const skillIndex = useMemo(() => new Map(
    wikiData?.skills.skills.map((skill) => [skill.iSkillID, skill]) ?? [],
  ), [wikiData])
  const collectionCardIds = useMemo(
    () => new Set(wikiData?.cards.flashCardPools.flatMap((pool) => pool.cards) ?? []),
    [wikiData],
  )
  const skills = line ? filterWikiSkillIds(line.id, stageId, query, skillIndex) : []
  const cards = useMemo(
    () => filterCards(wikiData?.cards.cards ?? [], cardQuery, cardFilters, collectionCardIds),
    [cardFilters, cardQuery, collectionCardIds, wikiData],
  )

  useEffect(() => {
    let active = true
    loadWikiData()
      .then((data) => {
        if (!active) return
        setWikiData(data)
        setDataError(false)
      })
      .catch(() => {
        if (active) setDataError(true)
      })
    return () => { active = false }
  }, [])

  const selectLine = (nextLineId: string) => {
    setLineId(nextLineId)
    setStageId('')
  }

  useEffect(() => {
    if (!selectedSkill) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedSkill(null)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedSkill])

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
      <header className="wiki-masthead">
        <div className="ro3-shell wiki-masthead-inner">
          <div className="wiki-title-block">
            <span>{content.wiki.eyebrow}</span>
            <h1>{view === 'skills' ? content.wiki.skillsPageTitle : content.wiki.cardsPageTitle}</h1>
            <p>{view === 'skills' ? content.wiki.skillsPageDescription : content.wiki.cardsPageDescription}</p>
          </div>
          <div className="wiki-view-tabs" role="tablist" aria-label={content.wiki.tabsLabel}>
            <button type="button" role="tab" aria-selected={view === 'skills'} className={view === 'skills' ? 'is-active' : undefined} onClick={() => onViewChange('skills')}>
              <Swords aria-hidden="true" />
              {content.wiki.tabs.skills}
            </button>
            <button type="button" role="tab" aria-selected={view === 'cards'} className={view === 'cards' ? 'is-active' : undefined} onClick={() => onViewChange('cards')}>
              <BookOpen aria-hidden="true" />
              {content.wiki.tabs.cards}
            </button>
          </div>
          <div className="wiki-stats" aria-label={view === 'skills' ? content.wiki.skillsPageTitle : content.wiki.cardsPageTitle}>
            {view === 'skills' ? (
              <>
                <WikiStat icon={GitBranch} value={WIKI_PROFESSION_LINES.length} label={content.wiki.stats.lines} />
                <WikiStat icon={Layers3} value={WIKI_PROFESSION_STAGES.length} label={content.wiki.stats.stages} />
                <WikiStat icon={Hash} value={wikiData?.skills.counts.skills ?? WIKI_SKILL_COUNT} label={content.wiki.stats.skills} />
                <WikiStat icon={Database} value={wikiData?.version.gameVersion ?? WIKI_CLIENT_VERSION} label={content.wiki.stats.version} />
              </>
            ) : (
              <>
                <WikiStat icon={BookOpen} value={wikiData?.cards.counts.cards ?? 0} label={content.wiki.stats.cards} />
                <WikiStat icon={Layers3} value={wikiData?.cards.counts.tiers ?? 0} label={content.wiki.stats.baseCards} />
                <WikiStat icon={Sparkles} value={wikiData?.cards.counts.cardsWithIcon ?? 0} label={content.wiki.stats.collections} />
                <WikiStat icon={Database} value={wikiData?.version.gameVersion ?? WIKI_CLIENT_VERSION} label={content.wiki.stats.version} />
              </>
            )}
          </div>
        </div>
      </header>

      {view === 'skills' ? (
      <div className="ro3-shell wiki-content" role="tabpanel">
        <aside className="wiki-line-nav" aria-label={content.wiki.lineLabel}>
          <span>{content.wiki.lineLabel}</span>
          <div>
            {WIKI_PROFESSION_LINES.map((candidate) => {
              const stageIds = [candidate.baseStageId, ...candidate.paths.flat()]
              const skillCount = stageIds.reduce((count, id) => count + (WIKI_STAGE_BY_ID.get(id)?.skillIds.length ?? 0), 0)
              return (
                <button
                  type="button"
                  key={candidate.id}
                  className={candidate.id === line?.id ? 'is-active' : undefined}
                  aria-pressed={candidate.id === line?.id}
                  onClick={() => selectLine(candidate.id)}
                >
                  <span className="wiki-line-nav-art">
                    {getProfessionAsset(candidate.id) ? <img src={getProfessionAsset(candidate.id) ?? undefined} alt="" loading="lazy" /> : <Swords aria-hidden="true" />}
                  </span>
                  <span className="wiki-line-nav-copy">
                    <strong>{candidate.label}</strong>
                    <small>{content.wiki.skillCount.replace('{count}', String(skillCount))}</small>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </aside>

        <div className="wiki-main">
          <section className="skill-native-workspace" aria-labelledby="wiki-skills-title">
            <div className="skill-native-bar">
              <span className="skill-native-bar-title">{content.wiki.tabs.skills}</span>
              <span className="skill-native-bar-state">{content.wiki.stats.version} {wikiData?.version.gameVersion ?? WIKI_CLIENT_VERSION}</span>
            </div>

            <div className="skill-native-header">
              <div className="skill-native-profession">
                <span className="skill-native-profession-icon">
                  {line && getProfessionAsset(line.id) ? <img src={getProfessionAsset(line.id) ?? undefined} alt="" /> : <Swords aria-hidden="true" />}
                </span>
                <div>
                  <span>{content.wiki.progressionEyebrow}</span>
                  <h2 id="wiki-skills-title">{line?.label ?? content.wiki.skillsPageTitle}</h2>
                </div>
              </div>
              <div className="skill-native-points">
                <span>{content.wiki.loadedSkills}</span>
                <strong>{skills.filter((entry) => entry.skill).length}</strong>
                <small>{content.wiki.configReady}</small>
              </div>
              <label className="wiki-stage-filter skill-native-school">
                <span className="sr-only">{content.wiki.stage}</span>
                <select value={stageId} onChange={(event) => setStageId(event.target.value)}>
                  <option value="">{content.wiki.allStages}</option>
                  {lineStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
                </select>
              </label>
            </div>

            <div className="skill-native-toolbar">
              <label className="wiki-search">
                <Search aria-hidden="true" />
                <span className="sr-only">{content.wiki.searchLabel}</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={content.wiki.searchPlaceholder}
                />
                {query ? (
                  <button type="button" aria-label={content.search.clear} onClick={() => setQuery('')}>
                    <X aria-hidden="true" />
                  </button>
                ) : null}
              </label>
              <span>{content.wiki.resultCount.replace('{count}', String(skills.length))}</span>
            </div>

            <div className="skill-native-tree" aria-label={content.wiki.skillsTitle}>
              <div className="skill-native-rail" aria-hidden="true">
                {['I', 'II', 'II+', 'III'].map((tier) => <span key={tier}>{tier}</span>)}
              </div>
              <div className="skill-native-canvas">
                <div className="skill-native-grid-lines" aria-hidden="true" />
                {dataError ? <div className="wiki-empty">{content.wiki.dataError}</div> : !wikiData ? <div className="wiki-empty">{content.wiki.loading}</div> : skills.length > 0 ? skills.map(({ stage, skillId, evidence, skill }, index) => (
                  <WikiSkillNode
                    key={skillId}
                    stage={stage}
                    skillId={skillId}
                    skill={skill}
                    evidence={evidence}
                    index={index}
                    onSelect={() => setSelectedSkill({ stage, skillId, skill })}
                  />
                )) : <div className="wiki-empty">{content.wiki.empty}</div>}
              </div>
            </div>
            <div className="skill-native-footer">
              <button type="button" onClick={() => setStageId('')}><Swords aria-hidden="true" />{content.wiki.progressionTitle}</button>
              <span><Database aria-hidden="true" />{content.wiki.sourceNote} <code>{wikiData?.version.version ?? content.wiki.loading}</code></span>
            </div>
          </section>
        </div>
      </div>
      ) : (
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
      )}
      {selectedSkill ? <SkillDetail key={selectedSkill.skillId} skill={selectedSkill} data={wikiData} onClose={() => setSelectedSkill(null)} /> : null}
    </main>
  )
}

function ProfessionSummary({
  line,
  stages,
}: {
  line: WikiProfessionLine
  stages: WikiProfessionStage[]
}) {
  const skillCount = stages.reduce((count, stage) => count + stage.skillIds.length, 0)

  return (
    <section className="wiki-profession-summary" aria-labelledby="wiki-profession-summary-title">
      <div className="wiki-profession-summary-icon">
        {getProfessionAsset(line.id) ? <img src={getProfessionAsset(line.id) ?? undefined} alt="" /> : <Swords aria-hidden="true" />}
      </div>
      <div className="wiki-profession-summary-copy">
        <span>{content.wiki.professionSummary.eyebrow}</span>
        <h3 id="wiki-profession-summary-title">{line.label}</h3>
        <p>{content.wiki.professionSummary.description
          .replace('{stages}', String(stages.length))
          .replace('{paths}', String(line.paths.length))}</p>
      </div>
      <dl className="wiki-profession-summary-stats">
        <div><dt>{content.wiki.professionSummary.stageCount}</dt><dd>{stages.length}</dd></div>
        <div><dt>{content.wiki.professionSummary.pathCount}</dt><dd>{line.paths.length}</dd></div>
        <div><dt>{content.wiki.professionSummary.skillCount}</dt><dd>{skillCount}</dd></div>
      </dl>
    </section>
  )
}

function WikiSkillNode({
  stage,
  skillId,
  skill,
  evidence,
  index,
  onSelect,
}: {
  stage: WikiProfessionStage
  skillId: string
  skill?: SkillIndexEntry
  evidence: { eventName: string }
  index: number
  onSelect: () => void
}) {
  const column = index % 4
  const row = Math.floor(index / 4)
  const name = skill?.name?.['zh-CN']

  return (
    <button
      type="button"
      className="skill-native-node"
      style={{ '--skill-column': column + 1, '--skill-row': row + 1 } as CSSProperties}
      onClick={onSelect}
      aria-label={`${stage.label} ${name ?? skillId}`}
      title={evidence.eventName}
    >
      <span className="skill-native-node-icon">
        {skill?.icon ? <img src={resourceUrl(skill.icon)} alt="" loading="lazy" /> : <Zap aria-hidden="true" />}
      </span>
      <strong>0/{skill?.iMaxLevel ?? '--'}</strong>
      <span>{name ?? `${content.wiki.skillId} ${skillId}`}</span>
    </button>
  )
}

function SkillDetail({
  skill,
  data,
  onClose,
}: {
  skill: SelectedSkill
  data: WikiData | null
  onClose: () => void
}) {
  const [levels, setLevels] = useState<SkillLevelRow[] | null>(null)
  const [levelError, setLevelError] = useState(false)
  const name = skill.skill?.name?.['zh-CN'] ?? content.wiki.skillDetail.title.replace('{id}', skill.skillId)

  useEffect(() => {
    let active = true
    if (!skill.skill || !data) return
    loadSkillLevels(skill.skill, data.skills.shards)
      .then((rows) => {
        if (active) setLevels(rows)
      })
      .catch(() => {
        if (active) setLevelError(true)
      })
    return () => { active = false }
  }, [data, skill])

  return (
    <div className="wiki-skill-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="wiki-skill-dialog" role="dialog" aria-modal="true" aria-labelledby="wiki-skill-dialog-title">
        <button type="button" className="wiki-dialog-close" aria-label={content.wiki.skillDetail.close} onClick={onClose}>
          <X aria-hidden="true" />
        </button>
        <header className="wiki-skill-dialog-header">
          <div className="wiki-skill-dialog-icon">
            {skill.skill?.icon ? <img src={resourceUrl(skill.skill.icon)} alt="" /> : <Zap aria-hidden="true" />}
          </div>
          <div>
            <span>{content.wiki.skillDetail.eyebrow}</span>
            <h2 id="wiki-skill-dialog-title">{name}</h2>
            <p>{skill.stage.label} · {content.wiki.tier.replace('{tier}', String(skill.stage.tier))}</p>
          </div>
        </header>
        <div className="wiki-skill-dialog-body">
          <div className="wiki-skill-detail-status">
            <CheckCircle2 aria-hidden="true" />
            <div>
              <strong>{content.wiki.skillDetail.confirmedTitle}</strong>
              <span>{content.wiki.skillDetail.confirmedDescription}</span>
            </div>
          </div>
          <dl className="wiki-skill-detail-grid">
            <div><dt>{content.wiki.skillDetail.skillId}</dt><dd><code>{skill.skillId}</code></dd></div>
            <div><dt>{content.wiki.skillDetail.profession}</dt><dd>{skill.stage.label}</dd></div>
            <div><dt>{content.wiki.skillDetail.maxLevel}</dt><dd>{skill.skill?.iMaxLevel ?? content.wiki.skillDetail.unavailable}</dd></div>
            <div><dt>{content.wiki.skillDetail.source}</dt><dd>{WIKI_PACKAGE_SOURCE.label}</dd></div>
          </dl>
          <section className="wiki-skill-levels" aria-label={content.wiki.skillDetail.values}>
            <h3>{content.wiki.skillDetail.values}</h3>
            {levelError ? <div className="wiki-empty">{content.wiki.dataError}</div> : levels === null ? (
              <div className="wiki-empty">{content.wiki.loading}</div>
            ) : levels.length === 0 ? (
              <div className="wiki-empty">{content.wiki.skillDetail.unavailable}</div>
            ) : levels.map((level) => (
              <article key={level.iID} className="wiki-skill-level-row">
                <strong>{content.wiki.skillDetail.level.replace('{level}', String(level.iLevel))}</strong>
                <p>{stripGameMarkup(level.desc?.['zh-CN'] ?? content.wiki.skillDetail.unavailable)}</p>
                <dl>
                  {level.kDamageParam1?.length ? <div><dt>{content.wiki.skillDetail.damageParam}</dt><dd>{formatConfigValues(level.kDamageParam1)}</dd></div> : null}
                  {level.kDamageParam2?.length ? <div><dt>{content.wiki.skillDetail.extraParam}</dt><dd>{formatConfigValues(level.kDamageParam2)}</dd></div> : null}
                  {level.kCost?.length ? <div><dt>{content.wiki.skillDetail.cost}</dt><dd>{formatConfigValues(level.kCost)}</dd></div> : null}
                  {level.iDistanceMax !== undefined ? <div><dt>{content.wiki.skillDetail.range}</dt><dd>{level.iDistanceMax}</dd></div> : null}
                  {level.iTargetMax !== undefined ? <div><dt>{content.wiki.skillDetail.targets}</dt><dd>{level.iTargetMax}</dd></div> : null}
                </dl>
              </article>
            ))}
          </section>
        </div>
      </section>
    </div>
  )
}

function formatConfigValues(value: unknown[]): string {
  return value.flat(3).map(String).join(' / ')
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
            <div><span>{content.wiki.cards.description}</span><h2 id="wiki-cards-title">{content.wiki.cards.title}</h2></div>
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
          <div className="card-catalog-strip">
            <div className="card-category-tabs" role="tablist" aria-label={content.wiki.cards.filterLabel}>
              {categories.map((category) => (
                <button type="button" role="tab" key={category.key} className={filters.category === category.key ? 'is-active' : undefined} aria-selected={filters.category === category.key} onClick={() => selectCategory(category.key)}>
                  {category.key === 'collection' ? <Sparkles aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
                  <strong>{category.label}</strong>
                  <small>{category.count}</small>
                </button>
              ))}
            </div>
            <span>{content.wiki.cards.resultCount.replace('{count}', String(cards.length))}</span>
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
                options={[2, 3, 4, 5, 6].map((quality) => ({ value: quality, label: content.wiki.cards.quality.replace('{quality}', String(quality)), count: countCardsByQuality(categoryCards, quality) }))}
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
          <div className="card-native-source"><Database aria-hidden="true" /><span>{content.wiki.cards.sourceNote} <code>{data?.version.version ?? content.wiki.loading}</code></span></div>
        </section>

        <aside className="card-native-detail" aria-label={content.wiki.cards.title}>
          {activeCard && data ? <CardWorkspaceDetail card={activeCard} data={data} collection={filters.category === 'collection'} /> : <div className="card-detail-empty">{dataError ? content.wiki.dataError : content.wiki.loading}</div>}
        </aside>
      </div>
      {selectedCard && data ? (
        <div className="card-mobile-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) onSelect(null)
        }}>
          <aside className="card-mobile-dialog" role="dialog" aria-modal="true" aria-label={localizedText(selectedCard.name)}>
            <button type="button" className="wiki-dialog-close" aria-label={content.wiki.cards.closeDetail} onClick={() => onSelect(null)}><X aria-hidden="true" /></button>
            <CardWorkspaceDetail card={selectedCard} data={data} collection={filters.category === 'collection'} />
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

function CardPartIcon({ part }: { part: number }) {
  const asset = CARD_PART_ASSETS[part]
  return asset ? <img src={resourceUrl(asset)} alt="" /> : <Sparkles aria-hidden="true" />
}

function CardFrame({ card, collection }: { card: WikiCard; collection: boolean }) {
  const variant = cardFrameVariant(card.quality, collection)
  const frameAsset = variant ? CARD_FRAME_ASSETS[variant] : null
  const collectionNameAsset = variant ? COLLECTION_CARD_NAME_ASSETS[variant] : null

  return (
    <span className={`card-game-frame${collection ? ' is-collection' : ''}`}>
      <span className="card-game-frame-art"><img src={resourceUrl(card.icon)} alt="" loading="lazy" /></span>
      {frameAsset ? <img className="card-game-frame-rarity" src={frameAsset} alt="" aria-hidden="true" /> : null}
      <span className="card-game-frame-part" aria-label={cardPartLabel(card.part)} title={cardPartLabel(card.part)}>
        <span className="card-game-frame-part-icon"><CardPartIcon part={card.part} /></span>
      </span>
      {collectionNameAsset ? <img className="card-game-frame-nameplate" src={collectionNameAsset} alt="" aria-hidden="true" /> : null}
      <strong>{localizedText(card.name)}</strong>
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

function CardWorkspaceDetail({ card, data, collection }: { card: WikiCard; data: WikiData; collection: boolean }) {
  const attributeById = new Map(data.cards.attributes.map((attribute) => [attribute.id, attribute]))
  const effectById = new Map(data.cards.specialEffects.map((effect) => [effect.id, effect]))
  const effectIds = [...new Set(card.tiers.flatMap((tier) => tier.specialEffects))]
  return (
    <>
      <div className="card-detail-state"><CheckCircle2 aria-hidden="true" />{content.wiki.cards.configConfirmed}</div>
      <div className="card-detail-heading">
        <span className="card-detail-thumb"><CardFrame card={card} collection={collection} /></span>
        <div><h3>{localizedText(card.name)}</h3><span>{content.wiki.cards.quality.replace('{quality}', String(card.quality))} · {cardPartLabel(card.part)}</span></div>
      </div>
      <section className="card-detail-effects"><h4>{content.wiki.cards.descriptionTitle}</h4><p>{stripGameMarkup(localizedText(card.description))}</p></section>
      <dl className="card-detail-meta">
        <div><dt>{content.wiki.cards.cardId}</dt><dd><code>{card.id}</code></dd></div>
        <div><dt>{content.wiki.cards.stackLimit}</dt><dd>{card.stackLimit}</dd></div>
        <div><dt>{content.wiki.cards.trade}</dt><dd>{card.tradable ? content.wiki.cards.yes : content.wiki.cards.no}</dd></div>
      </dl>
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

function WikiStat({
  icon: Icon,
  value,
  label,
}: {
  icon: IconComponent
  value: number | string
  label: string
}) {
  return (
    <div>
      <Icon aria-hidden="true" />
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function WikiStageCard({
  stage,
  active,
  onSelect,
  compact = false,
}: {
  stage?: WikiProfessionStage
  active: boolean
  onSelect: (id: string) => void
  compact?: boolean
}) {
  if (!stage) return null

  return (
    <button
      type="button"
      className={`wiki-stage-card${compact ? ' is-compact' : ''}${active ? ' is-active' : ''}`}
      aria-pressed={active}
      onClick={() => onSelect(active ? '' : stage.id)}
    >
      <span>{content.wiki.tier.replace('{tier}', String(stage.tier))}</span>
      <strong>{stage.label}</strong>
      <b>{content.wiki.skillCount.replace('{count}', String(stage.skillIds.length))}</b>
    </button>
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
// The native workspaces above own the visible composition for this page.
void ProfessionSummary
void WikiStageCard

export default App
