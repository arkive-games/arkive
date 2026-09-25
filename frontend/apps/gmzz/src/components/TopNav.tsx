import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArkiveAccountControl } from '@gamemap/auth'
import { ArkiveMapTopBar, getArkiveBrandName, useTheme, type ShellNavItem } from '@gamemap/map-shell'
import { changeLanguagePreference, LANGUAGES, LANGUAGE_LABELS, type Language } from '../i18n'
import { ARKIVE_HOME_URL } from '../lib/brand'
import { useSettingsConfig } from '../lib/settings'
import { isCurrent, NAV_GROUPS, type NavKey } from './navGroups'

// Re-exported: every page imports its key type from here.
export type { NavKey }

export function TopNav({ active }: { active: NavKey }) {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const brandName = getArkiveBrandName(lng, t('brand'))
  const settings = useSettingsConfig()

  const ITEMS: ShellNavItem[] = [
    { key: '/', label: t('nav.home'), active: active === '/' },
    ...NAV_GROUPS.map((group) => ({
      key: group.key,
      label: t(group.labelKey),
      children: group.children.map((child) => ({
        key: child.key,
        label: t(child.labelKey),
        active: isCurrent(child.key, active),
      })),
    })),
  ]

  return (
    <ArkiveMapTopBar
      homeUrl={ARKIVE_HOME_URL}
      homeLabel={t('brandHome')}
      brandName={brandName}
      brandSlogan={t('brandSlogan')}
      nav={{
        items: ITEMS,
        // The label needs the shell's own class to sit above the active item's
        // `::before` highlight pill; without it the active label is painted
        // over and reads as a blank chip.
        //
        // Only leaves reach this: the shell renders a dropdown's trigger as its
        // own button, so the group's non-route key ('autochess') never becomes
        // a link.
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
        current: theme,
        onChange: setTheme,
        menuLabel: t('themeMenu'),
        shortLabel: t('themeMenu'),
      }}
      loginLabel={t('login')}
      accountSlot={<ArkiveAccountControl language={i18n.language} settings={settings} />}
    />
  )
}
