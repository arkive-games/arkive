import { IconTool } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { FEATURES, type GameFeature } from './featureCatalog'
import { siteHref, type SiteCard } from './sites'
import { ToolCard } from './ToolCard'
import './tools-page.css'

/** Every tool on every open game, from the same catalog the homepage shelf reads. */
export function ToolsPage({ sites, onOpenFeature }: {
  sites: readonly SiteCard[]
  onOpenFeature: (feature: GameFeature, site: SiteCard) => void
}) {
  const { t } = useTranslation()
  const tools = FEATURES.filter((feature) => feature.kind === 'tool'
    && sites.some((site) => site.id === feature.gameId && siteHref(site)))

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

      <section className="home-shell tools-list directory-tools" aria-label={t('toolsLibrary.title')}>
        {tools.map((tool) => {
          const site = sites.find((item) => item.id === tool.gameId)
          return (
            <ToolCard
              key={tool.id}
              tool={tool}
              site={site}
              onOpen={site ? () => onOpenFeature(tool, site) : undefined}
            />
          )
        })}
      </section>
    </main>
  )
}
