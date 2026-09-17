import { Link, useLocation } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  Gauge,
  Grid3X3,
  Hammer,
  History,
  Home,
  Menu,
  Trophy,
  Users,
} from 'lucide-react'
import {
  ShellBottomNav,
  useTheme,
  type Theme,
} from '@gamemap/map-shell'
import { changeLanguagePreference, LANGUAGES, LANGUAGE_LABELS, type Language } from '../i18n'
import { SiteInfo } from './SiteInfo'
import { useSettingsConfig } from '../lib/settings'
import type { NavKey } from './TopNav'

function activeKey(pathname: string): NavKey {
  // 愚者棋局's four sub-pages report the section, so the strip highlights it as
  // a whole — the same grouping the desktop dropdown shows.
  if (pathname.startsWith('/autochess')) return '/autochess'
  if (pathname.startsWith('/tools/league-points')) return '/tools/league-points'
  if (pathname.startsWith('/traintrade') || pathname === '/tools/traintrade-station') return '/traintrade'
  if (pathname.startsWith('/utopia')) return '/utopia'
  if (pathname.startsWith('/reforge')) return '/reforge'
  if (pathname.startsWith('/score')) return '/score'
  if (pathname.startsWith('/changelog')) return '/changelog'
  return '/'
}

export function BottomTabBar() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const { theme, setTheme } = useTheme()
  const settings = useSettingsConfig()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const active = activeKey(pathname)

  const tabs = [
    { key: '/', label: t('nav.home'), icon: <Home className="size-5" strokeWidth={1.8} /> },
    { key: '/traintrade', label: t('nav.traintrade'), icon: <BookOpen className="size-5" strokeWidth={1.8} /> },
    { key: '/utopia', label: t('nav.utopia'), icon: <Users className="size-5" strokeWidth={1.8} /> },
    { key: '/reforge', label: t('nav.reforge'), icon: <Hammer className="size-5" strokeWidth={1.8} /> },
  ]

  return (
    <ShellBottomNav
      pathname={pathname}
      tabs={tabs.map((tab) => ({ ...tab, active: active === tab.key }))}
      renderTab={(tab, className) => (
        <Link to={tab.key as NavKey} className={className} data-testid={`tab-${tab.key}`}>
          {tab.icon}<span className="max-w-full truncate">{tab.label}</span>
        </Link>
      )}
      // The strip is at its documented ceiling of four tabs (see
      // ShellBottomNav's own contract), so anything further goes in here.
      // Derived rather than listed, so a route added to the grid below cannot
      // be left out of the button's own active state — which is how
      // /tools/league-points came to light up the Home tab instead.
      more={{
        label: t('more'),
        icon: <Menu className="size-5" strokeWidth={1.8} />,
        active: !tabs.some((tab) => tab.key === active),
        title: t('more'),
      }}
      grid={{
        items: [{
          key: '/autochess',
          label: t('nav.autochess'),
          icon: <Grid3X3 className="size-5" strokeWidth={1.8} />,
          active: active === '/autochess',
        }, {
          key: '/tools/league-points',
          label: t('nav.league'),
          icon: <Trophy className="size-5" strokeWidth={1.8} />,
          active: active === '/tools/league-points',
        }, {
          key: '/score',
          label: t('nav.score'),
          icon: <Gauge className="size-5" strokeWidth={1.8} />,
          active: active === '/score',
        }, {
          key: '/changelog',
          label: t('nav.changelog'),
          icon: <History className="size-5" strokeWidth={1.8} />,
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
