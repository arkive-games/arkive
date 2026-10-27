import { useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  IconAnchor,
  IconArrowUpRight,
  IconBrandGithub,
  IconBrandWechat,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconMessageCircle,
} from '@tabler/icons-react'
import { getUserByUid, result } from '@gamemap/api-core'
import { useAuth } from '@gamemap/auth'
import { settingsStringsFor } from '@gamemap/map-shell'
import { ARKIVE_FEEDBACK_QQ_GROUP, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@gamemap/ui'
import { FEATURES } from './featureCatalog'
import { IS_TOY, VISIBLE_SITES, siteHref } from './sites'

// Identity and contact details are the same in every language, so they are
// spelled out once here rather than repeated in each locale's copy.
const ARKIVE_DOMAIN = 'www.Arkive.games'
/** Chinese for a Chinese page, English for every other language. */
const SLOGANS = ['万千攻略，藏于一舟', 'Sail Games With Us.'] as const
const GITHUB_URL = 'https://github.com/arkive-games/arkive/tree/master/tools'
const SUYN_URL = 'https://space.bilibili.com/33004908/upload/video'

interface Creator {
  name: string
  /** WeChat ID. */
  handle: string
  /** Shown until the avatar loads, and in its place when there is no account to read it from. */
  initial: string
  /** Site account whose public avatar is shown. */
  uid?: number
  href?: string
}

const CREATORS: readonly Creator[] = [
  { name: '双酿', handle: 'liuyh615', initial: '双' },
  { name: '苏烟', handle: 'Suyn77', initial: '苏', uid: 10001, href: SUYN_URL },
]

type FooterDialog = 'about' | 'contact' | null

interface HomeFooterProps {
  brandName: string
  /**
   * Opens the shared settings panel.
   *
   * Theme, language and clear-data live there rather than inline here: the panel
   * is the one surface every game also has, and two homes for the same control
   * is how they drift apart.
   */
  onOpenSettings: () => void
}

// The voyage line: a thin route along the foot of the window, filled with gold
// as the page scrolls, that rises into the sea's shoreline once the footer
// comes into view. Heights are SVG units, one per CSS pixel.
const ROUTE_H = 24
const ROUTE_Y = 16
const EDGE_Y = 58
const STEP = 6

const ripple = (x: number, ph: number) => 1.8 * Math.sin((x / 40) * 2 * Math.PI + ph * 2)
const swell = (x: number, ph: number, W: number) =>
  17 * Math.sin((x / (W * 0.9)) * 2 * Math.PI + ph * 0.35 + 0.6)
  + 5 * Math.sin((x / (W * 0.37)) * 2 * Math.PI - ph * 0.45)
/** A flat ripple while the line is the route, the shore's swell once it has risen into it. */
const lineY = (x: number, ph: number, W: number, t: number) => (1 - t) * ripple(x, ph) + t * swell(x, ph, W)
const smoothstep = (t: number) => t * t * (3 - 2 * t)

function linePath(W: number, base: number, ph: number, t: number) {
  let d = ''
  for (let x = 0; x <= W + STEP; x += STEP) d += `${x ? ' L' : 'M'}${x} ${(base + lineY(x, ph, W, t)).toFixed(2)}`
  return d
}

function Sail() {
  return (
    <svg viewBox="0 0 24 26" fill="currentColor" aria-hidden="true">
      <path d="M11 2 L11 18 L3 18 Z" />
      <path d="M13 5 L13 18 L20 18 Z" />
      <path d="M2 20 H22 L19 24 H5 Z" />
    </svg>
  )
}

export function HomeFooter({ brandName, onOpenSettings }: HomeFooterProps) {
  const { t, i18n } = useTranslation()
  const [dialog, setDialog] = useState<FooterDialog>(null)
  const icp = import.meta.env.VITE_ICP_BEIAN ?? t('footer.icp')
  const edgeRef = useRef<SVGSVGElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const edge = edgeRef.current
    const layer = layerRef.current
    if (!edge || !layer) return
    const pick = <T extends Element>(root: Element, selector: string) => root.querySelector<T>(selector)!
    const edgeFill = pick<SVGPathElement>(edge, '.home-footer-fill')
    const edgeTrack = pick<SVGPathElement>(edge, '.home-footer-track')
    const edgeDone = pick<SVGPathElement>(edge, '.home-footer-done')
    const route = pick<SVGSVGElement>(layer, '.home-route')
    const routeTrack = pick<SVGPathElement>(route, '.home-footer-track')
    const routeDone = pick<SVGPathElement>(route, '.home-footer-done')
    const ship = pick<HTMLElement>(layer, '.home-boat.is-sailing')
    const moored = pick<HTMLElement>(layer, '.home-boat.is-moored')
    const port = pick<HTMLElement>(layer, '.home-port')
    const still = window.matchMedia('(prefers-reduced-motion: reduce)')

    let frame = 0
    const draw = (ms: number) => {
      const ph = still.matches ? 0 : ms / 1000
      const W = window.innerWidth
      const vh = window.innerHeight
      const edgeH = edge.clientHeight || 90
      const max = document.documentElement.scrollHeight - vh
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 1
      const clip = `inset(0 ${(100 - p * 100).toFixed(2)}% 0 0)`
      const edgeTop = edge.getBoundingClientRect().top
      const routeBase = vh - ROUTE_H + ROUTE_Y
      const rise = routeBase - (edgeTop + EDGE_Y)
      const attached = rise >= 0
      const t = attached ? smoothstep(Math.min(1, rise / 100)) : 0

      edge.setAttribute('viewBox', `0 0 ${W} ${edgeH}`)
      route.setAttribute('viewBox', `0 0 ${W} ${ROUTE_H}`)
      route.style.opacity = attached ? '0' : '1'
      if (!attached) {
        const d = linePath(W, ROUTE_Y, ph, 0)
        routeTrack.setAttribute('d', d)
        routeDone.setAttribute('d', d)
        routeDone.style.clipPath = clip
      }
      const d = linePath(W, EDGE_Y, ph, t)
      edgeFill.setAttribute('d', `${d} L${W + STEP} ${edgeH} L0 ${edgeH} Z`)
      edgeTrack.setAttribute('d', d)
      edgeDone.setAttribute('d', d)
      edgeDone.style.clipPath = clip

      const base = attached ? edgeTop + EDGE_Y : routeBase
      const put = (element: HTMLElement, x: number) => {
        element.style.left = `${x}px`
        element.style.top = `${base + lineY(x, ph, W, t)}px`
      }
      put(ship, p * W)
      put(moored, W / 2)
      port.style.left = `${W / 2}px`
      port.style.top = `${base}px`
      layer.classList.toggle('is-arrived', p > 0.985)
    }

    // The sea moves every frame; under reduced motion it is still, so only a
    // scroll, a resize or the page changing height can change the picture.
    const loop = (ms: number) => {
      draw(ms)
      frame = requestAnimationFrame(loop)
    }
    const redraw = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    const resized = new ResizeObserver(redraw)
    const listen = (on: boolean) => {
      const method = on ? 'addEventListener' : 'removeEventListener'
      window[method]('scroll', redraw, { passive: true })
      window[method]('resize', redraw)
      if (on) resized.observe(document.body)
      else resized.disconnect()
    }
    const start = () => {
      cancelAnimationFrame(frame)
      listen(still.matches)
      frame = requestAnimationFrame(still.matches ? draw : loop)
    }
    still.addEventListener('change', start)
    start()
    return () => {
      cancelAnimationFrame(frame)
      still.removeEventListener('change', start)
      listen(false)
    }
  }, [])

  return (
    <footer className="home-footer" data-testid="home-footer">
      <svg ref={edgeRef} className="home-footer-edge" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="home-footer-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--f1)' }} />
            <stop offset="1" style={{ stopColor: 'var(--f2)' }} />
          </linearGradient>
        </defs>
        <path className="home-footer-fill" fill="url(#home-footer-sea)" />
        <path className="home-footer-track" />
        <path className="home-footer-done" />
      </svg>
      <div className="home-footer-sea">
        <div className="home-shell home-footer-row">
          <a className="home-footer-brand arkive-wordmark" href="#top">Arkive</a>
          <nav className="home-footer-links" aria-label={t('footer.about')}>
            <button type="button" aria-haspopup="dialog" onClick={() => setDialog('about')}>{t('footer.aboutArkive')}</button>
            <button type="button" aria-haspopup="dialog" onClick={() => setDialog('contact')}>{t('footer.contact')}</button>
            <a href="#updates">{t('footer.updateHistory')}</a>
            <button type="button" onClick={onOpenSettings}>
              {settingsStringsFor(i18n.resolvedLanguage ?? i18n.language).title}
            </button>
          </nav>
          <p className="home-footer-legal">
            <span>{t('footer.copyright')}</span>
            {!IS_TOY && (
              <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">{icp}</a>
            )}
          </p>
        </div>
      </div>

      <div ref={layerRef} className="home-voyage" aria-hidden="true">
        <svg className="home-route" preserveAspectRatio="none">
          <path className="home-footer-track" />
          <path className="home-footer-done" />
        </svg>
        <span className="home-boat is-sailing"><Sail /></span>
        <span className="home-boat is-moored"><Sail /></span>
        <span className="home-port">— {t('landing.arrived')} —</span>
      </div>

      <AboutDialog open={dialog === 'about'} brandName={brandName} onOpenChange={(open) => setDialog(open ? 'about' : null)} />
      <ContactDialog open={dialog === 'contact'} onOpenChange={(open) => setDialog(open ? 'contact' : null)} />
    </footer>
  )
}

