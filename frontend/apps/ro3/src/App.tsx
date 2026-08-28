import { useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Compass,
  CircleHelp,
  Database,
  ExternalLink,
  Gamepad2,
  GitBranch,
  Hash,
  Layers3,
  MapPinned,
  MessageCircle,
  Search,
  ShieldCheck,
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
  CARD_CLIENT_VERSION,
  CARD_ASSET_COUNT,
  CARD_ASSET_REFERENCES,
  CARD_COUNTS,
  CARD_SOURCE,
  filterCards,
  type CardKind,
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
  type WikiProfessionStage,
  type WikiSkillDetail,
  getWikiSkillAsset,
  getWikiSkillDetail,
} from './wikiCatalog'
import heroImage from './assets/ro3-hero.webp'
import emptyImage from './assets/ro3-guide-empty.webp'
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

const GUIDES: GuideEntry[] = []

type DestinationKey = keyof typeof DESTINATIONS
type IconComponent = ComponentType<{ 'aria-hidden'?: boolean | 'true' }>
type Page = 'overview' | 'wiki' | 'changelog'
type WikiView = 'skills' | 'cards'

function getInitialPage(): Page {
  if (window.location.pathname.replace(/\/$/, '').endsWith('/changelog')) return 'changelog'
  return new URLSearchParams(window.location.search).get('view') === 'wiki' ? 'wiki' : 'overview'
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
        <WikiPage view={wikiView} />
      ) : page === 'changelog' ? (
        <ChangelogPage onBack={() => navigateToPage('overview')} />
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

function WikiPage({ view }: { view: WikiView }) {
  const [lineId, setLineId] = useState(WIKI_PROFESSION_LINES[0]?.id ?? '')
  const [stageId, setStageId] = useState('')
  const [query, setQuery] = useState('')
  const [cardQuery, setCardQuery] = useState('')
  const [cardKind, setCardKind] = useState<CardKind>('all')
  const [selectedCard, setSelectedCard] = useState<WikiCard | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<WikiSkillDetail | null>(null)
  const line = WIKI_PROFESSION_LINES.find((candidate) => candidate.id === lineId) ?? WIKI_PROFESSION_LINES[0]
  const lineStageIds = line ? [line.baseStageId, ...line.paths.flat()] : []
  const lineStages = lineStageIds.flatMap((id) => {
    const stage = WIKI_STAGE_BY_ID.get(id)
    return stage ? [stage] : []
  })
  const skills = line ? filterWikiSkillIds(line.id, stageId, query) : []
  const cards = useMemo(() => filterCards(cardQuery, cardKind), [cardKind, cardQuery])

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

  return (
    <main className="wiki-page">
      <header className="wiki-masthead">
        <div className="ro3-shell wiki-masthead-inner">
          <div className="wiki-title-block">
            <span>{content.wiki.eyebrow}</span>
            <h1>{view === 'skills' ? content.wiki.skillsPageTitle : content.wiki.cardsPageTitle}</h1>
            <p>{view === 'skills' ? content.wiki.skillsPageDescription : content.wiki.cardsPageDescription}</p>
          </div>
          <div className="wiki-stats" aria-label={view === 'skills' ? content.wiki.skillsPageTitle : content.wiki.cardsPageTitle}>
            {view === 'skills' ? (
              <>
                <WikiStat icon={GitBranch} value={WIKI_PROFESSION_LINES.length} label={content.wiki.stats.lines} />
                <WikiStat icon={Layers3} value={WIKI_PROFESSION_STAGES.length} label={content.wiki.stats.stages} />
                <WikiStat icon={Hash} value={WIKI_SKILL_COUNT} label={content.wiki.stats.skills} />
                <WikiStat icon={Database} value={WIKI_CLIENT_VERSION} label={content.wiki.stats.version} />
              </>
            ) : (
              <>
                <WikiStat icon={BookOpen} value={CARD_COUNTS.wikiCards} label={content.wiki.stats.cards} />
                <WikiStat icon={Layers3} value={CARD_COUNTS.baseCards} label={content.wiki.stats.baseCards} />
                <WikiStat icon={Sparkles} value={CARD_COUNTS.collectionCards} label={content.wiki.stats.collections} />
                <WikiStat icon={Database} value={CARD_CLIENT_VERSION} label={content.wiki.stats.version} />
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
                  <strong>{candidate.label}</strong>
                  <small>{content.wiki.skillCount.replace('{count}', String(skillCount))}</small>
                  <ChevronRight aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </aside>

        <div className="wiki-main">
          <section className="wiki-progression" aria-labelledby="wiki-progression-title">
            <div className="wiki-section-heading">
              <div>
                <span>{content.wiki.progressionEyebrow}</span>
                <h2 id="wiki-progression-title">{line?.label} {content.wiki.progressionTitle}</h2>
              </div>
              <small>{lineStages.length} {content.wiki.stats.stages}</small>
            </div>

            {line ? (
              <>
                <ProfessionSummary line={line} stages={lineStages} />
              <div className="wiki-progression-grid">
                <WikiStageCard
                  stage={WIKI_STAGE_BY_ID.get(line.baseStageId)}
                  active={stageId === line.baseStageId}
                  onSelect={setStageId}
                />
                <div className="wiki-paths">
                  {line.paths.map((path, pathIndex) => (
                    <div className="wiki-path" key={`${line.id}-${pathIndex}`}>
                      {path.map((id) => (
                        <WikiStageCard
                          key={id}
                          stage={WIKI_STAGE_BY_ID.get(id)}
                          active={stageId === id}
                          onSelect={setStageId}
                          compact
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              </>
            ) : null}
          </section>

          <section className="wiki-skills" aria-labelledby="wiki-skills-title">
            <div className="wiki-section-heading wiki-skills-heading">
              <div>
                <span>{content.wiki.skillsEyebrow}</span>
                <h2 id="wiki-skills-title">{content.wiki.skillsTitle}</h2>
                <p>{content.wiki.skillsDescription}</p>
              </div>
              <strong>{content.wiki.resultCount.replace('{count}', String(skills.length))}</strong>
            </div>

            <div className="wiki-skill-tools">
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
              <label className="wiki-stage-filter">
                <span className="sr-only">{content.wiki.stage}</span>
                <select value={stageId} onChange={(event) => setStageId(event.target.value)}>
                  <option value="">{content.wiki.allStages}</option>
                  {lineStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
                </select>
              </label>
            </div>

            <div className="wiki-source-note">
              <Database aria-hidden="true" />
              <p>{content.wiki.sourceNote} <code>{WIKI_PACKAGE_SOURCE.sha256.slice(0, 12)}</code></p>
            </div>

            {skills.length > 0 ? (
              <div className="wiki-skill-table" role="table" aria-label={content.wiki.skillsTitle}>
                <div className="wiki-skill-row is-header" role="row">
                  <span role="columnheader">{content.wiki.icon}</span>
                  <span role="columnheader">{content.wiki.skillId}</span>
                  <span role="columnheader">{content.wiki.profession}</span>
                  <span role="columnheader">{content.wiki.stage}</span>
                  <span role="columnheader">{content.wiki.status}</span>
                </div>
                {skills.map(({ stage, skillId, evidence }) => (
                  <WikiSkillRow
                    key={skillId}
                    stage={stage}
                    skillId={skillId}
                    evidence={evidence}
                    onSelect={() => setSelectedSkill(getWikiSkillDetail(stage, skillId))}
                  />
                ))}
              </div>
            ) : (
              <div className="wiki-empty">{content.wiki.empty}</div>
            )}
          </section>
        </div>
      </div>
      ) : (
        <CardWiki
          query={cardQuery}
          kind={cardKind}
          cards={cards}
          onQueryChange={setCardQuery}
          onKindChange={setCardKind}
          onSelect={setSelectedCard}
        />
      )}
      {selectedCard ? <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} /> : null}
      {selectedSkill ? <SkillDetail skill={selectedSkill} onClose={() => setSelectedSkill(null)} /> : null}
    </main>
  )
}

function ProfessionSummary({
  line,
  stages,
}: {
  line: { label: string; paths: string[][] }
  stages: WikiProfessionStage[]
}) {
  const skillCount = stages.reduce((count, stage) => count + stage.skillIds.length, 0)

  return (
    <section className="wiki-profession-summary" aria-labelledby="wiki-profession-summary-title">
      <div className="wiki-profession-summary-icon"><Swords aria-hidden="true" /></div>
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

function WikiSkillRow({
  stage,
  skillId,
  evidence,
  onSelect,
}: {
  stage: WikiProfessionStage
  skillId: string
  evidence: { eventName: string }
  onSelect: () => void
}) {
  const asset = getWikiSkillAsset(stage, skillId)

  return (
    <button
      type="button"
      className="wiki-skill-row"
      role="row"
      onClick={onSelect}
      aria-label={`${stage.label} ${skillId}`}
    >
      <span role="cell" className="wiki-skill-row-icon">
        {asset ? <img src={asset.path} alt="" loading="lazy" /> : <Zap aria-hidden="true" />}
      </span>
      <strong role="cell">
        {skillId}
        <small>{evidence.eventName}</small>
      </strong>
      <span role="cell"><b>{stage.label}</b></span>
      <span role="cell">{content.wiki.tier.replace('{tier}', String(stage.tier))}</span>
      <span role="cell"><i />{asset ? (asset.match === 'exact' ? content.wiki.iconExact : content.wiki.iconFamily) : content.wiki.iconUnavailable}</span>
    </button>
  )
}

function SkillDetail({ skill, onClose }: { skill: WikiSkillDetail; onClose: () => void }) {
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
            {skill.asset ? <img src={skill.asset.path} alt="" /> : <Zap aria-hidden="true" />}
          </div>
          <div>
            <span>{content.wiki.skillDetail.eyebrow}</span>
            <h2 id="wiki-skill-dialog-title">{content.wiki.skillDetail.title.replace('{id}', skill.skillId)}</h2>
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
            <div><dt>{content.wiki.skillDetail.eventName}</dt><dd><code>{skill.evidence.eventName}</code></dd></div>
            <div><dt>{content.wiki.skillDetail.source}</dt><dd>{skill.evidence.source}</dd></div>
          </dl>
          <div className="wiki-skill-missing-grid">
            <MissingSkillField icon={CircleHelp} label={content.wiki.skillDetail.name} />
            <MissingSkillField icon={CircleHelp} label={content.wiki.skillDetail.description} />
            <MissingSkillField icon={ShieldCheck} label={content.wiki.skillDetail.values} />
          </div>
          {skill.asset ? (
            <div className="wiki-skill-asset-evidence">
              <img src={skill.asset.path} alt="" />
              <div>
                <strong>{content.wiki.skillDetail.icon}</strong>
                <span>{skill.asset.name}</span>
                <small>{skill.asset.match === 'exact' ? content.wiki.skillDetail.iconExact : content.wiki.skillDetail.iconFamily}</small>
              </div>
            </div>
          ) : null}
          <div className="wiki-skill-dialog-note">
            <Database aria-hidden="true" />
            <p>{content.wiki.skillDetail.note}</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function MissingSkillField({ icon: Icon, label }: { icon: IconComponent; label: string }) {
  return (
    <div className="wiki-skill-missing-field">
      <Icon aria-hidden="true" />
      <div><span>{label}</span><strong>{content.wiki.skillDetail.unavailable}</strong></div>
    </div>
  )
}

function CardWiki({
  query,
  kind,
  cards,
  onQueryChange,
  onKindChange,
  onSelect,
}: {
  query: string
  kind: CardKind
  cards: WikiCard[]
  onQueryChange: (query: string) => void
  onKindChange: (kind: CardKind) => void
  onSelect: (card: WikiCard) => void
}) {
  const filters: Array<{ key: CardKind; label: string; count: number }> = [
    { key: 'all', label: content.wiki.cards.filters.all, count: CARD_COUNTS.wikiCards },
    { key: 'base', label: content.wiki.cards.filters.base, count: CARD_COUNTS.baseCards },
    { key: 'collection', label: content.wiki.cards.filters.collection, count: CARD_COUNTS.collectionCards },
  ]
  const sourceFingerprint = CARD_SOURCE.files
    .map((source) => source.sha256.slice(0, 12))
    .join(' / ')

  return (
    <div className="ro3-shell wiki-content wiki-card-content" role="tabpanel">
      <aside className="wiki-line-nav" aria-label={content.wiki.cards.filterLabel}>
        <span>{content.wiki.cards.filterLabel}</span>
        <div>
          {filters.map((filter) => (
            <button
              type="button"
              key={filter.key}
              className={kind === filter.key ? 'is-active' : undefined}
              aria-pressed={kind === filter.key}
              onClick={() => onKindChange(filter.key)}
            >
              <strong>{filter.label}</strong>
              <small>{content.wiki.cards.resultCount.replace('{count}', String(filter.count))}</small>
              <ChevronRight aria-hidden="true" />
            </button>
          ))}
        </div>
      </aside>

      <section className="wiki-main wiki-cards" aria-labelledby="wiki-cards-title">
        <div className="wiki-section-heading wiki-skills-heading">
          <div>
            <span>{content.wiki.tabs.cards}</span>
            <h2 id="wiki-cards-title">{content.wiki.cards.title}</h2>
            <p>{content.wiki.cards.description}</p>
          </div>
          <strong>{content.wiki.cards.resultCount.replace('{count}', String(cards.length))}</strong>
        </div>

        <div className="wiki-card-tools">
          <label className="wiki-search">
            <Search aria-hidden="true" />
            <span className="sr-only">{content.wiki.cards.searchLabel}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={content.wiki.cards.searchPlaceholder}
            />
            {query ? (
              <button type="button" aria-label={content.search.clear} onClick={() => onQueryChange('')}>
                <X aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <span>{content.wiki.cards.unmapped}</span>
        </div>

        <div className="wiki-source-note">
          <Database aria-hidden="true" />
          <p>{content.wiki.cards.sourceNote} <code>{sourceFingerprint}</code></p>
        </div>

        {cards.length > 0 ? (
          <div className="wiki-card-table" role="table" aria-label={content.wiki.cards.title}>
            <div className="wiki-card-row is-header" role="row">
              <span role="columnheader">{content.wiki.cards.name}</span>
              <span role="columnheader">{content.wiki.cards.type}</span>
              <span role="columnheader">{content.wiki.cards.series}</span>
              <span role="columnheader">{content.wiki.cards.status}</span>
            </div>
            {cards.map((card) => <CardRow key={card.id} card={card} onSelect={onSelect} />)}
          </div>
        ) : (
          <div className="wiki-empty">{content.wiki.cards.empty}</div>
        )}
      </section>
    </div>
  )
}

function CardRow({ card, onSelect }: { card: WikiCard; onSelect: (card: WikiCard) => void }) {
  const relatedNames = card.kind === 'collection' ? card.stages : card.aliases
  const description = card.kind === 'collection'
    ? content.wiki.cards.collectionDescription.replace('{name}', card.baseCardName ?? '')
    : content.wiki.cards.baseDescription

  return (
    <button type="button" className="wiki-card-row" role="row" onClick={() => onSelect(card)}>
      <strong role="cell">
        {card.name}
        <small>{description}</small>
      </strong>
      <span role="cell">
        <b>{card.kind === 'collection' ? content.wiki.cards.collection : content.wiki.cards.base}</b>
      </span>
      <span role="cell" className="wiki-card-related">
        {relatedNames?.length
          ? relatedNames.map((name) => <small key={name}>{name}</small>)
          : <small>{content.wiki.cards.noAliases}</small>}
      </span>
      <span role="cell" className="wiki-card-status">
        <Database aria-hidden="true" />
        {card.kind === 'collection' ? content.wiki.cards.seriesConfirmed : content.wiki.cards.nameConfirmed}
      </span>
    </button>
  )
}

function CardDetail({ card, onClose }: { card: WikiCard; onClose: () => void }) {
  const relatedNames = card.kind === 'collection' ? card.stages : card.aliases

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div className="wiki-card-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="wiki-card-dialog" role="dialog" aria-modal="true" aria-labelledby="wiki-card-dialog-title">
        <button type="button" className="wiki-dialog-close" aria-label={content.wiki.cards.closeDetail} onClick={onClose}>
          <X aria-hidden="true" />
        </button>
        <div className="wiki-card-dialog-art" aria-label={content.wiki.cards.artUnavailable}>
          <BookOpen aria-hidden="true" />
          <strong>{content.wiki.cards.artUnavailable}</strong>
          <small>{content.wiki.cards.artUnavailableDescription}</small>
        </div>
        <div className="wiki-card-dialog-body">
          <span>{card.kind === 'collection' ? content.wiki.cards.collection : content.wiki.cards.base}</span>
          <h2 id="wiki-card-dialog-title">{card.name}</h2>
          <p>{card.kind === 'collection'
            ? content.wiki.cards.collectionDescription.replace('{name}', card.baseCardName ?? '')
            : content.wiki.cards.baseDescription}</p>
          <dl className="wiki-card-detail-grid">
            <div><dt>{content.wiki.cards.type}</dt><dd>{card.kind === 'collection' ? content.wiki.cards.collection : content.wiki.cards.base}</dd></div>
            <div><dt>{content.wiki.cards.status}</dt><dd>{card.kind === 'collection' ? content.wiki.cards.seriesConfirmed : content.wiki.cards.nameConfirmed}</dd></div>
            <div><dt>{content.wiki.cards.sourceFile}</dt><dd><code>{card.source.file}</code></dd></div>
            <div><dt>{content.wiki.cards.sourceOffset}</dt><dd><code>0x{card.source.offset.toString(16).toUpperCase()}</code></dd></div>
          </dl>
          {relatedNames?.length ? (
            <div className="wiki-card-detail-series">
              <strong>{content.wiki.cards.series}</strong>
              <div>{relatedNames.map((name) => <span key={name}>{name}</span>)}</div>
            </div>
          ) : null}
          <div className="wiki-card-detail-evidence">
            <Database aria-hidden="true" />
            <p>{content.wiki.cards.assetEvidence.replace('{count}', String(CARD_ASSET_COUNT))}</p>
            <div>{CARD_ASSET_REFERENCES.slice(0, 5).map((reference) => <code key={reference.name}>{reference.name}</code>)}</div>
          </div>
        </div>
      </section>
    </div>
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

export default App
