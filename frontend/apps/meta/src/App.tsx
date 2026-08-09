import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountDialog, ArkiveAccountControl, authStringsFor, useAuth } from '@gamemap/auth'
import {
  ArkiveMapTopBar,
  ArkiveMark,
  ArkiveMobileHeader,
  getArkiveBrandName,
  useTheme,
  type ShellNavItem,
} from '@gamemap/map-shell'
import {
  IconArrowRight,
  IconArrowUpRight,
  IconBookmark,
  IconCompass,
  IconHammer,
  IconMap2,
  IconSailboat,
  IconSearch,
  IconSparkles,
} from '@tabler/icons-react'
import { LANGUAGES, LANGUAGE_LABELS } from './i18n'
import {
  IS_TOY,
  VISIBLE_SITES,
  firstPlayableSite,
  loadSiteClickCounts,
  rankSitesByClicks,
  siteHref,
  type SiteCard,
  type SiteClickCounts,
} from './sites'
import { AllGamesPage } from './AllGamesPage'
import { AuthenticatedControls } from './AuthenticatedControls'
import { ForumPage } from './ForumPage'
import {
  AccountCenterPage,
  NotificationCenterPage,
  PublicUserProfilePage,
  type AccountSection,
  type NotificationSection,
  type PublicProfileSection,
} from './UserSystemPages'
import { MetaMobileNav } from './MetaMobileNav'
import { DEFAULT_AVATAR_SRC } from './avatarPresets'
import { avatarUrl } from './userSystemData'
import { useUserSystem } from './UserSystemState'
import { defineMemoryRecord, useMemoryState } from '@gamemap/state-memory'

const NAV_KEYS = ['discoverGames', 'allGames', 'tools', 'forum', 'favorites'] as const
type HomeRoute =
  | { view: 'discoverGames' }
  | { view: 'allGames' }
  | { view: 'forum' }
  | { view: 'notifications'; section: NotificationSection }
  | { view: 'account'; section: AccountSection }
  | { view: 'publicProfile'; userId: string; section: PublicProfileSection }

const NOTIFICATION_SECTIONS = new Set<NotificationSection>(['replies', 'mentions', 'likes', 'system', 'settings'])
const ACCOUNT_SECTIONS = new Set<AccountSection>(['edit', 'favorites', 'posts', 'comments', 'fans', 'following', 'privacy'])
const PUBLIC_PROFILE_SECTIONS = new Set<PublicProfileSection>(['posts', 'comments', 'favorites', 'fans', 'following'])
interface RecentDestination {
  id: string
  gameId: string
  route: string
  title: string
  timestamp: number
}

const recentDestinationsRecord = defineMemoryRecord({
  id: 'recent-destinations', namespace: 'site', surface: 'portal', stateClass: 'durable_progress',
  schemaVersion: '1.0.0', defaultValue: () => [] as RecentDestination[],
  validate: (value: unknown): value is RecentDestination[] => Array.isArray(value)
    && value.length <= 10
    && value.every((item) => Boolean(item) && typeof item === 'object'
      && typeof (item as RecentDestination).id === 'string'
      && typeof (item as RecentDestination).gameId === 'string'
      && typeof (item as RecentDestination).route === 'string'
      && typeof (item as RecentDestination).title === 'string'
      && typeof (item as RecentDestination).timestamp === 'number'),
  retentionMs: 30 * 24 * 60 * 60 * 1_000,
})

