import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ShellTopBar, useTheme, type Theme } from '@gamemap/map-shell'
import { BuildInfo } from '@gamemap/ui'
import { LANGUAGES, LANGUAGE_LABELS, type Language } from '../i18n'
import { SITE_VERSION } from '../lib/siteVersion'
import { getGameVersion } from '../lib/urls'
import { SiteInfoDialog } from './SiteInfo'

export type NavKey = '/' | '/cards' | '/characters' | '/changelog'

const ITEMS: { key: NavKey; labelKey: string }[] = [
  { key: '/', labelKey: 'nav.home' },
  { key: '/cards', labelKey: 'nav.cards' },
  { key: '/characters', labelKey: 'nav.characters' },
]

export function TopNav({ active }: { active: NavKey }) {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()

  return (
    <ShellTopBar
      classNames={{ root: 'border-b border-border bg-card' }}
      leftSlot={
        <Link to="/" className="text-lg font-bold tracking-tight text-primary">
          {t('siteTitle')}
        </Link>
      }
      nav={{
        items: ITEMS.map((item) => ({
          key: item.key,
          label: t(item.labelKey),
          active: active === item.key,
        })),
        renderItem: (item, className) => (
          <Link to={item.key} className={className}>
            {item.label}
          </Link>
        ),
      }}
      languageSwitcher={{
        languages: LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code as Language] })),
        current: i18n.resolvedLanguage ?? 'en-US',
        onChange: (code) => void i18n.changeLanguage(code),
        menuLabel: t('languageMenu'),
      }}
      themeSwitcher={{
        options: [
          { value: 'auto', label: t('themeAuto') },
          { value: 'light', label: t('themeLight') },
          { value: 'dark', label: t('themeDark') },
        ],
        current: theme,
        onChange: (value) => setTheme(value as Theme),
        menuLabel: t('themeMenu'),
      }}
      rightExtras={
        <div className="flex items-center gap-1">
          <SiteInfoDialog />
          <BuildInfo
            commit={__BUILD_GIT_COMMIT__}
            buildTime={__BUILD_TIME__}
            dev={import.meta.env.DEV}
            gameVersion={getGameVersion()}
            siteVersion={<Link to="/changelog">v{SITE_VERSION}</Link>}
          />
        </div>
      }
    />
  )
}
