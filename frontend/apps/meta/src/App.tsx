import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AccountDialog,
  ArkiveAccountControl,
  authStringsFor,
  createLocalTokenStorage,
  useAuth,
} from '@gamemap/auth'
import { createApiClient, listForumPosts, result, type PostRead } from '@gamemap/api-core'
import {
  ArkiveMapTopBar,
  ArkiveMobileHeader,
  getArkiveBrandName,
  ArkiveSettingsDialog,
  useArkiveSettingsProps,
  useTheme,
  type ShellNavItem,
} from '@gamemap/map-shell'
import { SiteFooter } from '@gamemap/ui'
import {
  IconArrowRight,
  IconArrowUpRight,
  IconCompass,
  IconHammer,
  IconMessageCircle,
  IconSearch,
} from '@tabler/icons-react'
import { changeLanguagePreference, LANGUAGES, LANGUAGE_LABELS } from './i18n'
import {
  IS_TOY,
  VISIBLE_SITES,
  curatedFeaturedSite,
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
import { PlatformUpdatesPage } from './PlatformUpdatesPage'
import { useSettingsConfig } from './lib/settings'
import { AUTH_CONFIG } from './lib/auth'
import { HomeFooter } from './HomeFooter'
import { resolveMetaFooterKind } from './footerPolicy'
import { DEFAULT_AVATAR_SRC } from './avatarPresets'
import { avatarUrl } from './userSystemData'
import { useUserSystem } from './UserSystemState'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@gamemap/ui'
import {
  defineMemoryRecord,
  memoryPolicy,
  RECENT_ACTIVITY_RETENTION,
  useMemoryState,
} from '@gamemap/state-memory'

const NAV_KEYS = ['discoverGames', 'allGames', 'tools', 'forum'] as const
type HomeRoute =
  | { view: 'discoverGames' }
  | { view: 'allGames' }
  | { view: 'platformUpdates' }
  | { view: 'forum'; composer: boolean }
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
  timestamp: number
}

interface HomeCommunityPost {
  post: PostRead
  site?: SiteCard
}

const recentDestinationsRecord = defineMemoryRecord({
  id: 'recent-destinations', namespace: 'site', surface: 'portal',
  ...memoryPolicy.recentActivity('clear-recent-activity'),
  schemaVersion: '1.0.0', defaultValue: () => [] as RecentDestination[],
  validate: (value: unknown): value is RecentDestination[] => Array.isArray(value)
    && value.length <= 10
    && value.every((item) => Boolean(item) && typeof item === 'object'
      && typeof (item as RecentDestination).id === 'string'
      && typeof (item as RecentDestination).gameId === 'string'
      && typeof (item as RecentDestination).route === 'string'
      && typeof (item as RecentDestination).timestamp === 'number'),
})

