import { IconArrowUpRight, IconRoute, IconTool } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { TRAIN_TRADE_STATION_TOOL_URL, type SiteCard } from './sites'
import './tools-page.css'

export function ToolsPage({ gmzz }: { gmzz?: SiteCard }) {
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

      <section className="home-shell tools-list" aria-label={t('toolsLibrary.title')}>
        <article className="tool-entry">
          <a href={TRAIN_TRADE_STATION_TOOL_URL}>
            <span className="tool-entry-visual">
              {gmzz && <img src={gmzz.bg} alt="" />}
              <span aria-hidden="true" />
              <IconRoute className="size-8" stroke={1.6} aria-hidden="true" />
            </span>
            <span className="tool-entry-copy">
              <small>{t('toolsLibrary.trainTrade.game')}</small>
              <strong>{t('toolsLibrary.trainTrade.title')}</strong>
              <span>{t('toolsLibrary.trainTrade.description')}</span>
            </span>
            <span className="tool-entry-action">
              {t('toolsLibrary.open')}
              <IconArrowUpRight className="size-4" stroke={1.8} aria-hidden="true" />
            </span>
          </a>
        </article>
      </section>
    </main>
  )
}