/**
 * A creator's real site avatar, read from their public profile while a dialog
 * shows it. Until it arrives, or when the API is unreachable, the face is the
 * creator's initial instead.
 */
function useCreatorAvatars(active: boolean) {
  const auth = useAuth()
  const client = auth.enabled ? auth.client.requestClient : null
  const [avatars, setAvatars] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!active || !client) return
    let live = true
    for (const { uid } of CREATORS) {
      if (uid === undefined) continue
      void result(getUserByUid({ client, throwOnError: true, path: { uid } }))
        .then((user) => {
          if (live && user.avatarUrl) setAvatars((current) => ({ ...current, [uid]: user.avatarUrl! }))
        })
        .catch(() => {})
    }
    return () => { live = false }
  }, [active, client])

  return (creator: Creator) => (creator.uid === undefined ? undefined : avatars[creator.uid])
}

function CreatorFace({ creator, src }: { creator: Creator; src: string | undefined }) {
  return src ? <img src={src} alt="" /> : <span>{creator.initial}</span>
}

function ShoreWaves() {
  return (
    <>
      <svg className="footer-shore-waves" viewBox="0 0 512 48" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 26c32-10 64-10 96 0s64 10 96 0 64-10 96 0 64 10 96 0 64-10 96 0 32 5 32 5V48H0Z" fill="#2f8fb5" opacity=".55" />
        <path d="M0 32c40-9 72-9 108 0s70 9 104 0 70-9 106 0 72 9 104 0 58-6 90 0V48H0Z" fill="#1f6f99" />
      </svg>
      <svg className="footer-shore-ship" viewBox="0 0 32 28" aria-hidden="true">
        <path d="M15 2v17H6Z" fill="#ffd08a" />
        <path d="M17 6v13h8Z" fill="#ffb398" />
        <path d="M3 20h26l-4 6H7Z" fill="#40251c" />
      </svg>
    </>
  )
}

