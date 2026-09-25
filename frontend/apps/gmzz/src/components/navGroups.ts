import {
  BookOpen,
  Contact,
  Gauge,
  Grid3X3,
  Hammer,
  Link2,
  Package,
  Route,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

export type NavKey =
  | '/'
  | '/traintrade'
  | '/tools/traintrade-station'
  | '/utopia'
  | '/reforge'
  | '/score'
  | '/tools/league-points'
  | '/autochess'
  | '/autochess/chess'
  | '/autochess/bonds'
  | '/autochess/items'
  | '/autochess/talents'
  | '/fellows'
  | '/fellows/relations'
  | '/changelog'

export interface NavEntry {
  key: NavKey
  /** The label the menus use, and the home page card's title. */
  labelKey: string
  /** The home page card's one-line description. */
  bodyKey: string
  icon: LucideIcon
}

export interface NavGroup {
  /** Not a route — the dropdown's own id, and the mobile group tab's. */
  key: string
  labelKey: string
  /** One line under the section's heading on the home page. */
  introKey: string
  icon: LucideIcon
  children: NavEntry[]
}

/**
 * The site in three kinds of page, and the one mode big enough to be its own.
 *
 * Grouped by what a page *does* rather than which game system it covers: a
 * calculator you fill in is a tool, a catalogue you look things up in is the
 * wiki. The earlier bar grouped by system (铁路大亨 held both its goods list and
 * its planner) and then ran out of systems, which is how a 「资料」 menu came to
 * hold a calculator. Routes are untouched, so every existing link still lands.
 *
 * The desktop bar, the mobile strip and the home page all draw from this one
 * list. Three hand-kept copies is how they drifted apart before.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'tools',
    labelKey: 'nav.tools',
    introKey: 'home.toolsIntro',
    icon: Wrench,
    children: [
      {
        key: '/tools/traintrade-station',
        labelKey: 'nav.stationTool',
        bodyKey: 'trainTrade.stationTool.homeDescription',
        icon: Route,
      },
      { key: '/score', labelKey: 'nav.score', bodyKey: 'score.homeDescription', icon: Gauge },
      {
        key: '/tools/league-points',
        labelKey: 'nav.league',
        bodyKey: 'league.homeDescription',
        icon: Trophy,
      },
    ],
  },
  {
    key: 'wiki',
    labelKey: 'nav.wiki',
    introKey: 'home.wikiIntro',
    icon: BookOpen,
    children: [
      { key: '/traintrade', labelKey: 'trainTrade.title', bodyKey: 'trainTrade.homeDescription', icon: Package },
      // One entry for both 人脉 pages: the menu is a single level, and 名录 and
      // 关系 switch between each other from their own tab control.
      { key: '/fellows', labelKey: 'nav.fellows', bodyKey: 'fellows.homeDescription', icon: Contact },
      { key: '/utopia', labelKey: 'nav.utopia', bodyKey: 'utopianTheater.homeDescription', icon: Users },
      { key: '/reforge', labelKey: 'nav.reforge', bodyKey: 'reforge.homeDescription', icon: Hammer },
    ],
  },
  {
    key: 'autochess',
    labelKey: 'nav.autochess',
    introKey: 'autochess.homeDescription',
    icon: Grid3X3,
    children: [
      {
        key: '/autochess',
        labelKey: 'autochess.rules.navTitle',
        bodyKey: 'home.autochessRules',
        icon: ScrollText,
      },
      { key: '/autochess/chess', labelKey: 'autochess.pieces.title', bodyKey: 'autochess.pieces.short', icon: Swords },
      { key: '/autochess/bonds', labelKey: 'autochess.bonds.title', bodyKey: 'autochess.bonds.short', icon: Link2 },
      { key: '/autochess/items', labelKey: 'autochess.items.title', bodyKey: 'autochess.items.short', icon: Shield },
      {
        key: '/autochess/talents',
        labelKey: 'autochess.talents.title',
        bodyKey: 'autochess.talents.short',
        icon: Sparkles,
      },
    ],
  },
]

/**
 * Whether a menu entry is the page being shown. Exact match, except that the
 * single 人脉 entry stands for both of its pages.
 */
export function isCurrent(entry: NavKey, active: NavKey): boolean {
  if (entry === '/fellows') return active === '/fellows' || active === '/fellows/relations'
  return entry === active
}
