import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ArkiveAccountControl } from '@gamemap/auth'
import { ArkiveMapTopBar, getArkiveBrandName, type ShellNavItem } from '@gamemap/map-shell'
import gameIcon from '../assets/palworld-icon.webp'
import { changeLanguagePreference, LANGUAGES, LANGUAGE_LABELS } from '../i18n'
import { ARKIVE_HOME_URL } from '../lib/brand'
import { useSettingsConfig } from '../lib/settings'
import { PAL_REFERENCE_ENTRIES, DATABASE_REFERENCE_ENTRIES } from './encyclopediaNavigation'

export type NavKey = '/' | '/pals' | '/breeding' | '/passives' | '/active-skills' | '/partner-skills' | '/stat-simulator' | '/items' | '/buildings' | '/merchants' | '/technology' | '/dungeons' | '/quests' | '/basecamp' | '/research' | '/raids' | '/fishing' | '/changelog'

export function TopNav({ active }: { active: NavKey }) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const brandName = getArkiveBrandName(lng, t('brand'))
  const settings = useSettingsConfig()

  const items: ShellNavItem[] = [
    { key: '/', label: t('breeding.navMap'), active: active === '/' },
    { key: '/breeding', label: t('breeding.navBreeding'), active: active === '/breeding' },
    {
      key: 'pals',
      label: t('nav.pals'),
      children: [
        ...PAL_REFERENCE_ENTRIES.map(entry => ({ key: entry.key, label: t(entry.labelKey), active: active === entry.key })),
        { key: '/stat-simulator', label: t('sim.title'), active: active === '/stat-simulator' },
      ],
    },
    {
      key: 'database',
      label: t('nav.database'),
      children: [
        ...DATABASE_REFERENCE_ENTRIES.map(entry => ({ key: entry.key, label: t(entry.labelKey), active: active === entry.key })),
      ],
    },
  ]

  return (
    <ArkiveMapTopBar
      homeUrl={ARKIVE_HOME_URL}
      homeLabel={t('brandHome')}
      brandName={brandName}
      game={{ name: t('siteInfo.gameName'), icon: gameIcon }}
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
        languages: LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code] })),
        current: lng,
        onChange: (code) => void changeLanguagePreference(code),
        menuLabel: t('settings.language'),
        shortLabel: t('settings.language'),
      }}
      themeSwitcher={{
        labels: {
          auto: t('themeAuto'),
          light: t('themeLight'),
          dark: t('themeDark'),
        },
        menuLabel: t('settings.theme'),
        shortLabel: t('settings.theme'),
      }}
      loginLabel={t('auth.login')}
      accountSlot={<ArkiveAccountControl language={lng} settings={settings} homeUrl={ARKIVE_HOME_URL} />}
    />
  )
}
