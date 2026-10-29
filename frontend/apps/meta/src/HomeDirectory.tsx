import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconAnchor,
  IconApps,
  IconBook2,
  IconChevronRight,
  IconHistory,
  IconMap2,
  IconMessageCircle,
  IconSparkles,
  IconTool,
} from '@tabler/icons-react'

import {
  FEATURES,
  featureHref,
  localize,
  type FeatureKind,
  type GameFeature,
  type RecentFeature,
} from './featureCatalog'
import { GAME_LOGOS, IS_TOY, recentUpdateDays, siteHref, type SiteCard } from './sites'
import { TOOL_ICONS } from './toolIcons'
import { HomeCarousel } from './HomeCarousel'
import platformChangelog from './platform-changelog.json'
import { UPCOMING_PBZ } from './upcoming'

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

function gradient([from, to]: readonly [string, string], index: number): CSSProperties {
  return { '--c1': from, '--c2': to, '--i': index } as CSSProperties
}

/**
 * The homepage: a carousel of the open games, a row of round shortcuts to each
 * game and the site's own sections, then every tool in one dock.
 *
 * The portal is a directory before it is anything else, so a new game adds a
 * slide and a shortcut, and a new tool a dock entry -- never a redesign.
 */
export function HomeDirectory({ sites, updatedDates, recentlyUsed, onOpenSite, onOpenFeature }: {
  /** In display order; the caller decides whether a recent game leads. */
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
  const tools = FEATURES.filter((feature) => feature.kind === 'tool'
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
    <section className="home-directory" aria-labelledby="home-heading">
      <h1 id="home-heading" className="sr-only">{t('home.title')}</h1>
      <HomeCarousel sites={games} onOpenSite={onOpenSite} />

      <div className="home-shell">
        <nav className="home-quick" aria-label={t('landing.quick.label')}>
          {/* Phantom Blade Zero leads the row; it is not a SiteCard yet (see upcoming.ts). */}
          <a href={UPCOMING_PBZ.url} style={{ '--i': 0, '--qc': UPCOMING_PBZ.color } as CSSProperties}>
            <span className="home-quick-tile">
              <span className="home-quick-icon is-game"><img src={UPCOMING_PBZ.icon} alt="" /></span>
            </span>
            <span>{t(UPCOMING_PBZ.nameKey)}</span>
          </a>
          {games.map((site, index) => (
            <a key={site.id} href={siteHref(site)} style={{ '--i': index + 1, '--qc': site.color } as CSSProperties} onClick={() => onOpenSite(site)}>
              <span className="home-quick-tile">
                <span className="home-quick-icon is-game"><img src={site.icon ?? GAME_LOGOS[site.id]} alt="" /></span>
                {recentUpdateDays(updatedDates[site.id], now) !== undefined && <b>{badge}</b>}
              </span>
              <span>{t(site.nameKey)}</span>
            </a>
          ))}
          {entries.map(({ href, label, icon: EntryIcon, colors, fresh }, index) => (
            <a key={href} href={href} style={gradient(colors, games.length + 1 + index)}>
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
                      <small>{t(site.nameKey)}</small>
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
              {tools.map((tool, index) => {
                const site = games.find((item) => item.id === tool.gameId)
                const href = featureHref(tool, site)
                if (!site || !href) return null
                const ToolIcon = TOOL_ICONS[tool.id] ?? IconTool
                return (
                  <a key={tool.id} className="home-tool" href={href}
                    style={gradient(TOOL_COLORS[tool.id] ?? DEFAULT_TOOL_COLORS, index)}
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
  )
}