export function AboutDialog({ open, brandName, onOpenChange }: {
  open: boolean
  brandName: string
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const avatarOf = useCreatorAvatars(open)
  // Counted, not written into the copy, so the route stays true as games and
  // tools are added.
  const games = VISIBLE_SITES.filter((site) => siteHref(site)).length
  const tools = FEATURES.filter((feature) => feature.kind === 'tool'
    && VISIBLE_SITES.some((site) => site.id === feature.gameId && siteHref(site))).length
  const slogan = (i18n.resolvedLanguage ?? i18n.language).startsWith('zh') ? SLOGANS[0] : SLOGANS[1]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="footer-dialog footer-about max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto pb-0"
        closeButtonProps={{ className: '[&>span]:bg-white/55 [&>span]:text-[#40251c]' }}
      >
        <div className="footer-about-hero">
          <span className="footer-about-sun" aria-hidden="true" />
          <span className="arkive-wordmark footer-about-wordmark">{brandName}</span>
          <DialogTitle className="sr-only">{t('footerDialogs.about.title')}</DialogTitle>
          <DialogDescription className="footer-about-slogan arkive-dialog-title">{slogan}</DialogDescription>
        </div>

        <div className="footer-crew-line">
          <span className="footer-faces" aria-hidden="true">
            {CREATORS.map((creator) => <CreatorFace key={creator.handle} creator={creator} src={avatarOf(creator)} />)}
          </span>
          <p>
            <Trans
              i18nKey="footerDialogs.about.team"
              components={{ suyn: <a href={SUYN_URL} target="_blank" rel="noreferrer" /> }}
            />
          </p>
        </div>

        <AboutRoute games={games} tools={tools} />

        <div className="footer-shore">
          <ShoreWaves />
          <div className="footer-about-domain">
            <b>{ARKIVE_DOMAIN}</b>
            <span>{t('footerDialogs.about.arrived')} ⚓</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The voyage so far: open on a desktop, folded on a phone where the dialog is tall already. */
function AboutRoute({ games, tools }: { games: number; tools: number }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 48rem)').matches)

  return (
    <details className="footer-route" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="footer-section-label">
        {t('footerDialogs.about.route')}
        <IconChevronDown className="footer-route-chevron size-3.5" stroke={2.4} aria-hidden="true" />
      </summary>
      <ol className="footer-route-stops">
        <li>
          <small>{t('footerDialogs.about.maidenLabel')}</small>
          {t('footerDialogs.about.maiden')}
        </li>
        <li data-stop="now">
          <small>{t('footerDialogs.about.nowLabel')}</small>
          {t('footerDialogs.about.now', { games, tools })}
        </li>
        <li data-stop="next">
          <small>{t('footerDialogs.about.nextLabel')}</small>
          {t('footerDialogs.about.next')}
        </li>
      </ol>
    </details>
  )
}

export function ContactDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const avatarOf = useCreatorAvatars(open)
  const [copiedGroup, copyGroup] = useCopied()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="footer-dialog footer-contact max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto pb-0">
        <DialogHeader>
          <DialogTitle className="arkive-dialog-title">{t('footerDialogs.contact.title')}</DialogTitle>
          <DialogDescription>{t('footerDialogs.contact.description')}</DialogDescription>
        </DialogHeader>

        <div className="footer-pass">
          <div className="footer-pass-main">
            <div className="footer-pass-kicker">
              <IconMessageCircle className="size-3.5" stroke={2.4} aria-hidden="true" />
              {t('footerDialogs.contact.feedbackGroup')}
            </div>
            <div className="footer-pass-number">{ARKIVE_FEEDBACK_QQ_GROUP}</div>
            <div className="footer-pass-note">{t('footerDialogs.contact.groupNote')}</div>
            <button
              type="button"
              className="footer-pass-copy"
              data-copied={copiedGroup || undefined}
              data-testid="footer-copy-qq"
              onClick={() => copyGroup(ARKIVE_FEEDBACK_QQ_GROUP)}
            >
              {copiedGroup
                ? <IconCheck className="size-4" stroke={2.4} aria-hidden="true" />
                : <IconCopy className="size-4" stroke={2.2} aria-hidden="true" />}
              <span aria-live="polite">{t(copiedGroup ? 'footerDialogs.contact.copiedGroup' : 'footerDialogs.contact.copyGroup')}</span>
            </button>
          </div>
          <div className="footer-pass-stub" aria-hidden="true">
            <IconAnchor stroke={2} />
            <b>{t('footerDialogs.contact.board')}</b>
            <small>ARKIVE</small>
          </div>
        </div>

        <div className="footer-section-label">{t('footerDialogs.contact.crew')}</div>
        <ul className="footer-crew">
          {CREATORS.map((creator) => (
            <li key={creator.handle} className="footer-mate">
              <span className="footer-mate-avatar"><CreatorFace creator={creator} src={avatarOf(creator)} /></span>
              <strong>{creator.name}</strong>
              <span className="footer-mate-role">
                {t('footerDialogs.contact.role')}
                {creator.href && (
                  <>
                    {' · '}
                    <a href={creator.href} target="_blank" rel="noreferrer">{t('footerDialogs.contact.bilibili')}</a>
                  </>
                )}
              </span>
              <WechatButton creator={creator} />
            </li>
          ))}
        </ul>

        <div className="footer-shore">
          <ShoreWaves />
          <a className="footer-repo" href={GITHUB_URL} target="_blank" rel="noreferrer">
            <span className="footer-repo-mark"><IconBrandGithub className="size-5" stroke={1.8} aria-hidden="true" /></span>
            <span className="footer-repo-text">
              <b>{t('footerDialogs.contact.github')}</b>
              <small>{GITHUB_URL.replace(/^https:\/\//, '').replace(/\/tree\/.*$/, '')}</small>
            </span>
            <span className="footer-repo-go">
              {t('footerDialogs.contact.open')}
              <IconArrowUpRight className="size-3.5" stroke={2.4} aria-hidden="true" />
            </span>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function WechatButton({ creator }: { creator: Creator }) {
  const { t } = useTranslation()
  const [copied, copy] = useCopied()

  return (
    <button
      type="button"
      className="footer-wechat"
      data-copied={copied || undefined}
      aria-label={t('footerDialogs.contact.copyWechat', { name: creator.name, id: creator.handle })}
      onClick={() => copy(creator.handle)}
    >
      <IconBrandWechat className="size-4.5" stroke={1.8} aria-hidden="true" />
      <span className="footer-wechat-id">{creator.handle}</span>
      <span className="footer-wechat-hint" aria-live="polite">
        {t(copied ? 'footerDialogs.contact.copied' : 'footerDialogs.contact.copyAction')}
      </span>
    </button>
  )
}

/** Copies a value and reports it as copied for two seconds. */
function useCopied() {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timeout)
  }, [copied])

  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value).then(() => setCopied(true))
  }
  return [copied, copy] as const
}
