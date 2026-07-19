import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ShellTopBar, ThemeToggle, type ShellNavItem } from '@gamemap/map-shell'
import { BuildInfo } from '@gamemap/ui'
import { LANGUAGES, LANGUAGE_LABELS } from '../i18n'
import { getGameVersion } from '../lib/urls'
import { GlobalSearchWidget } from './GlobalSearchWidget'

export type NavKey = '/' | '/pals' | '/breeding' | '/passives' | '/active-skills' | '/partner-skills' | '/stat-simulator' | '/items' | '/buildings' | '/merchants' | '/technology' | '/dungeons' | '/quests' | '/basecamp' | '/research' | '/raids' | '/fishing'

/**
 * Unified top navigation shared by every page (map, Paldeck, breeding). The
 * active page is highlighted via the shell's `nav` feature; routing stays here
 * so the shell package remains router-agnostic.
 */
export function TopNav({ active }: { active: NavKey }) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const items: ShellNavItem[] = [
    { key: '/', label: t('breeding.navMap'), active: active === '/' },
    {
      key: 'pals',
      label: t('nav.pals'),
      children: [
        { key: '/pals', label: t('pal.title'), active: active === '/pals' },
        { key: '/breeding', label: t('breeding.navBreeding'), active: active === '/breeding' },
        { key: '/passives', label: t('pal.section.passives'), active: active === '/passives' },
        { key: '/active-skills', label: t('pal.section.activeSkills'), active: active === '/active-skills' },
        { key: '/partner-skills', label: t('partner.title'), active: active === '/partner-skills' },
        {
          key: '/stat-simulator',
          label: t('sim.title', { defaultValue: 'Stat Simulator' }),
          active: active === '/stat-simulator',
        },
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
        {
          key: '/research',
          label: t('research.title', { defaultValue: 'Research' }),
          active: active === '/research',
        },
        { key: '/dungeons', label: t('dungeon.title'), active: active === '/dungeons' },
        { key: '/quests', label: t('quest.title'), active: active === '/quests' },
        {
          key: '/basecamp',
          label: t('basecamp.title', { defaultValue: 'Base Camp' }),
          active: active === '/basecamp',
        },
        {
          key: '/raids',
          label: t('raids.title', { defaultValue: 'Base Raids' }),
          active: active === '/raids',
        },
        {
          key: '/fishing',
          label: t('fishing.title'),
          active: active === '/fishing',
        },
      ],
    },
  ]

  return (
    <ShellTopBar
      classNames={{ root: 'hidden border-b border-border bg-card text-card-foreground md:flex' }}
      nav={{
        items,
        renderItem: (item, className) => (
          <Link to={item.key as NavKey} className={className}>
            {item.label}
          </Link>
        ),
      }}
      search={<GlobalSearchWidget />}
      languageSwitcher={{
        languages: LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code] })),
        current: lng,
        onChange: (code) => void i18n.changeLanguage(code),
        menuLabel: 'language',
      }}
      rightExtras={
        <>
          <ThemeToggle labels={{ auto: t('themeAuto'), light: t('themeLight'), dark: t('themeDark') }} />
          <BuildInfo
            commit={__BUILD_GIT_COMMIT__}
            buildTime={__BUILD_TIME__}
            dev={import.meta.env.DEV}
            gameVersion={getGameVersion()}
          />
        </>
      }
    />
  )
}
