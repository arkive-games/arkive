import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Info } from 'lucide-react'
import { ShellTopBar, ThemeToggle, type ShellNavItem } from '@gamemap/map-shell'
import { BuildInfo, Button, Popover, PopoverContent, PopoverTrigger } from '@gamemap/ui'
import { LANGUAGES, LANGUAGE_LABELS } from '../i18n'
import { ARKIVE_HOME_LINK_PROPS, ARKIVE_HOME_URL } from '../lib/brand'
import { getGameVersion } from '../lib/urls'
import { SITE_VERSION } from '../lib/siteVersion'
import type { MapEngineChoice } from '../lib/mapEngineChoice'
import { EngineToggle } from './EngineToggle'
import { GlobalSearchWidget } from './GlobalSearchWidget'
import { SiteInfo } from './SiteInfo'

export type NavKey = '/' | '/pals' | '/breeding' | '/passives' | '/active-skills' | '/partner-skills' | '/stat-simulator' | '/items' | '/buildings' | '/merchants' | '/technology' | '/dungeons' | '/quests' | '/basecamp' | '/research' | '/raids' | '/fishing' | '/changelog'

/**
 * Unified top navigation shared by every page (map, Paldeck, breeding). The
 * active page is highlighted via the shell's `nav` feature; routing stays here
 * so the shell package remains router-agnostic.
 */
export function TopNav({ active, engine, onEngineChange }: {
  active: NavKey
  /**
   * Map-engine switcher, only meaningful on the map page: the choice is owned by
   * `App` (it decides which engine to mount), so both the current value and the
   * setter are passed in. Omitted by every other page.
   */
  engine?: MapEngineChoice
  onEngineChange?: (choice: MapEngineChoice) => void
}) {
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
      leftSlot={
        /*
         * Brand wordmark, first item in the shell's left cluster (which uses
         * `gap-6`, so no margin is needed here). Hidden below `lg` rather than
         * shrunk: between `md` and `lg` the nav labels plus the right-hand
         * cluster already fill the 12-unit-tall row, and the zh-CN wordmark is
         * the longest string in it — dropping the brand keeps the navigation,
         * the more important half, uncramped. `shrink-0` + `whitespace-nowrap`
         * stop it from wrapping or being squeezed once it is visible.
         */
        <a
          href={ARKIVE_HOME_URL}
          {...ARKIVE_HOME_LINK_PROPS}
          data-testid="brand-link"
          aria-label={t('brandHome')}
          title={t('brandHome')}
          className="hidden shrink-0 items-center whitespace-nowrap text-sm font-bold tracking-tight text-foreground transition-colors hover:text-primary lg:inline-flex"
        >
          {t('brand')}
        </a>
      }
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
          {active === '/' && engine && onEngineChange && (
            <EngineToggle value={engine} onChange={onEngineChange} />
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="contact-menu"
                aria-label={t('siteInfo.tab')}
                title={t('siteInfo.tab')}
              >
                <Info className="size-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-[70vh] w-[320px] overflow-y-auto">
              <SiteInfo />
            </PopoverContent>
          </Popover>
          <ThemeToggle labels={{ auto: t('themeAuto'), light: t('themeLight'), dark: t('themeDark') }} />
          <BuildInfo
            commit={__BUILD_GIT_COMMIT__}
            buildTime={__BUILD_TIME__}
            dev={import.meta.env.DEV}
            gameVersion={getGameVersion()}
            siteVersion={<Link to="/changelog">v{SITE_VERSION}</Link>}
            labels={{ siteVersion: t('changelog.title') }}
          />
        </>
      }
    />
  )
}
