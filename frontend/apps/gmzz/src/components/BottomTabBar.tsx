import { Link, useLocation } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  Gauge,
  Hammer,
  History,
  Home,
  Menu,
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
  if (pathname.startsWith('/traintrade')) return '/traintrade'
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
      more={{
        label: t('more'),
        icon: <Menu className="size-5" strokeWidth={1.8} />,
        active: active === '/changelog' || active === '/score',
        title: t('more'),
      }}
      grid={{
        items: [{
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
