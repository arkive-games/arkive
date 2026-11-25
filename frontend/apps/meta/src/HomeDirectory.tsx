import { GuideLanguageNote } from './GuideLanguageNote'
import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@gamemap/ui'
import {
  IconAnchor,
  IconApps,
  IconBook2,
  IconChevronRight,
  IconDeviceMobileDown,
  IconHistory,
  IconMap2,
  IconMessageCircle,
  IconSparkles,
  IconTool,
} from '@tabler/icons-react'

import {
  FEATURES,
  HOME_TOOL_IDS,
  featureHref,
  localize,
  type FeatureKind,
  type GameFeature,
  type RecentFeature,
} from './featureCatalog'
import { GAME_LOGOS, IS_TOY, recentUpdateDays, siteHref, type SiteCard } from './sites'
import { TOOL_ICONS } from './toolIcons'
import { HomeCarousel } from './HomeCarousel'
import { homeGameShortcuts } from './homeGameShelf'
import platformChangelog from './platform-changelog.json'

const KIND_ICONS: Record<FeatureKind, typeof IconTool> = {
  tool: IconTool,
  map: IconMap2,
  wiki: IconBook2,
}

/** Icon-square gradients per tool; a tool without one gets the default pair. */
const TOOL_COLORS: Record<string, readonly [string, string]> = {
  'palworld-breeding': ['#ff9a8b', '#ff4f8f'],
  'palworld-stat-simulator': ['#7ad7ff', '#4f7bff'],
  'gmzz-score': ['#ffd36a', '#ff8a3d'],
  'gmzz-traintrade-station': ['#a99bff', '#6a5cff'],
  'gmzz-league-points': ['#7eeac0', '#1fb39a'],
}
const DEFAULT_TOOL_COLORS = ['#ffa8d9', '#c46bff'] as const

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const standalone = (typeof window.matchMedia === 'function'
      && window.matchMedia('(display-mode: standalone)').matches)
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    setInstalled(standalone)

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }
    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const install = async () => {
    const prompt = deferredPrompt
    if (!prompt) {
      setShowHelp(true)
      return
    }
    setDeferredPrompt(null)
    await prompt.prompt()
    await prompt.userChoice
  }

  return { canAddToHome: !installed, install, showHelp, setShowHelp }
}

function gradient([from, to]: readonly [string, string], index: number): CSSProperties {
  return { '--c1': from, '--c2': to, '--i': index } as CSSProperties
}

function GameShortcutImage({ site }: { site: SiteCard }) {
  const [index, setIndex] = useState(0)
  const sources = [...new Set([site.shortcutAvatar ?? site.icon, site.thumb, site.bg].filter(Boolean))]
  const src = sources[index]
  return (
    <span className="home-quick-icon is-game" data-game={site.id}>
      {src && <img key={src} src={src} onError={() => setIndex(index + 1)}
        style={{ objectPosition: src === site.bg ? site.bgPosition : undefined }} alt="" draggable={false} />}
    </span>
  )
}

/**
 * The homepage: a carousel of the open games, a row of round shortcuts to each
 * game and the site's own sections, then the editorial tool dock.
 *
 * Game artwork and editorial tool selections retain the existing composition.
 * The complete tool registry and the homepage selection are independent.
 */
