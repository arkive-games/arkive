import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ArkiveMapTopBar, useTheme, type ShellNavItem } from '@gamemap/map-shell'
import { LANGUAGES, LANGUAGE_LABELS } from '../i18n'
import { ARKIVE_HOME_LINK_PROPS, ARKIVE_HOME_URL } from '../lib/brand'

export type NavKey = '/' | '/pals' | '/breeding' | '/passives' | '/active-skills' | '/partner-skills' | '/stat-simulator' | '/items' | '/buildings' | '/merchants' | '/technology' | '/dungeons' | '/quests' | '/basecamp' | '/research' | '/raids' | '/fishing' | '/changelog'

export function TopNav({ active }: { active: NavKey }) {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const items: ShellNavItem[] = [
    { key: '/', label: t('breeding.navMap'), active: active === '/' },
    { key: '/breeding', label: t('breeding.navBreeding'), active: active === '/breeding' },
    {
      key: 'pals',
      label: t('nav.pals'),
      children: [
        { key: '/pals', label: t('pal.title'), active: active === '/pals' },
        { key: '/passives', label: t('pal.section.passives'), active: active === '/passives' },
        { key: '/active-skills', label: t('pal.section.activeSkills'), active: active === '/active-skills' },
        { key: '/partner-skills', label: t('partner.title'), active: active === '/partner-skills' },
        { key: '/stat-simulator', label: t('sim.title'), active: active === '/stat-simulator' },
      ],
    },
    {
      key: 'database',
      label: t('nav.database'),
      children: [
        { key: '/items', label: t('item.title'), active: active === '/items' },
        { key: '/buildings', label: t('building.title'), active: active === '/buildings' },
        { key: '/merchants', label: t('merchant.title'), active: active === '/merchants' },
        { key: '/technology', label: t('tech.title'), active: active === '/technology' },
        { key: '/research', label: t('research.title', { defaultValue: 'Research' }), active: active === '/research' },
        { key: '/dungeons', label: t('dungeon.title'), active: active === '/dungeons' },
        { key: '/quests', label: t('quest.title'), active: active === '/quests' },
        { key: '/basecamp', label: t('basecamp.title', { defaultValue: 'Base Camp' }), active: active === '/basecamp' },
        { key: '/raids', label: t('raids.title', { defaultValue: 'Base Raids' }), active: active === '/raids' },
        { key: '/fishing', label: t('fishing.title'), active: active === '/fishing' },
      ],
    },
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
        languages: LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code] })),
        current: lng,
        onChange: (code) => void i18n.changeLanguage(code),
        menuLabel: t('settings.language'),
        shortLabel: t('settings.language'),
      }}
      themeSwitcher={{
        labels: {
          auto: t('themeAuto'),
          light: t('themeLight'),
          dark: t('themeDark'),
        },
        current: theme,
        onChange: setTheme,
        menuLabel: t('settings.theme'),
        shortLabel: t('settings.theme'),
      }}
      loginLabel={t('auth.login')}
    />
  )
}
