import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArkiveMapTopBar, useTheme, type ShellNavItem } from '@gamemap/map-shell'
import { LANGUAGES, LANGUAGE_LABELS, type Language } from '../i18n'
import { ARKIVE_HOME_LINK_PROPS, ARKIVE_HOME_URL } from '../lib/brand'

export type NavKey = '/' | '/changelog'

export function TopNav({ active }: { active: NavKey }) {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()

  const items: ShellNavItem[] = [
    { key: '/', label: t('nav.map'), active: active === '/' },
  ]

  return (
    <ArkiveMapTopBar
      homeUrl={ARKIVE_HOME_URL}
      homeLinkProps={ARKIVE_HOME_LINK_PROPS}
      homeLabel={t('brandHome')}
      brandName={t('brand')}
      brandSlogan={t('brandSlogan')}
      nav={{
        items,
        renderItem: (item, className, labelClassName) => (
          <Link to={item.key as NavKey} className={className}>
            {labelClassName ? (
              <span data-slot="nav-item-label" className={labelClassName}>{item.label}</span>
            ) : item.label}
          </Link>
        ),
      }}
      languageSwitcher={{
        languages: LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code as Language] })),
        current: i18n.resolvedLanguage ?? 'en-US',
        onChange: (code) => void i18n.changeLanguage(code),
        menuLabel: t('languageMenu'),
        shortLabel: t('languageMenu'),
      }}
      themeSwitcher={{
        labels: {
          auto: t('themeAuto'),
          light: t('themeLight'),
          dark: t('themeDark'),
        },
        current: theme,
        onChange: setTheme,
        menuLabel: t('themeMenu'),
        shortLabel: t('themeMenu'),
      }}
      loginLabel={t('login')}
    />
  )
}