export function HomeDirectory({ sites, updatedDates, recentlyUsed, onOpenSite, onOpenFeature }: {
  /** Eligible sites for the independently curated homepage sections. */
  sites: readonly SiteCard[]
  /** Newest changelog date per game id; a recent one earns its shortcut a badge. */
  updatedDates: Readonly<Record<string, string>>
  /** Newest first; the row is omitted while this is empty. */
  recentlyUsed: readonly RecentFeature[]
  onOpenSite: (site: SiteCard) => void
  onOpenFeature: (feature: GameFeature, site: SiteCard) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const [now] = useState(() => new Date())
  const games = sites.filter((site) => siteHref(site))
  const shortcutGames = homeGameShortcuts(games)
  const { canAddToHome, install, showHelp, setShowHelp } = usePwaInstall()
  const tools = FEATURES.filter((feature) => feature.kind === 'tool' && HOME_TOOL_IDS.has(feature.id)
    && games.some((site) => site.id === feature.gameId))
  const badge = t('landing.quick.badge')

  const entries: { href: string; label: string; icon: typeof IconTool; colors: readonly [string, string]; fresh?: boolean }[] = [
    { href: '#games', label: t('landing.quick.allGames'), icon: IconApps, colors: ['#ff8a4c', '#ff3d5a'] },
    ...(tools.length ? [{ href: '#tools', label: t('landing.quick.tools'), icon: IconTool, colors: ['#a47bff', '#6a3dff'] as const }] : []),
    // The Toy build has no backend, so it has no forum to link to.
    ...(IS_TOY ? [] : [{ href: '#forum', label: t('landing.quick.forum'), icon: IconMessageCircle, colors: ['#5fa2ff', '#3d5bff'] as const }]),
    {
      href: '#updates',
      label: t('landing.quick.updates'),
      icon: IconSparkles,
      colors: ['#ffcb52', '#ff8a1f'],
      fresh: recentUpdateDays(platformChangelog.entries[0]?.date, now) !== undefined,
    },
  ]

  return (
    <>
      <section className="home-directory" aria-labelledby="home-heading">
      <h1 id="home-heading" className="sr-only">{t('home.title')}</h1>
      <HomeCarousel sites={games} onOpenSite={onOpenSite} />

      <div className="home-shell">
        <nav className="home-quick" aria-label={t('landing.quick.label')}>
          {shortcutGames.map((site, index) => (
            <a key={site.id} href={siteHref(site)} draggable={false} style={{ '--i': index, '--qc': site.color } as CSSProperties} onClick={() => onOpenSite(site)}>
              <span className="home-quick-tile">
                <GameShortcutImage site={site} />
                {recentUpdateDays(updatedDates[site.id], now) !== undefined && <b>{badge}</b>}
              </span>
              <span>{t(site.nameKey)}<GuideLanguageNote site={site} /></span>
            </a>
          ))}
          {entries.map(({ href, label, icon: EntryIcon, colors, fresh }, index) => (
            <a key={href} href={href} style={gradient(colors, shortcutGames.length + 1 + index)}>
              <span className="home-quick-tile">
                <span className="home-quick-icon"><EntryIcon stroke={1.9} aria-hidden="true" /></span>
                {fresh && <b>{badge}</b>}
              </span>
              <span>{label}</span>
            </a>
          ))}
        </nav>

        {recentlyUsed.length > 0 && (
          <nav className="directory-recent" aria-label={t('home.recentlyUsed')}>
            <span className="directory-recent-label">
              <IconHistory className="size-4" stroke={1.8} aria-hidden="true" />
              {t('home.recentlyUsed')}
            </span>
            <ul>
              {recentlyUsed.map(({ feature, site }) => {
                const KindIcon = KIND_ICONS[feature.kind]
                return (
                  <li key={feature.id}>
                    <a href={featureHref(feature, site)} onClick={() => onOpenFeature(feature, site)}>
                      <KindIcon className="size-4 shrink-0" stroke={1.8} aria-hidden="true" />
                      <strong>{localize(feature.name, language)}</strong>
                      <small>{t(site.nameKey)}<GuideLanguageNote site={site} /></small>
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>
        )}

        {tools.length > 0 && (
          <section className="home-dock" aria-labelledby="home-dock-heading">
            <header className="home-dock-head">
              <span className="home-dock-mark" aria-hidden="true"><IconAnchor stroke={2} /></span>
              <h2 id="home-dock-heading">{t('landing.dock.title')}</h2>
              <p>{t('landing.dock.subtitle')}</p>
              <a href="#tools" className="home-more">{t('landing.dock.all')} →</a>
            </header>
            <div className="home-dock-tools">
              {canAddToHome && (
                <button type="button" className="home-tool home-tool-install"
                  style={gradient(['#ffbf69', '#ff6a64'], 0)}
                  aria-label={t('landing.addToHome.label')} onClick={() => void install()}>
                  <span className="home-tool-icon" aria-hidden="true">
                    <IconDeviceMobileDown stroke={1.9} />
                  </span>
                  <span className="home-tool-copy">
                    <strong>{t('landing.addToHome.title')}</strong>
                    <small>{t('landing.addToHome.description')}</small>
                  </span>
                  <IconChevronRight className="home-tool-arrow" stroke={2} aria-hidden="true" />
                </button>
              )}
              {tools.map((tool, index) => {
                const site = games.find((item) => item.id === tool.gameId)
                const href = featureHref(tool, site)
                if (!site || !href) return null
                const ToolIcon = TOOL_ICONS[tool.id] ?? IconTool
                return (
                  <a key={tool.id} className="home-tool" href={href}
                  style={gradient(TOOL_COLORS[tool.id] ?? DEFAULT_TOOL_COLORS, index + (canAddToHome ? 1 : 0))}
                    onClick={() => onOpenFeature(tool, site)}>
                    <span className="home-tool-icon" aria-hidden="true">
                      <ToolIcon stroke={1.9} />
                      <img src={site.icon ?? GAME_LOGOS[site.id]} alt="" />
                    </span>
                    <span className="home-tool-copy">
                      <strong>{localize(tool.name, language)}</strong>
                      <small>{tool.description ? localize(tool.description, language) : t(site.nameKey)}</small>
                    </span>
                    <IconChevronRight className="home-tool-arrow" stroke={2} aria-hidden="true" />
                  </a>
                )
              })}
            </div>
          </section>
        )}
      </div>
      </section>
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent size="sm" closeButtonProps={{ 'aria-label': t('landing.addToHome.close') }}>
          <DialogHeader>
            <DialogTitle>{t('landing.addToHome.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('landing.addToHome.dialogDescription')}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  )
}
