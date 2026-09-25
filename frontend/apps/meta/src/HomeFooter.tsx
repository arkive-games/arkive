import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowUpRight, IconCheck, IconCopy } from '@tabler/icons-react'
import { ArkiveMark, settingsStringsFor } from '@gamemap/map-shell'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@gamemap/ui'
import { FEATURES } from './featureCatalog'
import { IS_TOY, VISIBLE_SITES, siteHref } from './sites'

// Identity and contact details are the same in every language, so they are
// spelled out once here rather than repeated in each locale's copy.
const ARKIVE_DOMAIN = 'www.Arkive.games'
const SLOGANS = ['万千攻略，藏于一舟', 'Sail Games With Us.'] as const
const FEEDBACK_QQ_GROUP = '1091411026'
const CREATORS = [
  { name: '双酿', handle: 'liuyh615' },
  { name: '苏烟', handle: 'Suyn77' },
] as const
const GITHUB_URL = 'https://github.com/arkive-games/arkive/tree/master/tools'

const ABOUT_PARAGRAPHS = 3

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

export function HomeFooter({ brandName, onOpenSettings }: HomeFooterProps) {
  const { t, i18n } = useTranslation()
  const [dialog, setDialog] = useState<FooterDialog>(null)
  const icp = import.meta.env.VITE_ICP_BEIAN ?? t('footer.icp')
  const columns = [
    {
      key: 'browse',
      title: t('footer.browse'),
      links: [
        { label: t('footer.allGames'), href: '#games' },
        { label: t('footer.community'), href: '#forum' },
        { label: t('footer.toolLibrary'), href: '#tools' },
      ],
    },
    {
      key: 'about',
      title: t('footer.about'),
      links: [
        { label: t('footer.aboutArkive'), dialog: 'about' as const },
        { label: t('footer.contact'), dialog: 'contact' as const },
        { label: t('footer.updateHistory'), href: '#updates' },
      ],
    },
  ]

  return (
    <footer className="home-footer" data-testid="home-footer">
      <div className="home-shell footer-grid">
        <div className="footer-brand">
          <div className="footer-brand-heading">
            <span className="footer-mark"><ArkiveMark /></span>
            <span className="footer-brand-copy">
              <strong>{brandName}</strong>
              <small>{t('brand.slogan')}</small>
            </span>
          </div>
          <p className="footer-metadata">
            <span>{t('footer.copyright')}</span>
            {!IS_TOY && (
              <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">{icp}</a>
            )}
          </p>
        </div>

        {columns.map((column) => (
          <nav key={column.key} className={`footer-column footer-${column.key}`} aria-label={column.title}>
            <h2>{column.title}</h2>
            {column.links.map((link) => link.dialog ? (
              <button
                key={link.dialog}
                type="button"
                className="footer-settings-action"
                aria-haspopup="dialog"
                onClick={() => setDialog(link.dialog ?? null)}
              >
                {link.label}
              </button>
            ) : (
              <a key={link.href} href={link.href}>{link.label}</a>
            ))}
          </nav>
        ))}

        <nav className="footer-column footer-help" aria-label={t('footer.help')}>
          <h2>{t('footer.help')}</h2>
          <div className="footer-help-actions">
            <button type="button" className="footer-settings-action" onClick={onOpenSettings}>
              {settingsStringsFor(i18n.resolvedLanguage ?? i18n.language).title}
            </button>
          </div>
        </nav>
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
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="footer-dialog-body">
          {Array.from({ length: ABOUT_PARAGRAPHS }, (_, index) => (
            <p key={index}>{t(`footerDialogs.about.paragraphs.${index}`, { games, tools })}</p>
          ))}
          <dl className="footer-dialog-facts">
            <div>
              <dt>{t('footerDialogs.about.domain')}</dt>
              <dd>{ARKIVE_DOMAIN}</dd>
            </div>
            <div>
              <dt>{t('footerDialogs.about.slogan')}</dt>
              <dd>{SLOGANS.map((slogan) => <span key={slogan}>{slogan}</span>)}</dd>
            </div>
          </dl>
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
    { key: 'qq', label: t('footerDialogs.contact.feedbackGroup'), value: FEEDBACK_QQ_GROUP },
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
