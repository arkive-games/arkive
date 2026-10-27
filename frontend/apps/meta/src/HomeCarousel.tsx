import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronLeft, IconChevronRight, IconPlayerPauseFilled, IconPlayerPlayFilled } from '@tabler/icons-react'
import { ContactDialog } from './HomeFooter'
import { GAME_LOGOS, siteHref, type GameId, type SiteCard } from './sites'
import recruitBanner from './assets/recruit-banner.webp'
import recruitBannerPhone from './assets/recruit-banner-phone.webp'
import pbzBanner from './assets/pbz-banner.webp'
import pbzBannerPhone from './assets/pbz-banner-phone.webp'
import pbzIcon from './assets/pbz-icon.webp'
import gmzzPoster from './assets/gmzz-poster.webp'
import gmzzPosterPhone from './assets/gmzz-poster-phone.webp'
import palworldPoster from './assets/palworld-poster.webp'
import palworldPosterPhone from './assets/palworld-poster-phone.webp'

/** The games given a slide, in order; the carousel holds five slides in all. */
const CAROUSEL_GAMES: readonly GameId[] = ['aion2', 'palworld', 'gmzz']

/**
 * Titled carousel art that replaces a game's `banner` here only: the all-games
 * page still crops the plain key art, which these would not survive.
 */
const GAME_POSTERS: Partial<Record<GameId, { banner: string; phoneBanner: string }>> = {
  palworld: { banner: palworldPoster, phoneBanner: palworldPosterPhone },
  gmzz: { banner: gmzzPoster, phoneBanner: gmzzPosterPhone },
}

const AUTO_MS = 5000
const SWIPE_PX = 40
/** Matches the phone breakpoint in home-landing.css. */
const PHONE_MAX = 760

/**
 * Sizes for the current window. Desktop keeps a 3:1 banner that shrinks on
 * short screens so the shortcut row stays on the first screen; the middle
 * banner is 73.4% of the stage and each neighbour 67.7% of the middle one.
 * A phone shows a 2:1 banner with ~44px of each neighbour peeking out.
 */
function carouselSize(): CSSProperties {
  const W = window.innerWidth
  const H = window.innerHeight
  const phone = W <= PHONE_MAX
  const w = phone ? W - 88 : Math.max(560, Math.min(920, Math.round(W * 0.53), Math.round((H - 400) * 3)))
  const h = Math.round(w / (phone ? 2 : 3))
  const cw = phone ? W : Math.min(W - 32, Math.round(w / 0.734))
  return {
    '--w': `${w}px`,
    '--h': `${h}px`,
    '--cw': `${cw}px`,
    '--sw': `${Math.round(w * 0.6766)}px`,
    '--auto': `${AUTO_MS}ms`,
  } as CSSProperties
}

/**
 * One slide: a game's banner, or one of the site's own posters (recruitment,
 * an upcoming game), which have separate desktop and phone art and open a
 * dialog instead of linking.
 */
interface Slide {
  key: string
  name: string
  desc: string
  go: string
  banner: string
  phoneBanner?: string
  bannerPosition?: string
  /** The art carries its own title, so only the action pill is drawn over it. */
  poster?: boolean
  icon: string
  color?: string
  href?: string
  open: () => void
}

/** The slot (-3 … 3) a slide takes relative to the current one, wrapping round the loop. */
function slotOf(index: number, current: number, length: number) {
  let d = ((index - current) % length + length) % length
  if (d > length / 2) d -= length
  return Math.max(-3, Math.min(3, d))
}

/**
 * A coverflow of five posters -- recruitment, Phantom Blade Zero, then the
 * games in `CAROUSEL_GAMES` -- the middle one flat and linked, its neighbours
 * turned away either side. A tap on a neighbour brings it to the middle rather
 * than opening it. Advances every five seconds unless stopped
 * with the pause button, hovered, focused, hidden, or the visitor prefers
 * reduced motion.
 */
