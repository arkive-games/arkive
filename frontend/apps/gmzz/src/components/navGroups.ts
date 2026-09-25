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
  /** The label the menus use, and the home page tile's caption. */
  labelKey: string
  /**
   * The home tile's picture: a path under the resource repo, without the
   * extension. Real game art, one piece per page, chosen so a reader can find a
   * page by what it looks like before reading its name.
   */
  art: string
  /** The glyph the mobile strip's sheets use, where game art would be too busy. */
  icon: LucideIcon
}

export interface NavGroup {
  /** Not a route — the dropdown's own id, and the mobile group tab's. */
  key: string
  labelKey: string
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
    icon: Wrench,
    children: [
      // Goods art, since the planner is about what you carry between stations.
      { key: '/tools/traintrade-station', labelKey: 'nav.stationTool', art: 'icons/2000270', icon: Route },
      // Equipment, which is what the calculator scores.
      { key: '/score', labelKey: 'nav.score', art: 'icons/3250455', icon: Gauge },
      { key: '/tools/league-points', labelKey: 'nav.league', art: 'icons/3200663', icon: Trophy },
    ],
  },
  {
    key: 'wiki',
    labelKey: 'nav.wiki',
    icon: BookOpen,
    children: [
      { key: '/traintrade', labelKey: 'trainTrade.title', art: 'icons/2000235', icon: Package },
      // One entry for both 人脉 pages: the menu is a single level, and 名录 and
      // 关系 switch between each other from their own tab control.
      { key: '/fellows', labelKey: 'nav.fellows', art: 'fellows/7_Klein', icon: Contact },
      { key: '/utopia', labelKey: 'nav.utopia', art: 'utopia/Rogue_Common_05', icon: Users },
      { key: '/reforge', labelKey: 'nav.reforge', art: 'icons/3210613', icon: Hammer },
    ],
  },
  {
    key: 'autochess',
    labelKey: 'nav.autochess',
    icon: Grid3X3,
    children: [
      { key: '/autochess', labelKey: 'autochess.rules.navTitle', art: 'autochess/skills/Bard_Skill_04', icon: ScrollText },
      { key: '/autochess/chess', labelKey: 'autochess.pieces.title', art: 'autochess/skills/Rogue_Common_13', icon: Swords },
      { key: '/autochess/bonds', labelKey: 'autochess.bonds.title', art: 'autochess/items/2001892', icon: Link2 },
      { key: '/autochess/items', labelKey: 'autochess.items.title', art: 'autochess/items/2002125', icon: Shield },
      { key: '/autochess/talents', labelKey: 'autochess.talents.title', art: 'utopia/Rogue_Common_10', icon: Sparkles },
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
