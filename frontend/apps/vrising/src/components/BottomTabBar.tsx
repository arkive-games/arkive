import { Link, useLocation, useSearch } from '@tanstack/react-router'
import { History, Map, Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  ArkiveMobileAccountRow,
  ShellBottomNav,
  getArkiveBrandName,
  useTheme,
  type Theme,
} from '@gamemap/map-shell'
import { LANGUAGES, LANGUAGE_LABELS, type Language } from '../i18n'
import { ARKIVE_HOME_LINK_PROPS, ARKIVE_HOME_URL } from '../lib/brand'
import {
  MAP_ENGINE_CHOICES,
  MAP_ENGINE_LABELS,
  resolveMapEngine,
  useChooseMapEngine,
  useStoredMapEngine,
  type MapEngineChoice,
} from '../lib/mapEngineChoice'
import { SiteInfo } from './SiteInfo'
import type { NavKey } from './TopNav'

function activeKey(pathname: string): NavKey {
  return pathname.startsWith('/changelog') ? '/changelog' : '/'
}

export function BottomTabBar() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const { theme, setTheme } = useTheme()
  const lng = LANGUAGES.find((code) => code === i18n.resolvedLanguage) ?? 'en-US'
  const active = activeKey(pathname)
  const brandName = getArkiveBrandName(lng, t('brand'))
  const engineParam = useSearch({
    strict: false,
    select: (search) => (search as { engine?: unknown }).engine,
  })
  const activeEngine = resolveMapEngine(engineParam, useStoredMapEngine())
  const chooseEngine = useChooseMapEngine()

  return (
    <ShellBottomNav
      pathname={pathname}
      tabs={[{
        key: '/',
        label: t('nav.map'),
        icon: <Map className="size-5" />,
        active: active === '/',
      }]}
      renderTab={(tab, className) => (
        <Link to="/" className={className} data-testid="tab-map">
          {tab.icon}
          <span className="max-w-full truncate">{tab.label}</span>
        </Link>
      )}
      more={{
        label: t('more'),
        icon: <Menu className="size-5" />,
        active: active === '/changelog',
        title: t('more'),
        brand: (
          <a
            href={ARKIVE_HOME_URL}
            {...ARKIVE_HOME_LINK_PROPS}
            aria-label={t('brandHome')}
            className="max-w-40 truncate text-sm font-bold text-primary hover:underline"
          >
            {brandName}
          </a>
        ),
      }}
      grid={{
        items: [{
          key: '/changelog',
          label: t('nav.changelog'),
          icon: <History className="size-5" />,
          active: active === '/changelog',
        }],
        renderItem: (item, className) => (
          <Link to={item.key as NavKey} className={className} data-testid="more-changelog">
            {item.icon}
            <span className="text-center leading-tight">{item.label}</span>
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
      engine={{
        choices: MAP_ENGINE_CHOICES.map((choice) => ({
          value: choice,
          label: MAP_ENGINE_LABELS[choice].short,
        })),
        current: activeEngine,
        onChange: (value) => chooseEngine(value as MapEngineChoice),
        rowLabel: t('mapRenderer'),
      }}
      extra={<ArkiveMobileAccountRow locale={lng} label={t('login')} />}
      footer={<SiteInfo />}
    />
  )
}
