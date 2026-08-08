import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountDialog, authStringsFor, useAuth } from '@gamemap/auth'
import {
  ArkiveMapTopBar,
  ArkiveMark,
  useTheme,
  type ArkiveMapTopBarAccount,
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
import { AUTH_CONFIG } from './lib/auth'
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

const NAV_KEYS = ['discoverGames', 'allGames', 'tools', 'forum', 'favorites'] as const
type HomeView = 'discoverGames' | 'allGames'

function viewFromHash(): HomeView {
  return window.location.hash === '#games' ? 'allGames' : 'discoverGames'
}

export default function App() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [clickCounts, setClickCounts] = useState<SiteClickCounts>({})
  const [noticeId, setNoticeId] = useState(0)
  const [activeView, setActiveView] = useState<HomeView>(viewFromHash)
  const lng = i18n.resolvedLanguage ?? 'zh-CN'

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
      setActiveView(viewFromHash())
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
  // Hidden entirely when no API is configured, rather than offering a sign-in
  // that cannot complete.
  const account: ArkiveMapTopBarAccount | undefined = AUTH_CONFIG.enabled
    ? {
        status: auth.status,
        userName: auth.user?.name,
        signInLabel: authStrings.signIn,
        signOutLabel: authStrings.signOut,
        accountLabel: authStrings.account,
        onSignIn: () => setAccountOpen(true),
        onSignOut: () => {
          void auth.logout()
        },
      }
    : undefined
  const navItems: ShellNavItem[] = NAV_KEYS.map((key) => ({
    key,
    label: t(`nav.${key}`),
    active: key === activeView,
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
    <div id="top" className="min-h-dvh overflow-x-hidden text-foreground">
      <ArkiveMapTopBar
        homeUrl="#top"
        homeLabel={t('brand.name')}
        brandName={t('brand.name')}
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
              <a href={gameHref} className={className}>{label}</a>
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
        onLogin={showComingSoon}
        account={account}
      />

      {AUTH_CONFIG.enabled && (
        <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} strings={authStrings} />
      )}

      {activeView === 'allGames' ? (
        <AllGamesPage sites={VISIBLE_SITES} onFavorite={showComingSoon} />
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
          </div>

          {featuredSite ? (
            <FeaturedGame site={featuredSite} />
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
              <GameCard key={site.id} site={site} onFavorite={showComingSoon} />
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
    </div>
  )
}

function FeaturedGame({ site }: { site: SiteCard }) {
  const { t } = useTranslation()
  const name = t(site.nameKey)

  return (
    <a className="featured-game group" href={siteHref(site)}>
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

function GameCard({ site, onFavorite }: { site: SiteCard; onFavorite: () => void }) {
  const { t } = useTranslation()
  const name = t(site.nameKey)
  const href = siteHref(site)
  const favorite = (event: MouseEvent<HTMLButtonElement>) => {
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
        <a href={href} className="game-card-link group">{body}</a>
      ) : (
        <span className="game-card-link is-inert">{body}</span>
      )}
      <button type="button" className="bookmark-button" onClick={favorite} aria-label={t('action.favorite', { game: name })}>
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
