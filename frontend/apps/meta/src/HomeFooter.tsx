import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArkiveMark,
  LocalDataDialog,
  ShellUtilityDropdown,
  localDataStringsFor,
  type ArkiveMapTheme,
} from '@gamemap/map-shell'
import { IS_TOY } from './sites'
import { LANGUAGES, LANGUAGE_LABELS } from './i18n'

const ARKIVE_ORG_URL = 'https://github.com/arkive-games'
const ARKIVE_REPO_URL = `${ARKIVE_ORG_URL}/arkive`

interface HomeFooterProps {
  brandName: string
  language: string
  theme: ArkiveMapTheme
  onLanguageChange: (code: string) => void
  onThemeChange: (theme: ArkiveMapTheme) => void
}

export function HomeFooter({
  brandName,
  language,
  theme,
  onLanguageChange,
  onThemeChange,
}: HomeFooterProps) {
  const { t, i18n } = useTranslation()
  const [openMenu, setOpenMenu] = useState<'language' | 'theme' | null>(null)
  const icp = import.meta.env.VITE_ICP_BEIAN ?? t('footer.icp')
  const actionClassName = 'h-auto min-h-6 justify-start px-0 py-2 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-primary'
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
            <ShellUtilityDropdown
              id="language"
              open={openMenu === 'language'}
              onOpenChange={(open) => setOpenMenu(open ? 'language' : null)}
              options={LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_LABELS[code] }))}
              current={language}
              onChange={onLanguageChange}
              menuLabel={t('language')}
              shortLabel={t('footer.language')}
              menuAlign="start"
              menuSide="top"
              triggerClassName={actionClassName}
            />
            <ShellUtilityDropdown
              id="theme"
              open={openMenu === 'theme'}
              onOpenChange={(open) => setOpenMenu(open ? 'theme' : null)}
              options={[
                { value: 'auto', label: t('theme.auto') },
                { value: 'light', label: t('theme.light') },
                { value: 'dark', label: t('theme.dark') },
              ]}
              current={theme}
              onChange={(value) => onThemeChange(value as ArkiveMapTheme)}
              menuLabel={t('theme.menu')}
              shortLabel={t('footer.theme')}
              menuAlign="start"
              menuSide="top"
              triggerClassName={actionClassName}
            />
            <LocalDataDialog
              strings={localDataStringsFor(i18n.resolvedLanguage ?? i18n.language)}
              triggerLabel={t('footer.clearCache')}
            />
          </div>
        </nav>
      </div>
    </footer>
  )
}