function recentDestination(site: SiteCard, route: string, title: string): RecentDestination {
  return {
    id: `game:${site.id}`,
    gameId: site.id,
    route,
    title,
    timestamp: Date.now(),
  }
}
function routeFromHash(): HomeRoute {
  const [root, value, detail] = window.location.hash.replace(/^#/, '').split('/')
  if (root === 'games') return { view: 'allGames' }
  if (root === 'forum') return { view: 'forum' }
  if (root === 'notifications') {
    const section = NOTIFICATION_SECTIONS.has(value as NotificationSection)
      ? value as NotificationSection
      : 'settings'
    return { view: 'notifications', section }
  }
  if (root === 'account') {
    const section = ACCOUNT_SECTIONS.has(value as AccountSection) ? value as AccountSection : 'edit'
    return { view: 'account', section }
  }
  if (root === 'user' && value) {
    const section = PUBLIC_PROFILE_SECTIONS.has(detail as PublicProfileSection)
      ? detail as PublicProfileSection
      : 'posts'
    return { view: 'publicProfile', userId: decodeURIComponent(value), section }
  }
  return { view: 'discoverGames' }
}

export default function App() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [clickCounts, setClickCounts] = useState<SiteClickCounts>({})
  const [noticeId, setNoticeId] = useState(0)
  const [activeRoute, setActiveRoute] = useState<HomeRoute>(routeFromHash)
  const lng = i18n.resolvedLanguage ?? 'zh-CN'
  const brandName = getArkiveBrandName(lng, t('brand.name'))

  useEffect(() => {
    const controller = new AbortController()
    void loadSiteClickCounts(controller.signal).then(setClickCounts)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    document.documentElement.lang = lng
  }, [lng])

  useEffect(() => {
    const updateView = () => {
      setActiveRoute(routeFromHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', updateView)
    return () => window.removeEventListener('hashchange', updateView)
  }, [])

  useEffect(() => {
    if (!noticeId) return
    const timeout = window.setTimeout(() => setNoticeId(0), 4200)
    return () => window.clearTimeout(timeout)
  }, [noticeId])

  const rankedSites = useMemo(
    () => rankSitesByClicks(VISIBLE_SITES, clickCounts),
    [clickCounts],
  )
  const featuredSite = firstPlayableSite(rankedSites)
  const showComingSoon = () => setNoticeId((value) => value + 1)
  const auth = useAuth()
  const [accountOpen, setAccountOpen] = useState(false)
  const authStrings = authStringsFor(i18n.language)
  const isSignedIn = auth.status === 'authenticated'
  const { state: userSystemState, toggleFavoriteGame } = useUserSystem()
  const [recentDestinations, setRecentDestinations] = useMemoryState(recentDestinationsRecord)
  const [memoryNow] = useState(Date.now)
  const rememberSite = (site: SiteCard) => {
    const route = siteHref(site)
    if (!route) return
    const destination = recentDestination(site, route, t(site.nameKey))
    setRecentDestinations((current) => [
      destination,
      ...current.filter((item) => item.id !== destination.id),
    ].slice(0, 10))
  }
  const continueDestination = recentDestinations.find((destination) =>
    memoryNow - destination.timestamp < 30 * 24 * 60 * 60 * 1_000
    && VISIBLE_SITES.some((site) => site.id === destination.gameId && siteHref(site)))
  const continueSite = continueDestination
    ? VISIBLE_SITES.find((site) => site.id === continueDestination.gameId)
    : undefined
  const currentAvatar = auth.user
    ? userSystemState.profile.avatarSrc ?? DEFAULT_AVATAR_SRC
    : avatarUrl('arkive-anonymous', 96)
  const logout = () => {
    void auth.logout()
    window.location.hash = '#top'
  }
  const navItems: ShellNavItem[] = NAV_KEYS.map((key) => ({
    key,
    label: t(`nav.${key}`),
    active: key === activeRoute.view || (key === 'favorites' && activeRoute.view === 'account' && activeRoute.section === 'favorites'),
    children: key === 'allGames'
      ? VISIBLE_SITES.map((site) => ({
          key: `game:${site.id}`,
          label: t(site.nameKey),
        }))
      : undefined,
  }))

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    showComingSoon()
  }

  return (
    <div id="top" className="min-h-dvh overflow-x-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] text-foreground md:pb-0">
      <ArkiveMobileHeader
        homeUrl="#top"
        homeLabel={brandName}
        brandName={brandName}
        loginLabel={t('auth.login')}
        accountControl={isSignedIn ? (
          <a
            href="#account/edit"
            aria-label={t('userSystem.account.open')}
            className="size-11 shrink-0 overflow-hidden rounded-full border-2 border-primary/45 bg-muted p-0.5"
          >
            <img
              src={currentAvatar}
              alt={auth.user?.name ?? ''}
              className="size-full rounded-full object-cover"
            />
          </a>
        ) : (
          <ArkiveAccountControl language={i18n.language} variant="mobileHeader" />
        )}
      />
      <ArkiveMapTopBar
        homeUrl="#top"
        homeLabel={brandName}
        brandName={brandName}
        brandSlogan={t('brand.slogan')}
        nav={{
          items: navItems,
          onDropdownTriggerClick: (item) => {
            if (item.key === 'allGames') window.location.hash = '#games'
          },
          renderItem: (item, className, labelClassName) => {
            const label = <span data-slot="nav-item-label" className={labelClassName}>{item.label}</span>
            const game = item.key.startsWith('game:')
              ? VISIBLE_SITES.find((site) => item.key === `game:${site.id}`)
              : undefined
            const gameHref = game ? siteHref(game) : undefined
            return game && gameHref ? (
              <a href={gameHref} className={className} onClick={() => rememberSite(game)}>{label}</a>
            ) : game ? (
              // Announced but not open yet: keep it listed, without a href.
              <button
                type="button"
                className={className}
                onClick={(event) => {
                  event.currentTarget.blur()
                  showComingSoon()
                }}
              >
                {label}
                <span className="nav-soon-badge">{t('comingSoon.badge')}</span>
              </button>
            ) : item.key === 'discoverGames' ? (
              <a href="#explore" className={className}>{label}</a>
            ) : item.key === 'forum' ? (
              <a href="#forum" className={className}>{label}</a>
            ) : item.key === 'favorites' && isSignedIn ? (
              <a href="#account/favorites" className={className}>{label}</a>
            ) : (
              <button
                type="button"
                className={className}
                onClick={(event) => {
                  event.currentTarget.blur()
                  showComingSoon()
                }}
              >
                {label}
              </button>
            )
          },
        }}
        languageSwitcher={{
          languages: LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code] })),
          current: lng,
          onChange: (code) => void i18n.changeLanguage(code),
          menuLabel: t('language'),
          shortLabel: t('language'),
        }}
        themeSwitcher={{
          labels: {
            auto: t('theme.auto'),
            light: t('theme.light'),
            dark: t('theme.dark'),
          },
          current: theme,
          onChange: setTheme,
          menuLabel: t('theme.menu'),
          shortLabel: t('theme.short'),
        }}
        loginLabel={t('auth.login')}
        accountSlot={isSignedIn
          ? <AuthenticatedControls />
          : <ArkiveAccountControl language={i18n.language} />}
      />

      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} strings={authStrings} />

      {activeRoute.view === 'allGames' ? (
        <AllGamesPage
          sites={VISIBLE_SITES}
          onAuthRequired={() => setAccountOpen(true)}
          onOpenSite={rememberSite}
        />
      ) : activeRoute.view === 'forum' ? (
        <ForumPage
          sites={VISIBLE_SITES}
          onComingSoon={showComingSoon}
          onAuthRequired={() => setAccountOpen(true)}
        />
      ) : activeRoute.view === 'notifications' && isSignedIn ? (
        <NotificationCenterPage section={activeRoute.section} />
      ) : activeRoute.view === 'account' && isSignedIn ? (
        <AccountCenterPage section={activeRoute.section} onLogout={logout} />
      ) : activeRoute.view === 'publicProfile' ? (
        <PublicUserProfilePage
          userId={activeRoute.userId}
          section={activeRoute.section}
          onAuthRequired={() => setAccountOpen(true)}
        />
      ) : (
        <main>
          <section className="home-shell hero-section" aria-labelledby="home-heading">
          <div className="hero-copy">
            <p className="hero-eyebrow">
              <span aria-hidden="true" />
              {t('hero.eyebrow')}
            </p>
            <h1 id="home-heading" className="hero-title">
              <span>{t('hero.lead')}</span>
              <span><em>{t('hero.highlight')}</em>{t('hero.tail')}</span>
            </h1>
            <p className="hero-description">{t('hero.description')}</p>
            <form className="hero-search" onSubmit={submitSearch}>
              <IconSearch className="size-5 shrink-0" stroke={1.8} aria-hidden="true" />
              <input type="search" aria-label={t('search.placeholder')} placeholder={t('search.placeholder')} />
              <button type="submit">{t('search.action')}</button>
            </form>
            {continueDestination && continueSite ? (
              <a
                className="hero-continue"
                href={siteHref(continueSite) ?? continueDestination.route}
                onClick={() => rememberSite(continueSite)}
              >
                <IconCompass className="size-5" stroke={1.7} aria-hidden="true" />
                <span>
                  <small>{t('hero.continue')}</small>
                  <strong>{t(continueSite.nameKey)}</strong>
                </span>
                <IconArrowRight className="size-4" stroke={1.8} aria-hidden="true" />
              </a>
            ) : null}
          </div>

          {featuredSite ? (
            <FeaturedGame site={featuredSite} onOpen={() => rememberSite(featuredSite)} />
          ) : (
            <div className="featured-empty" aria-live="polite">
              <IconCompass className="size-10" stroke={1.5} />
              <p>{t('comingSoon.title')}</p>
            </div>
          )}
          </section>

          <section id="explore" className="home-shell explore-section" aria-labelledby="explore-heading">
          <div className="section-heading">
            <div>
              <h2 id="explore-heading">{t('explore.title')}</h2>
              <p>{t('explore.description')}</p>
            </div>
            <a href="#games" className="text-action">
              {t('action.browseAll')}
              <IconArrowRight className="size-4" stroke={1.8} aria-hidden="true" />
            </a>
          </div>

          <div className="game-shelf">
            {rankedSites.map((site) => (
              <GameCard
                key={site.id}
                site={site}
                favorite={userSystemState.favoriteGameIds.includes(site.id)}
                onFavorite={() => {
                  if (!isSignedIn) {
                    setAccountOpen(true)
                    return
                  }
                  toggleFavoriteGame(site.id)
                }}
                onOpen={() => rememberSite(site)}
              />
            ))}
            <ComingSoonCard onClick={showComingSoon} />
          </div>
          </section>

          <section className="home-shell join-section" aria-labelledby="join-heading">
          <div>
            <h2 id="join-heading">{t('cta.title')}</h2>
            <p>{t('cta.description')}</p>
          </div>
          <button type="button" onClick={showComingSoon}>{t('cta.action')}</button>
          </section>
        </main>
      )}

      <HomeFooter onComingSoon={showComingSoon} />

      {noticeId > 0 && (
        <div key={noticeId} className="coming-soon-toast" role="status" aria-live="polite">
          <span className="toast-icon"><IconHammer className="size-5" stroke={1.8} /></span>
          <span>
            <strong>{t('notice.title')}</strong>
            <small>{t('notice.description')}</small>
          </span>
        </div>
      )}

      <MetaMobileNav
        activeView={activeRoute.view}
        noticeId={noticeId}
        isSignedIn={isSignedIn}
        language={lng}
        theme={theme}
        onLanguageChange={(code) => void i18n.changeLanguage(code)}
        onThemeChange={setTheme}
        onComingSoon={showComingSoon}
      />
    </div>
  )
}

