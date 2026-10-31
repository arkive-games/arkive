import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Wrench } from 'lucide-react'
import { trackPageview } from '@gamemap/map-shell'
import {
  currentVersion,
  resolveChangelog,
  VersionHistory,
  type ChangelogFile,
} from '@gamemap/ui'
import { MonsterWiki } from './CreatureWiki'
import { PetWiki } from './PetWiki'
import { ProfessionWiki } from './ProfessionWiki'
import { TalentWiki } from './TalentWiki'
import { CardWiki } from './CardWiki'
import { EquipmentWiki } from './EquipmentWiki'
import { SoulWiki } from './SoulWiki'
import { BuildManual } from './BuildManual'
import { ContentPage } from './components/ContentPage'
import { HeaderActionProvider, SectionSidebar, SectionStrip, SidebarSubProvider, type SectionNavEntry } from './components/SectionNav'
import {
  hrefFor,
  hrefForKey,
  LEGACY_HOME_PATH,
  locationForKey,
  navigateOnClick,
  navKeyFor,
  readLocation,
  WIKI_VIEWS,
  type Location,
  type NavKey,
  type WikiView,
} from './navigation'
import homeSkills from './assets/home/skills.webp'
import homeTalents from './assets/home/talents.webp'
import homeCards from './assets/home/cards.webp'
import homePets from './assets/home/pets.webp'
import homeMonsters from './assets/home/monsters.webp'
import homeEquipment from './assets/home/equipment.webp'
import homeSouls from './assets/home/souls.webp'
import homeBuilds from './assets/home/builds.webp'
import content from './locales/zh-CN.json'
import changelogRaw from './changelog.json'

const CHANGELOG = changelogRaw as ChangelogFile
const SITE_VERSION = currentVersion(CHANGELOG)

const HOME_ART: Record<WikiView | 'builds', string> = {
  skills: homeSkills,
  talents: homeTalents,
  cards: homeCards,
  pets: homePets,
  monsters: homeMonsters,
  equipment: homeEquipment,
  souls: homeSouls,
  builds: homeBuilds,
}

// The home page is the nav, laid out, as on the other games: the same two
// sections the top bar carries, each entry a picture and a name.
const HOME_GROUPS: Array<{ key: string; label: string; icon: typeof BookOpen; entries: SectionNavEntry[] }> = [
  {
    key: 'wiki',
    label: content.nav.wiki,
    icon: BookOpen,
    entries: WIKI_VIEWS.map((view) => ({ key: `wiki-${view}` as NavKey, label: content.wiki.tabs[view], art: HOME_ART[view] })),
  },
  {
    key: 'tools',
    label: content.home.tools,
    icon: Wrench,
    entries: [{ key: 'builds', label: content.builds.title, art: HOME_ART.builds }],
  },
]

const WIKI_ENTRIES = HOME_GROUPS[0].entries
const BUILD_ENTRIES = HOME_GROUPS[1].entries

function pageTitle({ page, view }: Location): string {
  if (page === 'wiki') return content.wiki.tabs[view]
  if (page === 'builds') return content.builds.title
  if (page === 'changelog') return content.changelog.title
  return content.pageTitle
}

/** The browser tab and search title: the page first, then the site brand. */
function documentTitle(location: Location): string {
  return location.page === 'overview'
    ? content.documentTitle
    : content.pageDocumentTitle.replace('{page}', pageTitle(location))
}

