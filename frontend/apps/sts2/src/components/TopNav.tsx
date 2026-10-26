import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArkiveAccountControl } from '@gamemap/auth'
import { ArkiveMapTopBar, getArkiveBrandName } from '@gamemap/map-shell'
import { changeLanguagePreference, LANGUAGES, LANGUAGE_LABELS, type Language } from '../i18n'
import { ARKIVE_HOME_URL } from '../lib/brand'
import { useSettingsConfig } from '../lib/settings'

export type NavKey = '/' | '/cards' | '/characters' | '/changelog'

const ITEMS: { key: NavKey; labelKey: string }[] = [
  { key: '/', labelKey: 'nav.home' },
  { key: '/cards', labelKey: 'nav.cards' },
  { key: '/characters', labelKey: 'nav.characters' },
]

export function TopNav({ active }: { active: NavKey }) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const brandName = getArkiveBrandName(lng, t('brand'))
  const settings = useSettingsConfig()

  return (
    <ArkiveMapTopBar
      homeUrl={ARKIVE_HOME_URL}
      homeLabel={t('brandHome')}
      brandName={brandName}
      nav={{
        items: ITEMS.map((item) => ({
          key: item.key,
          label: t(item.labelKey),
          active: active === item.key,
        })),
        renderItem: (item, className, labelClassName) => (
          <Link to={item.key} className={className}>
            {labelClassName ? (
              <span data-slot="nav-item-label" className={labelClassName}>{item.label}</span>
            ) : item.label}
          </Link>
        ),
      }}
      languageSwitcher={{
        languages: LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code as Language] })),
        current: lng,
        onChange: (code) => void changeLanguagePreference(code),
        menuLabel: t('languageMenu'),
        shortLabel: t('languageMenu'),
      }}
      themeSwitcher={{
        labels: {
          auto: t('themeAuto'),
          light: t('themeLight'),
          dark: t('themeDark'),
        },
        menuLabel: t('themeMenu'),
        shortLabel: t('themeMenu'),
      }}
      loginLabel={t('login')}
      accountSlot={<ArkiveAccountControl language={i18n.language} settings={settings} homeUrl={ARKIVE_HOME_URL} />}
    />
  )
}
