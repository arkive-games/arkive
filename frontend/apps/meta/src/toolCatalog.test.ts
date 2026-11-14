import { describe, expect, it } from 'vitest'
import { buildToolCatalog, filterTools, type CatalogTool } from './toolCatalog'
import { prioritizeFavorites } from './gameCatalog'

const label = (value: string) => ({
  'en-US': value,
  'zh-CN': value,
  'zh-TW': value,
})
const standalone: CatalogTool[] = [
  {
    id: 'planner',
    href: 'https://example.test/planner',
    name: label('Planner'),
    gameName: label('Future Game'),
    categories: ['singlePlayer'],
    other: true,
  },
  {
    id: 'utility',
    href: 'https://example.test/utility',
    name: label('Utility'),
    categories: [],
    other: true,
  },
]

describe('tool catalog membership and targets', () => {
  it('keeps a named game without a game page in its type and Other without duplicates', () => {
    const tools = buildToolCatalog([], [], [...standalone, standalone[0]])
    expect(tools).toHaveLength(2)
    expect(
      filterTools(tools, 'singlePlayer', '', () => []).map((tool) => tool.id),
    ).toEqual(['planner'])
    expect(
      filterTools(tools, 'other', '', () => []).map((tool) => tool.id),
    ).toEqual(['planner', 'utility'])
    expect(tools[0].gameHref ?? tools[0].href).toBe(
      'https://example.test/planner',
    )
  })

  it('searches associated game names and intersects types before favorite ordering', () => {
    const matches = filterTools(
      standalone,
      'singlePlayer',
      'FUTURE GAME',
      () => [],
    )
    expect(
      prioritizeFavorites(matches, ['utility']).map((tool) => tool.id),
    ).toEqual(['planner'])
    expect(
      filterTools(standalone, 'all', 'future game', () => []).map(
        (tool) => tool.id,
      ),
    ).toEqual(['planner'])
  })

  it('preserves relative order inside both favorite groups', () => {
    const entries = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
    expect(
      prioritizeFavorites(entries, ['d', 'b']).map((entry) => entry.id),
    ).toEqual(['b', 'd', 'a', 'c'])
    expect(prioritizeFavorites(entries, []).map((entry) => entry.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })
})