function FeaturedGame({ site, onOpen }: { site: SiteCard; onOpen: () => void }) {
  const { t } = useTranslation()
  const name = t(site.nameKey)

  return (
    <a className="featured-game group" href={siteHref(site)} onClick={onOpen}>
      <img src={site.bg} alt={name} />
      <span className="featured-shade" aria-hidden="true" />
      <span className="featured-route" aria-hidden="true">
        <IconCompass className="size-7" stroke={1.35} />
      </span>
      <span className="featured-content">
        <span className="featured-label">{t('hero.recommendation')}</span>
        <strong>{name}</strong>
        <span className="featured-copy">{t(site.featureKey)}</span>
        <span className="featured-link">
          <i><IconArrowUpRight className="size-4" stroke={2} /></i>
          {t('action.openGame', { game: name })}
        </span>
      </span>
    </a>
  )
}

function GameCard({ site, favorite, onFavorite, onOpen }: {
  site: SiteCard
  favorite: boolean
  onFavorite: () => void
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const name = t(site.nameKey)
  const href = siteHref(site)
  const favoriteGame = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    onFavorite()
  }

  const body = (
    <>
      <span className="game-cover">
        <img src={site.bg} alt={name} />
        <span className="game-cover-shade" aria-hidden="true" />
        {href && (
          <span className="game-open-icon"><IconArrowUpRight className="size-5" stroke={1.8} /></span>
        )}
      </span>
      <span className="game-card-copy">
        <strong>{name}</strong>
        {site.comingSoon && <span className="soon-badge">{t('comingSoon.badge')}</span>}
        <small>{t(site.descKey)}</small>
      </span>
    </>
  )

  return (
    <article className={site.comingSoon ? 'game-card is-soon' : 'game-card'}>
      {href ? (
        <a href={href} className="game-card-link group" onClick={onOpen}>{body}</a>
      ) : (
        <span className="game-card-link is-inert">{body}</span>
      )}
      <button
        type="button"
        className={favorite ? 'bookmark-button is-active' : 'bookmark-button'}
        onClick={favoriteGame}
        aria-pressed={favorite}
        aria-label={t('action.favorite', { game: name })}
      >
        <IconBookmark className="size-5" stroke={1.8} />
      </button>
    </article>
  )
}

