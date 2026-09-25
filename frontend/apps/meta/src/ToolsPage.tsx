import { IconArrowUpRight, IconTool } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { siteHref, type SiteCard } from './sites'
import './tools-page.css'

export function ToolsPage({ gmzz }: { gmzz: SiteCard }) {
  const { t } = useTranslation()

  return (
    <main className="tools-main">
      <header className="home-shell tools-header">
        <p className="tools-eyebrow">
          <IconTool className="size-4" stroke={1.8} aria-hidden="true" />
          {t('toolsLibrary.eyebrow')}
        </p>
        <h1>{t('toolsLibrary.title')}</h1>
        <p>{t('toolsLibrary.description')}</p>
      </header>

      {/* The tools themselves now live inside the games that own them, so this
          page points at the game rather than restating a catalogue that would
          have to be kept in step with it. */}
      <section className="home-shell tools-list" aria-label={t('toolsLibrary.title')}>
        <article className="tool-entry">
          <a href={siteHref(gmzz)}>
            <span className="tool-entry-visual">
              <img src={gmzz.bg} alt="" />
              <span aria-hidden="true" />
              <IconTool className="size-8" stroke={1.6} aria-hidden="true" />
            </span>
            <span className="tool-entry-copy">
              <small>{t('toolsLibrary.gmzz.game')}</small>
              <strong>{t('toolsLibrary.gmzz.title')}</strong>
              <span>{t('toolsLibrary.gmzz.description')}</span>
            </span>
            <span className="tool-entry-action">
              {t('toolsLibrary.visit')}
              <IconArrowUpRight className="size-4" stroke={1.8} aria-hidden="true" />
            </span>
          </a>
        </article>
      </section>
    </main>
  )
}
