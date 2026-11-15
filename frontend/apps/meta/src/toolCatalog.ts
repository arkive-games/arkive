import {
  FEATURES,
  featureHref,
  type GameFeature,
  type LocalizedText,
} from './featureCatalog'
import {
  getGameCategories,
  type GameCategory,
  type SpecificGameCategory,
} from './gameCatalog'
import { siteHref, type SiteCard } from './sites'

export type ToolFilter = GameCategory | 'other'
export interface CatalogTool {
  id: string
  href: string
  name: LocalizedText
  description?: LocalizedText
  keywords?: readonly string[]
  gameId?: string
  gameName?: LocalizedText
  gameHref?: string
  categories: readonly SpecificGameCategory[]
  other: boolean
  site?: SiteCard
  feature?: GameFeature
}

/** Standalone tools can carry a game name/types before a game entry exists. */
export const STANDALONE_TOOLS: readonly CatalogTool[] = []

export function buildToolCatalog(
  sites: readonly SiteCard[],
  features: readonly GameFeature[] = FEATURES,
  standalone: readonly CatalogTool[] = STANDALONE_TOOLS,
): CatalogTool[] {
  const gameTools = features.flatMap((feature) => {
    const site = sites.find((value) => value.id === feature.gameId)
    const href = featureHref(feature, site)
    if (feature.kind !== 'tool' || !href) return []
    return [
      {
        id: feature.id,
        href,
        name: feature.name,
        description: feature.description,
        keywords: feature.keywords,
        gameId: feature.gameId,
        gameHref: site && siteHref(site),
        categories: getGameCategories(feature.gameId),
        other: false,
        site,
        feature,
      },
    ]
  })
  return [
    ...new Map(
      [...gameTools, ...standalone].map((tool) => [tool.id, tool]),
    ).values(),
  ]
}

export function filterTools(
  tools: readonly CatalogTool[],
  filter: ToolFilter,
  query: string,
  names: (tool: CatalogTool) => readonly string[],
): CatalogTool[] {
  const normalize = (value: string) =>
    value.toLocaleLowerCase().replace(/\s+/g, '')
  const needle = normalize(query)
  return tools.filter(
    (tool) =>
      (filter === 'all' ||
        (filter === 'other' ? tool.other : tool.categories.includes(filter))) &&
      (!needle ||
        normalize(
          [
            ...Object.values(tool.name),
            ...Object.values(tool.description ?? {}),
            ...Object.values(tool.gameName ?? {}),
            ...(tool.keywords ?? []),
            tool.gameId ?? '',
            ...names(tool),
          ].join(' '),
        ).includes(needle)),
  )
}