function ComingSoonCard({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" className="future-games" onClick={onClick}>
      <span className="future-visual" aria-hidden="true">
        <span><IconMap2 className="size-7" stroke={1.5} /></span>
        <span><IconSailboat className="size-8" stroke={1.5} /></span>
        <span><IconSparkles className="size-7" stroke={1.5} /></span>
      </span>
      <span className="future-copy">
        <small>{t('comingSoon.kicker')}</small>
        <strong>{t('comingSoon.title')}</strong>
        <span>{t('comingSoon.description')}</span>
        <i><IconArrowRight className="size-5" stroke={1.8} /></i>
      </span>
    </button>
  )
}

function HomeFooter({ onComingSoon }: { onComingSoon: () => void }) {
  const { t } = useTranslation()
  const columns = [
    { title: 'footer.browse', links: ['footer.discoverGames', 'footer.guides', 'footer.maps', 'footer.database'] },
    { title: 'footer.about', links: ['footer.aboutArkive', 'footer.standards', 'footer.joinUs', 'footer.contact'] },
    { title: 'footer.service', links: ['footer.terms', 'footer.privacy', 'footer.appeal', 'footer.help'] },
  ]
  const icp = import.meta.env.VITE_ICP_BEIAN ?? t('footer.icp')

  return (
    <footer className="home-footer">
      <div className="home-shell footer-grid">
        <div className="footer-brand">
          <div className="footer-mark"><ArkiveMark /></div>
          <div>
            <strong>{t('brand.name')}</strong>
            <small>ARKIVE.GAMES</small>
          </div>
          <p><span>{t('brand.slogan')}</span><span>{t('brand.blurb')}</span></p>
        </div>
        {columns.map((column) => (
          <div key={column.title} className="footer-column">
            <h3>{t(column.title)}</h3>
            {column.links.map((link) => (
              <button type="button" key={link} onClick={onComingSoon}>{t(link)}</button>
            ))}
          </div>
        ))}
      </div>
      <div className="home-shell footer-bottom">
        <span>{t('footer.copyright')}</span>
        {!IS_TOY && (
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">{icp}</a>
        )}
      </div>
    </footer>
  )
}
