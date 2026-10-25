import { useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { IconArrowUpRight, IconCheck, IconCopy } from '@tabler/icons-react'
import { ArkiveMark, settingsStringsFor } from '@gamemap/map-shell'
import { ARKIVE_FEEDBACK_QQ_GROUP, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@gamemap/ui'
import { FEATURES } from './featureCatalog'
import { IS_TOY, VISIBLE_SITES, siteHref } from './sites'

// Identity and contact details are the same in every language, so they are
// spelled out once here rather than repeated in each locale's copy.
const ARKIVE_DOMAIN = 'www.Arkive.games'
const SLOGANS = ['万千攻略，藏于一舟', 'Sail Games With Us.'] as const
const CREATORS = [
  { name: '双酿', handle: 'liuyh615' },
  { name: '苏烟', handle: 'Suyn77' },
] as const
const GITHUB_URL = 'https://github.com/arkive-games/arkive/tree/master/tools'
const SUYN_URL = 'https://space.bilibili.com/33004908/upload/video'

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
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
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
          <a className="home-footer-brand" href="#top">Arkive</a>
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

function AboutDialog({ open, brandName, onOpenChange }: {
  open: boolean
  brandName: string
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  // Counted, not written into the copy, so the paragraph stays true as games
  // and tools are added.
  const games = VISIBLE_SITES.filter((site) => siteHref(site)).length
  const tools = FEATURES.filter((feature) => feature.kind === 'tool'
    && VISIBLE_SITES.some((site) => site.id === feature.gameId && siteHref(site))).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="footer-dialog sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('footerDialogs.about.title')}</DialogTitle>
          <DialogDescription className="footer-dialog-brand">
            <span className="footer-mark"><ArkiveMark /></span>
            <span>
              <strong>{brandName}</strong>
              <small>{SLOGANS.join(' · ')}</small>
              <span className="footer-dialog-domain">{ARKIVE_DOMAIN}</span>
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="footer-dialog-body">
          <p>
            <Trans
              i18nKey="footerDialogs.about.team"
              components={{ suyn: <a href={SUYN_URL} target="_blank" rel="noreferrer" /> }}
            />
          </p>
          <p>{t('footerDialogs.about.history', { games, tools })}</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ContactDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const rows = [
    { key: 'qq', label: t('footerDialogs.contact.feedbackGroup'), value: ARKIVE_FEEDBACK_QQ_GROUP },
    ...CREATORS.map((creator) => ({
      key: creator.handle,
      label: t('footerDialogs.contact.creator', { name: creator.name }),
      value: creator.handle,
    })),
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="footer-dialog sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('footerDialogs.contact.title')}</DialogTitle>
          <DialogDescription>{t('footerDialogs.contact.description')}</DialogDescription>
        </DialogHeader>
        <ul className="footer-contact-list">
          {rows.map((row) => (
            <li key={row.key}>
              <span>
                <small>{row.label}</small>
                <strong>{row.value}</strong>
              </span>
              <CopyButton value={row.value} label={row.label} />
            </li>
          ))}
          <li>
            <span>
              <small>{t('footerDialogs.contact.github')}</small>
              <strong>{GITHUB_URL.replace(/^https:\/\//, '')}</strong>
            </span>
            <a className="footer-contact-action" href={GITHUB_URL} target="_blank" rel="noreferrer">
              {t('footerDialogs.contact.open')}
              <IconArrowUpRight className="size-4" stroke={1.8} aria-hidden="true" />
            </a>
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timeout)
  }, [copied])

  const copy = () => {
    void navigator.clipboard?.writeText(value).then(() => setCopied(true))
  }

  return (
    <button
      type="button"
      className="footer-contact-action"
      aria-label={t('footerDialogs.contact.copy', { label })}
      onClick={copy}
    >
      {copied
        ? <IconCheck className="size-4" stroke={2} aria-hidden="true" />
        : <IconCopy className="size-4" stroke={1.8} aria-hidden="true" />}
      <span aria-live="polite">{t(copied ? 'footerDialogs.contact.copied' : 'footerDialogs.contact.copyAction')}</span>
    </button>
  )
}
