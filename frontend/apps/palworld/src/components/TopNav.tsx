import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Info } from 'lucide-react'
import { ShellTopBar, ThemeToggle, type ShellNavItem } from '@gamemap/map-shell'
import { BuildInfo, Button, EngineToggle, Popover, PopoverContent, PopoverTrigger } from '@gamemap/ui'
import { LANGUAGES, LANGUAGE_LABELS } from '../i18n'
import { ARKIVE_HOME_LINK_PROPS, ARKIVE_HOME_URL, REPO_URL } from '../lib/brand'
import { getGameVersion } from '../lib/urls'
import { SITE_VERSION } from '../lib/siteVersion'
import {
  MAP_ENGINE_CHOICES,
  MAP_ENGINE_LABELS,
  type MapEngineChoice,
} from '../lib/mapEngineChoice'
import { GlobalSearchWidget } from './GlobalSearchWidget'
import { SiteInfo } from './SiteInfo'

function ArkiveMark() {
  return (
    <svg viewBox="0 0 320 285" className="size-9" aria-hidden="true">
      <path
        fill="currentColor"
        d="M160 24C95 24 47 70 47 136c0 30 10 54 31 71 55 16 109 16 164 0 21-18 31-41 31-71 0-66-48-112-113-112Z"
      />
      <path fill="currentColor" d="M63 207c35-13 68-13 97 0 30 13 63 13 99-1-28 29-61 37-99 25-38-11-70-19-97-24Z" />
      <path fill="currentColor" d="M75 235c33-10 61-10 85 1 24 11 53 9 87-4-24 32-53 41-87 27-34-12-62-20-85-24Z" />
      <path
        fill="var(--arkive-mark-cutout, #ffffff)"
        d="M73 72c10-13 24-20 41-20h92c17 0 31 7 41 20l14 37c7 18 4 25-10 29l-22-13c-7-4-13-5-19-4l-10 56c-3 14-9 23-19 28h-42c-10-5-16-14-19-28l-10-56c-6-1-12 0-19 4l-22 13c-14-4-17-11-10-29l14-37Z"
      />
      <path fill="currentColor" d="M92 105h12V93h12v12h12v12h-12v12h-12v-12H92Z" />
      <circle fill="currentColor" cx="205" cy="101" r="7" />
      <circle fill="currentColor" cx="222" cy="117" r="7" />
      <path fill="currentColor" d="m160 91 35 98h-35ZM154 82h12v119h-12Z" />
    </svg>
  )
}

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
      classNames={{
        root: 'palworld-topbar hidden h-14 border-b border-border bg-card text-card-foreground md:flex',
        left: 'gap-4',
        right: 'gap-1.5',
        trigger: 'h-9 rounded-lg border border-border bg-card px-2.5 text-foreground shadow-none hover:bg-secondary',
        menu: 'rounded-lg border-border bg-popover text-popover-foreground shadow-lg',
      }}
      leftSlot={
        /*
         * Brand lockup, first item in the shell's left cluster. Hidden below
         * `lg` rather than
         * shrunk: between `md` and `lg` the nav labels plus the right-hand
         * cluster already fill the top bar, and the zh-CN wordmark is
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
          className="hidden shrink-0 items-center gap-2.5 whitespace-nowrap pr-4 text-primary transition-colors hover:text-[color:var(--pal-ocean)] lg:inline-flex"
        >
          <ArkiveMark />
          <span className="flex flex-col leading-none">
            <strong className="text-base font-bold tracking-tight text-[color:var(--pal-ocean)]">{t('brand')}</strong>
            <small className="mt-1 text-xs font-semibold tracking-wide text-[color:var(--pal-gold-ink)]">{t('brandSlogan')}</small>
          </span>
        </a>
      }
      nav={{
        items,
        classNames: {
          item: 'group relative inline-flex h-10 items-center rounded-sm px-1 text-sm font-semibold text-foreground/65 hover:text-[color:var(--pal-ocean)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          itemActive: 'group relative inline-flex h-10 items-center rounded-sm px-1 text-sm font-semibold text-[color:var(--pal-ocean)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          label: 'relative inline-flex h-full items-center',
          labelActive: "after:pointer-events-none after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-4 after:-translate-x-1/2 after:rounded-full after:bg-[color:var(--pal-gold)] after:content-['']",
          chevron: 'size-3 opacity-50 transition-opacity group-hover:opacity-80',
        },
        renderItem: (item, className, labelClassName) => (
          <Link to={item.key as NavKey} className={className}>
            {labelClassName ? (
              <span data-slot="nav-item-label" className={labelClassName}>{item.label}</span>
            ) : item.label}
          </Link>
        ),
      }}
      search={<GlobalSearchWidget />}
      languageSwitcher={{
        languages: LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code] })),
        current: lng,
        onChange: (code) => void i18n.changeLanguage(code),
        // Reaches the trigger as aria-label + title, so it must be translated.
        menuLabel: t('settings.language'),
      }}
      rightExtras={
        <>
          {active === '/' && engine && onEngineChange && (
            <EngineToggle
              value={engine}
              choices={MAP_ENGINE_CHOICES}
              labels={MAP_ENGINE_LABELS}
              onChange={onEngineChange}
              label={t('engineMenu')}
            />
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
            // null in a toy build: the hash then renders as plain text instead
            // of a GitHub link the page can't reach.
            repoUrl={REPO_URL}
            siteVersion={<Link to="/changelog">v{SITE_VERSION}</Link>}
            // Every row label is injected: the package's own defaults are
            // English-only, so an unlabelled row stayed English next to the
            // translated version row.
            labels={{
              siteVersion: t('changelog.title'),
              commit: t('build.commit'),
              buildTime: t('build.time'),
              gameVersion: t('build.game'),
              repo: t('build.info'),
            }}
          />
        </>
      }
    />
  )
}
