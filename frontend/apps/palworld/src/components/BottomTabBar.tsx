import { useTranslation } from 'react-i18next'
import { Link, useLocation } from '@tanstack/react-router'
import {
  Calculator,
  Castle,
  Fish,
  FlaskConical,
  Hammer,
  HandHeart,
  Heart,
  Map,
  Menu,
  Microscope,
  Package,
  PawPrint,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Store,
  Swords,
  Tent,
} from 'lucide-react'
import {
  ShellBottomNav,
  useTheme,
  type Theme,
} from '@gamemap/map-shell'
import { changeLanguagePreference, LANGUAGES, LANGUAGE_LABELS } from '../i18n'
import type { NavKey } from './TopNav'
import { SiteInfo } from './SiteInfo'
import { useSettingsConfig } from '../lib/settings'

type Tab = { key: NavKey; label: string; icon: typeof Map }

/** Map a pathname (basepath already stripped by the router) to a NavKey. */
function activeKey(pathname: string): NavKey {
  if (pathname === '/' || pathname === '') return '/'
  if (pathname.startsWith('/pals')) return '/pals'
  if (pathname.startsWith('/items')) return '/items'
  if (pathname.startsWith('/buildings')) return '/buildings'
  if (pathname.startsWith('/merchants')) return '/merchants'
  if (pathname.startsWith('/technology')) return '/technology'
  if (pathname.startsWith('/research')) return '/research'
  if (pathname.startsWith('/dungeons')) return '/dungeons'
  if (pathname.startsWith('/quests')) return '/quests'
  if (pathname.startsWith('/basecamp')) return '/basecamp'
  if (pathname.startsWith('/raids')) return '/raids'
  if (pathname.startsWith('/fishing')) return '/fishing'
  if (pathname.startsWith('/passives')) return '/passives'
  if (pathname.startsWith('/active-skills')) return '/active-skills'
  if (pathname.startsWith('/partner-skills')) return '/partner-skills'
  if (pathname.startsWith('/stat-simulator')) return '/stat-simulator'
  if (pathname.startsWith('/breeding')) return '/breeding'
  // The changelog is reached from the site-info panel, not from the tab bar, so
  // it maps to itself: falling through to '/' would light up the Map tab on a
  // page that is not the map.
  if (pathname.startsWith('/changelog')) return '/changelog'
  return '/'
}

export function BottomTabBar() {
  const { t, i18n } = useTranslation()
  // `find` instead of a cast: LANGUAGES is the source of truth, so an unknown
  // resolved language degrades to English rather than indexing a label table
  // with a string the table has no entry for.
  const lng = LANGUAGES.find((code) => code === i18n.resolvedLanguage) ?? 'en-US'
  const { pathname } = useLocation()
  const active = activeKey(pathname)
  const { theme, setTheme } = useTheme()

  // Five slots is the most a phone can fit without shrinking the labels below
  // `text-xs`, so the bar carries the map plus the three most-used tools and
  // everything else moves into the sheet.
  const primary: Tab[] = [
    { key: '/', label: t('breeding.navMap'), icon: Map },
    { key: '/breeding', label: t('breeding.navBreeding'), icon: Heart },
    { key: '/passives', label: t('pal.section.passives'), icon: Sparkles },
    { key: '/partner-skills', label: t('partner.title'), icon: HandHeart },
  ]
  // Everything the desktop nav offers that is not a primary tab. Labels reuse the
  // desktop keys verbatim (see TopNav) so the two navs can never drift apart, and
  // the grid stays exhaustive — on a phone this sheet is the ONLY way to reach
  // these pages.
  const more: Tab[] = [
    { key: '/pals', label: t('pal.title'), icon: PawPrint },
    { key: '/technology', label: t('tech.title'), icon: FlaskConical },
    { key: '/items', label: t('item.title'), icon: Package },
    { key: '/buildings', label: t('building.title'), icon: Hammer },
    { key: '/merchants', label: t('merchant.title'), icon: Store },
    { key: '/dungeons', label: t('dungeon.title'), icon: Castle },
    { key: '/quests', label: t('quest.title'), icon: ScrollText },
    { key: '/active-skills', label: t('pal.section.activeSkills'), icon: Swords },
    { key: '/stat-simulator', label: t('sim.title'), icon: Calculator },
    { key: '/research', label: t('research.title', { defaultValue: 'Research' }), icon: Microscope },
    { key: '/basecamp', label: t('basecamp.title', { defaultValue: 'Base Camp' }), icon: Tent },
    { key: '/raids', label: t('raids.title', { defaultValue: 'Base Raids' }), icon: ShieldAlert },
    { key: '/fishing', label: t('fishing.title'), icon: Fish },
  ]
  const moreActive = more.some((m) => m.key === active)

  const settings = useSettingsConfig()
  const themeTabs: { value: Theme; label: string }[] = [
    { value: 'auto', label: t('themeAuto') },
    { value: 'light', label: t('themeLight') },
    { value: 'dark', label: t('themeDark') },
  ]

  return (
    <ShellBottomNav
      pathname={pathname}
      tabs={primary.map(({ key, label, icon: Icon }) => ({
        key,
        label,
        icon: <Icon className="size-5" />,
        active: active === key,
      }))}
      renderTab={(tab, className) => (
        <Link to={tab.key as NavKey} className={className} data-testid={`tab-${tab.key}`}>
          {tab.icon}
          <span className="max-w-full truncate px-0.5">{tab.label}</span>
        </Link>
      )}
      more={{
        label: t('more'),
        icon: <Menu className="size-5" />,
        active: moreActive,
        title: t('more'),
      }}
      grid={{
        items: more.map(({ key, label, icon: Icon }) => ({
          key,
          label,
          icon: <Icon className="size-5" />,
          active: active === key,
        })),
        renderItem: (item, className) => (
          <Link key={item.key} to={item.key as NavKey} data-testid={`more-${item.key}`} className={className}>
            {item.icon}
            <span className="text-center leading-tight">{item.label}</span>
          </Link>
        ),
      }}
      language={{
        languages: LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code] })),
        current: lng,
        onChange: (code) => void changeLanguagePreference(code),
        rowLabel: t('settings.language'),
        backLabel: t('settings.back'),
      }}
      theme={{
        options: themeTabs.map(({ value, label }) => ({ value, label })),
        current: theme,
        onChange: (value) => setTheme(value as Theme),
        rowLabel: t('settings.theme'),
      }}
      settings={{
        backLabel: t('settings.back'),
        config: settings,
      }}
      footer={<SiteInfo />}
    />
  )
}
