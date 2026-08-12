import { useTranslation } from 'react-i18next'
import { ArkiveMark, settingsStringsFor } from '@gamemap/map-shell'
import { IS_TOY } from './sites'

const ARKIVE_ORG_URL = 'https://github.com/arkive-games'
const ARKIVE_REPO_URL = `${ARKIVE_ORG_URL}/arkive`

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
  const icp = import.meta.env.VITE_ICP_BEIAN ?? t('footer.icp')
  const columns = [
    {
      key: 'browse',
      title: t('footer.browse'),
      links: [
        { label: t('footer.allGames'), href: '#games' },
        { label: t('footer.community'), href: '#forum' },
        { label: t('footer.toolsAndMods'), href: `${ARKIVE_REPO_URL}/tree/master/tools`, external: true },
      ],
    },
    {
      key: 'about',
      title: t('footer.about'),
      links: [
        { label: t('footer.aboutArkive'), href: ARKIVE_ORG_URL, external: true },
        { label: t('footer.contact'), href: `${ARKIVE_REPO_URL}/issues`, external: true },
        { label: t('footer.updateHistory'), href: `${ARKIVE_REPO_URL}/commits/master`, external: true },
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
            {column.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
              >
                {link.label}
              </a>
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
    </footer>
  )
}
