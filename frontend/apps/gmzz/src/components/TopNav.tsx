import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArkiveAccountControl } from '@gamemap/auth'
import { ArkiveMapTopBar, getArkiveBrandName, useTheme, type ShellNavItem } from '@gamemap/map-shell'
import { changeLanguagePreference, LANGUAGES, LANGUAGE_LABELS, type Language } from '../i18n'
import { ARKIVE_HOME_URL } from '../lib/brand'
import { useSettingsConfig } from '../lib/settings'

export type NavKey =
  | '/'
  | '/traintrade'
  | '/utopia'
  | '/reforge'
  | '/score'
  | '/tools/league-points'
  | '/autochess'
  | '/autochess/chess'
  | '/autochess/bonds'
  | '/autochess/items'
  | '/autochess/talents'
  | '/changelog'

/**
 * 愚者棋局's five pages sit in a dropdown rather than five more top-level items.
 * The shell supports it through `ShellNavItem.children` (see
 * `packages/map-shell/src/ShellTopBar.tsx`); palworld folds eighteen pages into
 * four entries the same way.
 *
 * Pages under it pass `active="/autochess"`, so the group highlights as a whole
 * — which is what a reader wants from a section, and avoids every child having
 * to be listed twice.
 */
const AUTOCHESS_CHILDREN: { key: NavKey; labelKey: string }[] = [
  { key: '/autochess', labelKey: 'autochess.rules.navTitle' },
  { key: '/autochess/chess', labelKey: 'autochess.pieces.title' },
  { key: '/autochess/bonds', labelKey: 'autochess.bonds.title' },
  { key: '/autochess/items', labelKey: 'autochess.items.title' },
  { key: '/autochess/talents', labelKey: 'autochess.talents.title' },
]

export function TopNav({ active }: { active: NavKey }) {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const brandName = getArkiveBrandName(lng, t('brand'))
  const settings = useSettingsConfig()

  const ITEMS: ShellNavItem[] = [
    { key: '/', label: t('nav.home'), active: active === '/' },
    { key: '/traintrade', label: t('nav.traintrade'), active: active === '/traintrade' },
    {
      key: 'autochess',
      label: t('nav.autochess'),
      children: AUTOCHESS_CHILDREN.map((child) => ({
        key: child.key,
        label: t(child.labelKey),
        active: active === child.key,
      })),
    },
    { key: '/utopia', label: t('nav.utopia'), active: active === '/utopia' },
    { key: '/reforge', label: t('nav.reforge'), active: active === '/reforge' },
    { key: '/score', label: t('nav.score'), active: active === '/score' },
    { key: '/tools/league-points', label: t('nav.league'), active: active === '/tools/league-points' },
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
