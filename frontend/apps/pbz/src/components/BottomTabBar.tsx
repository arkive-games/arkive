import { Link, useLocation } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { FlaskConical, Gem, History, Map as MapIcon, Menu, Package, Skull, Sparkles, Sword, Swords } from 'lucide-react'
import { ShellBottomNav } from '@gamemap/map-shell'
import { changeLanguagePreference, LANGUAGES, LANGUAGE_LABELS, type Language } from '../i18n'
import { SiteInfo } from './SiteInfo'
import { useSettingsConfig } from '../lib/settings'
import type { NavKey } from './TopNav'

const WIKI_PAGES = ['/weapons', '/phantom-edges', '/accessories', '/medicines', '/items', '/enemies', '/skills'] as const

function activeKey(pathname: string): NavKey {
  if (pathname.startsWith('/changelog')) return '/changelog'
  const wiki = WIKI_PAGES.find((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (wiki) return wiki
  return '/'
}

export function BottomTabBar() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const settings = useSettingsConfig()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const active = activeKey(pathname)

  const tabs = [
    { key: '/', label: t('nav.map'), icon: <MapIcon className="size-5" strokeWidth={1.8} /> },
    { key: '/weapons', label: t('nav.weapons'), icon: <Sword className="size-5" strokeWidth={1.8} /> },
    { key: '/items', label: t('nav.items'), icon: <Package className="size-5" strokeWidth={1.8} /> },
    { key: '/enemies', label: t('nav.enemies'), icon: <Skull className="size-5" strokeWidth={1.8} /> },
  ]
  // The rest live in the "More" sheet, beside the changelog.
  const moreItems = [
    { key: '/phantom-edges', label: t('nav.phantomEdges'), icon: <Swords className="size-5" strokeWidth={1.8} /> },
    { key: '/accessories', label: t('nav.accessories'), icon: <Gem className="size-5" strokeWidth={1.8} /> },
    { key: '/medicines', label: t('nav.medicines'), icon: <FlaskConical className="size-5" strokeWidth={1.8} /> },
    { key: '/skills', label: t('nav.skills'), icon: <Sparkles className="size-5" strokeWidth={1.8} /> },
    { key: '/changelog', label: t('nav.changelog'), icon: <History className="size-5" strokeWidth={1.8} /> },
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
        active: moreItems.some((item) => item.key === active),
        title: t('more'),
      }}
      grid={{
        items: moreItems.map((item) => ({ ...item, active: active === item.key })),
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