export function HomeCarousel({ sites, onOpenSite, onComingSoon }: {
  sites: readonly SiteCard[]
  onOpenSite: (site: SiteCard) => void
  /** Opens the notice for Phantom Blade Zero, whose guide is not open yet. */
  onComingSoon: () => void
}) {
  const { t } = useTranslation()
  const [contactOpen, setContactOpen] = useState(false)
  const slides: Slide[] = [
    {
      key: 'recruit',
      name: t('landing.carousel.recruit.name'),
      desc: t('landing.carousel.recruit.desc'),
      go: t('landing.carousel.recruit.go'),
      banner: recruitBanner,
      phoneBanner: recruitBannerPhone,
      poster: true,
      icon: `${import.meta.env.BASE_URL}favicon.svg`,
      color: '#3fb0e6',
      open: () => setContactOpen(true),
    },
    {
      key: 'pbz',
      name: t('landing.carousel.pbz.name'),
      desc: '',
      go: t('landing.carousel.pbz.go'),
      banner: pbzBanner,
      phoneBanner: pbzBannerPhone,
      poster: true,
      icon: pbzIcon,
      color: '#c98a3e',
      open: onComingSoon,
    },
    ...CAROUSEL_GAMES.flatMap((id) => {
      const site = sites.find((candidate) => candidate.id === id)
      const href = site && siteHref(site)
      if (!site?.banner || !href) return []
      const poster = GAME_POSTERS[id]
      return [{
        key: site.id,
        name: t(site.nameKey),
        desc: t(site.descKey),
        go: t('landing.carousel.enter'),
        banner: poster?.banner ?? site.banner,
        phoneBanner: poster?.phoneBanner,
        bannerPosition: poster ? undefined : site.bannerPosition,
        poster: Boolean(poster),
        icon: site.icon ?? GAME_LOGOS[site.id],
        color: site.color,
        href,
        open: () => onOpenSite(site),
      }]
    }),
  ]
  // `from` is the slide shown before the last move, to tell which slides wrapped.
  const [{ current, from }, setPosition] = useState({ current: 0, from: 0 })
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [reduced, setReduced] = useState(false)
  // Set by the pause button, and kept until the visitor presses play again.
  const [stopped, setStopped] = useState(false)
  const [size, setSize] = useState(carouselSize)
  const [phone, setPhone] = useState(() => window.innerWidth <= PHONE_MAX)
  // Bumped on every move so the active dot's progress fill restarts.
  const [cycle, setCycle] = useState(0)
  const swipe = useRef<{ x: number; moved: boolean } | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  // Set when an arrow key moves the carousel from a focused slide, so the
  // focus follows to the new middle slide instead of staying on one that
  // has just left the accessibility tree.
  const followFocus = useRef(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setReduced(media.matches)
    const updateVisibility = () => setHidden(document.hidden)
    const updateSize = () => {
      setSize(carouselSize())
      setPhone(window.innerWidth <= PHONE_MAX)
    }
    updateMotion()
    updateVisibility()
    media.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', updateVisibility)
    window.addEventListener('resize', updateSize)
    return () => {
      media.removeEventListener('change', updateMotion)
      document.removeEventListener('visibilitychange', updateVisibility)
      window.removeEventListener('resize', updateSize)
    }
  }, [])

  const length = slides.length
  const paused = stopped || hovered || focused || hidden || reduced
  useEffect(() => {
    if (length < 2 || paused) return
    const timer = window.setTimeout(() => {
      setPosition(({ current: value }) => ({ current: (value + 1) % length, from: value }))
      setCycle((value) => value + 1)
    }, AUTO_MS)
    return () => window.clearTimeout(timer)
  }, [current, cycle, length, paused])

  useEffect(() => {
    if (!followFocus.current) return
    followFocus.current = false
    stage.current?.querySelector<HTMLElement>('.home-slide[data-d="0"]')?.focus({ preventScroll: true })
  }, [current])

  if (!length) return null
  const active = current % length
  const to = (index: number) => {
    setPosition({ current: index, from: active })
    setCycle((value) => value + 1)
  }
  const go = (step: number) => to((active + step + length) % length)
  // Play overrides the hover and focus pauses the press itself set off, so
  // the carousel moves at once rather than when the pointer or focus leaves.
  const togglePlay = () => {
    if (stopped) {
      setHovered(false)
      setFocused(false)
    }
    setStopped(!stopped)
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current
    if (!start) return
    const dx = event.clientX - start.x
    if (Math.abs(dx) > SWIPE_PX) {
      start.moved = true
      go(dx < 0 ? 1 : -1)
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') go(-1)
    else if (event.key === 'ArrowRight') go(1)
    else return
    event.preventDefault()
    followFocus.current = (event.target as HTMLElement).classList.contains('home-slide')
  }

  return (
    <>
      <section
        className={`home-hero${paused ? ' is-paused' : ''}`}
        style={{ ...size, '--glow': slides[active].color ?? 'var(--primary)' } as CSSProperties}
        aria-roledescription="carousel"
        aria-label={t('landing.carousel.label')}
        // Only a real mouse hovers: a tap fires a synthetic mouseenter with no
        // mouseleave to follow, which would pause a phone's carousel for good.
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true) }}
        onPointerLeave={(event) => { if (event.pointerType === 'mouse') setHovered(false) }}
        // Likewise only keyboard focus pauses; a tap focuses what it touches too.
        onFocusCapture={(event) => setFocused((event.target as HTMLElement).matches(':focus-visible'))}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
        }}
        onKeyDown={onKeyDown}
      >
        <div
          ref={stage}
          className="home-hero-stage"
          onPointerDown={(event) => { swipe.current = { x: event.clientX, moved: false } }}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { swipe.current = null }}
        >
          {slides.map((slide, index) => {
            const d = slotOf(index, active, length)
            // A slide jumping more than one slot is wrapping round the loop: it
            // fades in at its new place instead of flying across the stage.
            const wrapped = Math.abs(d - slotOf(index, from % length, length)) > 1
            const onClick = (event: MouseEvent<HTMLElement>) => {
              const moved = swipe.current?.moved
              swipe.current = null
              if (moved || d !== 0) {
                event.preventDefault()
                if (!moved && d !== 0) {
                  // The tap focused this slide, which is about to be hidden.
                  followFocus.current = true
                  go(Math.sign(d))
                }
                return
              }
              slide.open()
            }
            const props = {
              className: `home-slide${wrapped ? ' is-wrapping' : ''}${slide.poster ? ' is-poster' : ''}`,
              'data-d': d,
              draggable: false,
              'aria-label': slide.name,
              // Only the middle slide opens; a tap on a neighbour just rotates,
              // so assistive tech is pointed at the dots instead.
              'aria-hidden': d !== 0 ? true : undefined,
              tabIndex: d === 0 ? undefined : -1,
              onClick,
            }
            const content = (
              <>
                <img
                  src={phone && slide.phoneBanner ? slide.phoneBanner : slide.banner}
                  alt=""
                  draggable={false}
                  style={{ objectPosition: slide.bannerPosition }}
                />
                <span className="home-slide-caption">
                  <img className="home-slide-icon" src={slide.icon} alt="" />
                  <span className="home-slide-text">
                    <b>{slide.name}</b>
                    <em>{slide.desc}</em>
                  </span>
                  <span className="home-slide-go" aria-hidden="true">{slide.go} →</span>
                </span>
              </>
            )
            // A slide with nowhere to link to opens a dialog, so it is a button.
            return slide.href
              ? <a key={slide.key} href={slide.href} {...props}>{content}</a>
              : <button key={slide.key} type="button" aria-haspopup="dialog" {...props}>{content}</button>
          })}
        </div>
        {length > 1 && (
          <>
            <button type="button" className="home-hero-arrow is-prev" aria-label={t('landing.carousel.previous')} onClick={() => go(-1)}>
              <IconChevronLeft stroke={2.2} aria-hidden="true" />
            </button>
            <button type="button" className="home-hero-arrow is-next" aria-label={t('landing.carousel.next')} onClick={() => go(1)}>
              <IconChevronRight stroke={2.2} aria-hidden="true" />
            </button>
            <div className="home-hero-dots">
              {slides.map((slide, index) => (
                <button
                  key={slide.key}
                  type="button"
                  aria-label={t('landing.carousel.slide', { n: index + 1, name: slide.name })}
                  aria-current={index === active ? 'true' : undefined}
                  onClick={() => to(index)}
                >
                  {/* The fill is keyed by `cycle`, not the button: remounting the
                      button would drop the keyboard focus resting on it. */}
                  <span>{index === active && <i key={cycle} />}</span>
                </button>
              ))}
              {/* Reduced motion never advances, so there is nothing to pause. */}
              {!reduced && (
                <button
                  type="button"
                  className="home-hero-toggle"
                  aria-label={t(stopped ? 'landing.carousel.play' : 'landing.carousel.pause')}
                  title={t(stopped ? 'landing.carousel.play' : 'landing.carousel.pause')}
                  onClick={togglePlay}
                >
                  {stopped
                    ? <IconPlayerPlayFilled aria-hidden="true" />
                    : <IconPlayerPauseFilled aria-hidden="true" />}
                </button>
              )}
            </div>
          </>
        )}
      </section>
      {/* Outside the section: React events bubble out of the dialog's portal,
          and the section's arrow keys would turn the carousel behind it. */}
      <ContactDialog open={contactOpen} onOpenChange={setContactOpen} />
    </>
  )
}
