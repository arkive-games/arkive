import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { GAME_LOGOS, siteHref, type SiteCard } from './sites'

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

/** The slot (-3 … 3) a slide takes relative to the current one, wrapping round the loop. */
function slotOf(index: number, current: number, length: number) {
  let d = ((index - current) % length + length) % length
  if (d > length / 2) d -= length
  return Math.max(-3, Math.min(3, d))
}

/**
 * A coverflow of the open games' banners: the middle one flat and linked, its
 * neighbours turned away either side. A tap on a neighbour brings it to the
 * middle rather than opening it. Advances every five seconds unless hovered,
 * focused, hidden, or the visitor prefers reduced motion.
 */
export function HomeCarousel({ sites, onOpenSite }: {
  sites: readonly SiteCard[]
  onOpenSite: (site: SiteCard) => void
}) {
  const { t } = useTranslation()
  const slides = sites.filter((site) => site.banner && siteHref(site))
  // `from` is the slide shown before the last move, to tell which slides wrapped.
  const [{ current, from }, setPosition] = useState({ current: 0, from: 0 })
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [size, setSize] = useState(carouselSize)
  // Bumped on every move so the active dot's progress fill restarts.
  const [cycle, setCycle] = useState(0)
  const swipe = useRef<{ x: number; moved: boolean } | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setReduced(media.matches)
    const updateVisibility = () => setHidden(document.hidden)
    const updateSize = () => setSize(carouselSize())
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
  const paused = hovered || focused || hidden || reduced
  useEffect(() => {
    if (length < 2 || paused) return
    const timer = window.setTimeout(() => {
      setPosition(({ current: value }) => ({ current: (value + 1) % length, from: value }))
      setCycle((value) => value + 1)
    }, AUTO_MS)
    return () => window.clearTimeout(timer)
  }, [current, cycle, length, paused])

  if (!length) return null
  const active = current % length
  const to = (index: number) => {
    setPosition({ current: index, from: active })
    setCycle((value) => value + 1)
  }
  const go = (step: number) => to((active + step + length) % length)

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
  }

  return (
    <section
      className={`home-hero${paused ? ' is-paused' : ''}`}
      style={{ ...size, '--glow': slides[active].color ?? 'var(--primary)' } as CSSProperties}
      aria-roledescription="carousel"
      aria-label={t('landing.carousel.label')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
      onKeyDown={onKeyDown}
    >
      <div
        className="home-hero-stage"
        onPointerDown={(event) => { swipe.current = { x: event.clientX, moved: false } }}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { swipe.current = null }}
      >
        {slides.map((site, index) => {
          const d = slotOf(index, active, length)
          // A slide jumping more than one slot is wrapping round the loop: it
          // fades in at its new place instead of flying across the stage.
          const wrapped = Math.abs(d - slotOf(index, from % length, length)) > 1
          const name = t(site.nameKey)
          const href = siteHref(site)
          const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
            const moved = swipe.current?.moved
            swipe.current = null
            if (moved || d !== 0) {
              event.preventDefault()
              if (!moved && d !== 0) go(Math.sign(d))
              return
            }
            onOpenSite(site)
          }
          return (
            <a
              key={site.id}
              className={`home-slide${wrapped ? ' is-wrapping' : ''}`}
              data-d={d}
              href={href}
              draggable={false}
              aria-label={name}
              // Only the middle slide opens its game; a tap on a neighbour just
              // rotates, so assistive tech is pointed at the dots instead.
              aria-hidden={d !== 0 ? true : undefined}
              tabIndex={d === 0 ? undefined : -1}
              onClick={onClick}
            >
              <img src={site.banner} alt="" draggable={false} style={{ objectPosition: site.bannerPosition }} />
              <span className="home-slide-caption">
                <img className="home-slide-icon" src={site.icon ?? GAME_LOGOS[site.id]} alt="" />
                <span className="home-slide-text">
                  <b>{name}</b>
                  <em>{t(site.descKey)}</em>
                </span>
                <span className="home-slide-go" aria-hidden="true">{t('landing.carousel.enter')} →</span>
              </span>
            </a>
          )
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
            {slides.map((site, index) => (
              <button
                key={site.id}
                type="button"
                aria-label={t('landing.carousel.slide', { n: index + 1, name: t(site.nameKey) })}
                aria-current={index === active ? 'true' : undefined}
                onClick={() => to(index)}
              >
                {/* The fill is keyed by `cycle`, not the button: remounting the
                    button would drop the keyboard focus resting on it. */}
                <span>{index === active && <i key={cycle} />}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
