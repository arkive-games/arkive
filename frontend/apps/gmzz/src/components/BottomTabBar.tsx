import { Link, useLocation } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { History, Home, Menu, type LucideIcon } from 'lucide-react'
import {
  ShellBottomNav,
  useTheme,
  type ShellBottomTab,
  type Theme,
} from '@gamemap/map-shell'
import { changeLanguagePreference, LANGUAGES, LANGUAGE_LABELS, type Language } from '../i18n'
import { SiteInfo } from './SiteInfo'
import { useSettingsConfig } from '../lib/settings'
import { isCurrent, NAV_GROUPS, type NavKey } from './navGroups'

const icon = (Icon: LucideIcon) => <Icon className="size-5" strokeWidth={1.8} />

/** Every route a page can report, longest first so a sub-page wins its prefix. */
const ROUTES: NavKey[] = [
  '/tools/traintrade-station',
  '/tools/league-points',
  '/autochess/chess',
  '/autochess/bonds',
  '/autochess/items',
  '/autochess/talents',
  '/fellows/relations',
  '/autochess',
  '/fellows',
  '/traintrade',
  '/utopia',
  '/reforge',
  '/score',
  '/changelog',
]

function activeKey(pathname: string): NavKey {
  return ROUTES.find((route) => pathname === route || pathname.startsWith(`${route}/`)) ?? '/'
}

export function BottomTabBar() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const { theme, setTheme } = useTheme()
  const settings = useSettingsConfig()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const active = activeKey(pathname)

  // The strip mirrors the desktop bar: Home, then one group tab per section,
  // each opening a sheet of its pages. Four tabs is the strip's ceiling, and
  // the three sections plus Home fill it exactly.
  const tabs: ShellBottomTab[] = [
    { key: '/', label: t('nav.home'), icon: icon(Home), active: active === '/' },
    ...NAV_GROUPS.map((group) => {
      const children = group.children.map((child) => ({
        key: child.key,
        label: t(child.labelKey),
        icon: icon(child.icon),
        active: isCurrent(child.key, active),
      }))
      return {
        key: group.key,
        label: t(group.labelKey),
        icon: icon(group.icon),
        active: children.some((child) => child.active),
        children,
      }
    }),
  ]

  // Derived, not listed: a page reached only through More is one that no tab
  // or group claims, so adding a page to a group cannot leave More lit.
  const claimed = tabs.some((tab) => tab.active)

  return (
    <ShellBottomNav
      pathname={pathname}
      tabs={tabs}
      renderTab={(tab, className) => (
        <Link to={tab.key as NavKey} className={className} data-testid={`tab-${tab.key}`}>
          {/* Two lines, not `truncate`: this also draws the pages inside a
              group sheet, where 铁路大亨货物 is too wide for one quarter row and
              was clipped to 铁路大亨…. The strip's own labels are one line anyway. */}
          {tab.icon}<span className="line-clamp-2 max-w-full text-center leading-tight">{tab.label}</span>
        </Link>
      )}
      more={{
        label: t('more'),
        icon: icon(Menu),
        active: !claimed,
        title: t('more'),
      }}
      grid={{
        items: [{
          key: '/changelog',
          label: t('nav.changelog'),
          icon: icon(History),
          active: active === '/changelog',
        }],
        renderItem: (item, className) => (
          <Link to={item.key as NavKey} className={className}>
            {item.icon}<span className="text-center leading-tight">{item.label}</span>
          </Link>
        ),
      }}
      language={{
        languages: LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code as Language] })),
        current: lng,
        onChange: (code) => void changeLanguagePreference(code),
        rowLabel: t('languageMenu'),
        backLabel: t('back'),
      }}
      theme={{
        options: [
          { value: 'auto', label: t('themeAuto') },
          { value: 'light', label: t('themeLight') },
          { value: 'dark', label: t('themeDark') },
        ],
        current: theme,
        onChange: (value) => setTheme(value as Theme),
        rowLabel: t('themeMenu'),
      }}
      settings={{
        backLabel: t('back'),
        config: settings,
      }}
      footer={<SiteInfo />}
    />
  )
}
