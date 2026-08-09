import { Link, useLocation } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  History,
  Home,
  Menu,
  Users,
} from 'lucide-react'
import { ArkiveAccountControl } from '@gamemap/auth'
import {
  ShellBottomNav,
  getArkiveBrandName,
  useTheme,
  type Theme,
} from '@gamemap/map-shell'
import { LANGUAGES, LANGUAGE_LABELS, type Language } from '../i18n'
import { ARKIVE_HOME_URL } from '../lib/brand'
import { SiteInfo } from './SiteInfo'
import type { NavKey } from './TopNav'

function activeKey(pathname: string): NavKey {
  if (pathname.startsWith('/cards')) return '/cards'
  if (pathname.startsWith('/characters')) return '/characters'
  if (pathname.startsWith('/changelog')) return '/changelog'
  return '/'
}

export function BottomTabBar() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const { theme, setTheme } = useTheme()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const active = activeKey(pathname)
  const brandName = getArkiveBrandName(lng, t('brand'))

  const tabs = [
    { key: '/', label: t('nav.home'), icon: <Home className="size-5" strokeWidth={1.8} /> },
    { key: '/cards', label: t('nav.cards'), icon: <BookOpen className="size-5" strokeWidth={1.8} /> },
    { key: '/characters', label: t('nav.characters'), icon: <Users className="size-5" strokeWidth={1.8} /> },
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
      more={{
        label: t('more'),
        icon: <Menu className="size-5" strokeWidth={1.8} />,
        active: active === '/changelog',
        title: t('more'),
        brand: <a href={ARKIVE_HOME_URL} className="max-w-40 truncate text-sm font-bold text-primary">{brandName}</a>,
      }}
      grid={{
        items: [{
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
        onChange: (code) => void i18n.changeLanguage(code),
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
      extra={<ArkiveAccountControl language={lng} variant="mobileRow" />}
      footer={<SiteInfo />}
    />
  )
}