function App() {
  const [location, setLocation] = useState<Location>(readLocation)
  const active = navKeyFor(location)

  // The home page moved from /overview to /; old links still land on it, under
  // the one address it has now.
  useEffect(() => {
    if (window.location.pathname.replace(/\/+$/, '') === LEGACY_HOME_PATH) {
      window.history.replaceState(window.history.state, '', `/${window.location.search}${window.location.hash}`)
    }
  }, [])

  useEffect(() => {
    document.title = documentTitle(location)
  }, [location])

  useEffect(() => {
    const handlePopState = () => {
      setLocation(readLocation())
      // The browser has already swapped the URL by the time popstate fires, so
      // the default (read location) is the page the visitor just went back to.
      trackPageview()
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // The phone wiki header's action slot, handed down to whichever page wants it.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null)
  // And the sidebar's, under the lit entry, for a page's own sub-pages.
  const [sidebarSlot, setSidebarSlot] = useState<HTMLElement | null>(null)

  const navigate = (key: NavKey) => {
    const next = locationForKey(key)
    if (!next) return
    const href = hrefFor(next.page, next.view)
    if (href !== `${window.location.pathname}${window.location.search}`) {
      window.history.pushState({}, '', href)
      trackPageview()
    }
    setLocation(next)
  }

  return (
      <ContentPage
        active={active}
        onNavigate={navigate}
        title={pageTitle(location)}
        // The home page carries its own, visually hidden, heading; the wiki's
        // is the lit entry of its sidebar.
        heading={location.page !== 'overview' && location.page !== 'wiki' && location.page !== 'builds'}
        wide={location.page === 'wiki' || location.page === 'builds'}
        version={SITE_VERSION}
      >
        {location.page === 'wiki' ? (
          <div className="lg:grid lg:grid-cols-[11.5rem_minmax(0,1fr)] lg:gap-8">
            <h1 className="sr-only">{pageTitle(location)}</h1>
            <SectionSidebar entries={WIKI_ENTRIES} active={active} onNavigate={navigate} label={content.nav.wiki} onSubSlot={setSidebarSlot} />
            <div className="min-w-0">
              <SectionStrip entries={WIKI_ENTRIES} active={active} onNavigate={navigate} label={content.nav.wiki} onSlot={setHeaderSlot} />
              <HeaderActionProvider value={headerSlot}>
                <SidebarSubProvider value={sidebarSlot}>
                  <WikiPage view={location.view} />
                </SidebarSubProvider>
              </HeaderActionProvider>
            </div>
          </div>
        ) : location.page === 'builds' ? (
          <div className="lg:grid lg:grid-cols-[11.5rem_minmax(0,1fr)] lg:gap-8">
            <h1 className="sr-only">{pageTitle(location)}</h1>
            <SectionSidebar entries={BUILD_ENTRIES} active={active} onNavigate={navigate} label={content.home.tools} onSubSlot={setSidebarSlot} />
            <div className="min-w-0">
              <SectionStrip entries={BUILD_ENTRIES} active={active} onNavigate={navigate} label={content.home.tools} onSlot={setHeaderSlot} />
              <HeaderActionProvider value={headerSlot}>
                <SidebarSubProvider value={sidebarSlot}>
                  <BuildManual />
                </SidebarSubProvider>
              </HeaderActionProvider>
            </div>
          </div>
        ) : location.page === 'changelog' ? (
          <ChangelogPage />
        ) : (
          <HomePage onNavigate={navigate} />
        )}
      </ContentPage>
  )
}

function HomePage({ onNavigate }: { onNavigate: (key: NavKey) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Named for assistive technology and search only; the bar already shows the game. */}
      <h1 className="sr-only">{content.home.title}</h1>

      <div className="grid gap-4 lg:grid-cols-[7fr_2fr]">
        {HOME_GROUPS.map((group) => {
          const GroupIcon = group.icon
          return (
            <section
              key={group.key}
              aria-labelledby={`home-${group.key}`}
              className="rounded-lg border border-border bg-card p-3 shadow-sm"
            >
              <h2 id={`home-${group.key}`} className="mb-2 flex items-center gap-1.5 px-1 text-base font-semibold">
                <GroupIcon className="size-4 text-[color:var(--arkive-nav-active)]" strokeWidth={2} aria-hidden />
                {group.label}
              </h2>
              {/* Columns follow the entry count on desktop, so each section is
                  one row of tiles and the two end level. */}
              <div
                className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:[grid-template-columns:repeat(var(--home-cols),minmax(0,1fr))]"
                style={{ ['--home-cols' as string]: group.entries.length }}
              >
                {group.entries.map((entry) => (
                  <a
                    key={entry.key}
                    href={hrefForKey(entry.key)}
                    onClick={navigateOnClick(entry.key, onNavigate)}
                    className="group flex flex-col items-center gap-1.5 rounded-md px-1 py-2 text-center transition-colors hover:bg-accent"
                  >
                    <img
                      src={entry.art}
                      alt=""
                      className="size-14 rounded-md object-contain transition-transform group-hover:scale-105"
                    />
                    <span className="line-clamp-2 text-xs font-medium leading-tight">{entry.label}</span>
                  </a>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function ChangelogPage() {
  const entries = useMemo(() => resolveChangelog(CHANGELOG, 'zh-CN'), [])

  return (
    <VersionHistory
      entries={entries}
      labels={{
        current: content.changelog.current,
        empty: content.changelog.empty,
        kinds: content.changelog.kinds,
      }}
    />
  )
}

function WikiPage({ view }: { view: WikiView }) {
  return (
    <div className="wiki-page">
      {view === 'skills' ? <ProfessionWiki /> : view === 'talents' ? <TalentWiki /> : view === 'cards' ? <CardWiki /> : view === 'pets' ? <PetWiki /> : view === 'monsters' ? <MonsterWiki /> : view === 'equipment' ? <EquipmentWiki /> : <SoulWiki />}
    </div>
  )
}

export default App