function recentDestination(site: SiteCard, route: string): RecentDestination {
  return {
    id: `game:${site.id}`,
    gameId: site.id,
    route,
    timestamp: Date.now(),
  }
}
function routeFromHash(): HomeRoute {
  const [root, value, detail] = window.location.hash.replace(/^#/, '').split('/')
  if (root === 'games') return { view: 'allGames' }
  if (root === 'updates') return { view: 'platformUpdates' }
  if (root === 'forum') return { view: 'forum', composer: value === 'new' }
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
  const [forumComposerDirty, setForumComposerDirty] = useState(false)
  const [pendingForumHash, setPendingForumHash] = useState<string | null>(null)
  const forumComposerDirtyRef = useRef(false)
  const isForumComposer = activeRoute.view === 'forum' && activeRoute.composer
  const lng = i18n.resolvedLanguage ?? 'zh-CN'
  const settingsProps = useArkiveSettingsProps(useSettingsConfig())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const brandName = getArkiveBrandName(lng, t('brand.name'))

  useEffect(() => {
    const controller = new AbortController()
    void loadSiteClickCounts(controller.signal).then(setClickCounts)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const updateView = () => {
      const requestedHash = window.location.hash || '#top'
      if (forumComposerDirtyRef.current && requestedHash !== '#forum/new') {
        window.history.replaceState(null, '', '#forum/new')
        setPendingForumHash(requestedHash)
        return
      }
      setActiveRoute(routeFromHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', updateView)
    return () => window.removeEventListener('hashchange', updateView)
  }, [])

  useEffect(() => {
    if (!forumComposerDirty) return
    const confirmUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', confirmUnload)
    return () => window.removeEventListener('beforeunload', confirmUnload)
  }, [forumComposerDirty])

  useEffect(() => {
    if (!noticeId) return
    const timeout = window.setTimeout(() => setNoticeId(0), 4200)
    return () => window.clearTimeout(timeout)
  }, [noticeId])

  const rankedSites = useMemo(
    () => rankSitesByClicks(VISIBLE_SITES, clickCounts),
    [clickCounts],
  )
  const showComingSoon = () => setNoticeId((value) => value + 1)
  const auth = useAuth()
  const [accountOpen, setAccountOpen] = useState(false)
  const authStrings = authStringsFor(i18n.language)
  const isSignedIn = auth.status === 'authenticated'
  const footerKind = resolveMetaFooterKind(activeRoute.view, isSignedIn)
  const { state: userSystemState } = useUserSystem()
  const [recentDestinations, setRecentDestinations] = useMemoryState(recentDestinationsRecord)
  const [memoryNow] = useState(Date.now)
  const rememberSite = (site: SiteCard) => {
    const route = siteHref(site)
    if (!route) return
    const destination = recentDestination(site, route)
    setRecentDestinations((current) => [
      destination,
      ...current.filter((item) => item.id !== destination.id),
    ].slice(0, 10))
  }
  const continueDestination = recentDestinations.find((destination) =>
    memoryNow - destination.timestamp < RECENT_ACTIVITY_RETENTION.milliseconds
    && VISIBLE_SITES.some((site) => site.id === destination.gameId && siteHref(site)))
  const continueSite = continueDestination
    ? VISIBLE_SITES.find((site) => site.id === continueDestination.gameId)
    : undefined
  const featuredSite = continueSite ?? curatedFeaturedSite(rankedSites)
  const displayedSites = featuredSite
    ? [featuredSite, ...rankedSites.filter((site) => site.id !== featuredSite.id)]
    : rankedSites
  const [communityPosts, setCommunityPosts] = useState<HomeCommunityPost[]>([])

  useEffect(() => {
    if (!AUTH_CONFIG.enabled || IS_TOY) return

    // The configured transport, not the "cookie" default: a bearer build sends
    // this cross-origin, and asking for credentials there makes the browser
    // refuse the request outright. createApiClient requires a TokenStorage for
    // bearer, and this is the one AuthProvider builds when main.tsx passes
    // none, so both read the same token.
    const api = createApiClient({
      baseUrl: AUTH_CONFIG.baseUrl,
      transport: AUTH_CONFIG.transport,
      storage: AUTH_CONFIG.transport === 'bearer' ? createLocalTokenStorage() : undefined,
    })
    let active = true
    void result(listForumPosts({
      client: api.client,
      throwOnError: true,
      query: { page: 1, pageSize: 3 },
    })).then((page) => {
      if (!active) return
      setCommunityPosts((page.results ?? []).map((post) => ({
        post,
        site: post.gameIds?.length
          ? VISIBLE_SITES.find((site) => site.id === post.gameIds?.[0])
          : undefined,
      })))
    }).catch(() => {
      if (active) setCommunityPosts([])
    })

    return () => { active = false }
  }, [])
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
    active: key === activeRoute.view,
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

  const updateForumComposerDirty = useCallback((dirty: boolean) => {
    forumComposerDirtyRef.current = dirty
    setForumComposerDirty(dirty)
  }, [])

  const discardForumComposer = () => {
    const destination = pendingForumHash ?? '#forum'
    forumComposerDirtyRef.current = false
    setForumComposerDirty(false)
    setPendingForumHash(null)
    window.history.replaceState(null, '', destination)
    setActiveRoute(routeFromHash())
    window.scrollTo({ top: 0 })
  }

  return (
    <div id="top" className={`min-h-dvh overflow-x-hidden text-foreground ${isForumComposer ? 'pb-0' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0'}`}>
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
          onChange: (code) => void changeLanguagePreference(code),
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

      {/* One instance, opened from the footer rather than from the account
          menu. Unlike a game, meta's signed-in cluster is a notification bell
          and an avatar with no dropdown to host a row, so an account-menu entry
          would exist only while signed out -- and the local-data controls this
          holds are needed in both states. */}
      <ArkiveSettingsDialog {...settingsProps} open={settingsOpen} onOpenChange={setSettingsOpen} />

      {activeRoute.view === 'platformUpdates' ? (
        <PlatformUpdatesPage />
      ) : activeRoute.view === 'allGames' ? (
        <AllGamesPage
          sites={VISIBLE_SITES}
          onAuthRequired={() => setAccountOpen(true)}
          onOpenSite={rememberSite}
        />
      ) : activeRoute.view === 'forum' ? (
        <ForumPage
          sites={VISIBLE_SITES}
          composerOpen={activeRoute.composer}
          onComingSoon={showComingSoon}
          onAuthRequired={() => setAccountOpen(true)}
          onComposerDirtyChange={updateForumComposerDirty}
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
        <main className="arkive-home-view">
          <section className="home-shell hero-section" aria-labelledby="home-heading">
          <div className="hero-copy">
            <p className="hero-eyebrow">
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
          </div>

          {featuredSite ? (
            <FeaturedGame
              site={featuredSite}
              continuing={featuredSite.id === continueSite?.id}
              onOpen={() => rememberSite(featuredSite)}
            />
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
              <span>{t('explore.eyebrow')}</span>
              <h2 id="explore-heading">{t('explore.title')}</h2>
            </div>
            <a href="#games" className="text-action">
              {t('action.browseAll')}
              <IconArrowRight className="size-4" stroke={1.8} aria-hidden="true" />
            </a>
          </div>

          <div className="game-shelf">
            {displayedSites.map((site, index) => (
              <GameCard
                key={site.id}
                site={site}
                featured={index === 0}
                onOpen={() => rememberSite(site)}
              />
            ))}
          </div>
          </section>

          {communityPosts.length > 0 && (
            <HomeCommunity posts={communityPosts} />
          )}
        </main>
      )}

      {activeRoute.view !== 'forum' && (footerKind === 'home' ? (
        <HomeFooter
          brandName={brandName}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <SiteFooter
          homeUrl="#top"
          homeLinkProps={{ target: undefined, rel: undefined }}
          githubUrl={IS_TOY ? null : (import.meta.env.VITE_GITHUB_URL ?? 'https://github.com/arkive-games')}
          icpBeian={IS_TOY ? null : (import.meta.env.VITE_ICP_BEIAN ?? t('footer.icp'))}
          data-testid="compact-site-footer"
        />
      ))}

      {noticeId > 0 && (
        <div key={noticeId} className="coming-soon-toast" role="status" aria-live="polite">
          <span className="toast-icon"><IconHammer className="size-5" stroke={1.8} /></span>
          <span>
            <strong>{t('notice.title')}</strong>
            <small>{t('notice.description')}</small>
          </span>
        </div>
      )}

      {!isForumComposer && activeRoute.view !== 'forum' && (
        <MetaMobileNav
          activeView={activeRoute.view}
          noticeId={noticeId}
          isSignedIn={isSignedIn}
          language={lng}
          theme={theme}
          onLanguageChange={(code) => void changeLanguagePreference(code)}
          onThemeChange={setTheme}
          onComingSoon={showComingSoon}
        />
      )}

      <AlertDialog
        open={pendingForumHash !== null}
        onOpenChange={(open) => {
          if (!open) setPendingForumHash(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('forum.composer.discard.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('forum.composer.discard.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('forum.composer.discard.stay')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={discardForumComposer}>
              {t('forum.composer.discard.leave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function FeaturedGame({ site, continuing, onOpen }: {
  site: SiteCard
  continuing: boolean
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const name = t(site.nameKey)

  return (
    <a className="featured-game group" href={siteHref(site)} onClick={onOpen}>
      <img src={site.bg} alt={name} />
      <span className="featured-shade" aria-hidden="true" />
      <span className="featured-label">{t(continuing ? 'hero.continue' : 'hero.recommendation')}</span>
      <span className="featured-content">
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

function GameCard({ site, featured, onOpen }: {
  site: SiteCard
  featured: boolean
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const name = t(site.nameKey)
  const href = siteHref(site)
  const body = (
    <>
      <span className="game-cover">
        <img src={site.bg} alt={name} />
        <span className="game-cover-shade" aria-hidden="true" />
        {href && (
          <span className="game-open-icon"><IconArrowUpRight className="size-5" stroke={1.8} /></span>
        )}
        <span className="game-card-copy">
          {site.comingSoon && <small>{t('comingSoon.badge')}</small>}
          {featured && !site.comingSoon && <small>{t('hero.recommendation')}</small>}
          <strong>{name}</strong>
          <span>{t(site.descKey)}</span>
        </span>
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
    </article>
  )
}

function HomeCommunity({ posts }: { posts: HomeCommunityPost[] }) {
  const { t, i18n } = useTranslation()
  const [renderedAt] = useState(Date.now)
  const relativeTime = new Intl.RelativeTimeFormat(i18n.resolvedLanguage ?? i18n.language, { numeric: 'auto' })
  const formatPostTime = (value: string) => {
    const elapsedMinutes = Math.round((new Date(value).getTime() - renderedAt) / 60_000)
    if (Math.abs(elapsedMinutes) < 60) return relativeTime.format(elapsedMinutes, 'minute')
    const elapsedHours = Math.round(elapsedMinutes / 60)
    if (Math.abs(elapsedHours) < 24) return relativeTime.format(elapsedHours, 'hour')
    return relativeTime.format(Math.round(elapsedHours / 24), 'day')
  }

  return (
    <section className="community-section" aria-labelledby="community-heading">
      <div className="home-shell">
        <div className="section-heading community-heading">
          <div>
            <span>{t('community.eyebrow')}</span>
            <h2 id="community-heading">{t('community.title')}</h2>
          </div>
          <a href="#forum" className="text-action">
            {t('community.action')}
            <IconArrowRight className="size-4" stroke={1.8} aria-hidden="true" />
          </a>
        </div>
        <div className="community-grid">
          {posts.map(({ post, site }) => (
            <a key={post.postNo} href="#forum" className="community-card">
              <span className="community-visual">
                <img src={site?.bg ?? post.author.avatarUrl} alt="" />
              </span>
              <span className="community-copy">
                <small>{site ? t(site.nameKey) : t('community.general')}</small>
                <strong>{post.title}</strong>
                <span>{post.author.name} · {formatPostTime(post.createdAt)}</span>
                {/* Labelled as one node: the icon is decorative and the bare
                    number on its own would be read out without its unit. */}
                <i role="img" aria-label={t('community.comments', { n: post.commentCount })}>
                  <IconMessageCircle className="size-4" stroke={1.8} aria-hidden="true" />
                  {post.commentCount}
                </i>
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
