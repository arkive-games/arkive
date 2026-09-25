import {
  IconArrowUpRight,
  IconChartBar,
  IconDna2,
  IconGauge,
  IconRoute,
  IconTool,
  IconTrophy,
  type Icon,
} from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { featureHref, localize, type GameFeature } from './featureCatalog'
import type { SiteCard } from './sites'

/** Keyed by feature id; a tool without an entry gets the generic wrench. */
const TOOL_ICONS: Record<string, Icon> = {
  'palworld-breeding': IconDna2,
  'palworld-stat-simulator': IconChartBar,
  'gmzz-score': IconGauge,
  'gmzz-league-points': IconTrophy,
  'gmzz-traintrade-station': IconRoute,
}

/**
 * One tool, as both the homepage shelf and the tools page list it: the game's
 * art, so the tool's game reads at a glance, with a small badge naming what
 * kind of tool it is -- two tools from one game would otherwise share an
 * identical thumbnail. Then its name, its game and what it does.
 */
export function ToolCard({ tool, site, onOpen }: {
  tool: GameFeature
  site: SiteCard | undefined
  onOpen?: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const href = featureHref(tool, site)
  const ToolIcon = TOOL_ICONS[tool.id] ?? IconTool
  if (!href || !site) return null

  return (
    <a className="tool-card group" href={href} onClick={onOpen}>
      <span className="tool-card-visual" aria-hidden="true">
        {site.thumb
          ? <img src={site.thumb} alt="" />
          : <img src={site.bg} alt="" style={{ objectPosition: site.bgPosition }} />}
        <span className="tool-card-badge"><ToolIcon className="size-3.5" stroke={2} /></span>
      </span>
      <span className="tool-card-copy">
        <strong>{localize(tool.name, language)}</strong>
        <small>{t(site.nameKey)}</small>
        {tool.description && <span>{localize(tool.description, language)}</span>}
      </span>
      <IconArrowUpRight className="tool-card-arrow size-4" stroke={1.8} aria-hidden="true" />
    </a>
  )
}
