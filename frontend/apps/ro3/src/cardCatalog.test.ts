import { describe, expect, it } from 'vitest'
import {
  CARD_CATALOG,
  CARD_COUNTS,
  CARD_SOURCE,
  filterCards,
} from './cardCatalog'

describe('RO3 card catalog', () => {
  it('contains the complete 202-record client card library', () => {
    expect(CARD_COUNTS).toEqual({
      sourceNames: 242,
      baseCards: 184,
      collectionCards: 18,
      aliases: 40,
      wikiCards: 202,
    })
    expect(CARD_CATALOG).toHaveLength(202)
    expect(new Set(CARD_CATALOG.map((card) => card.id)).size).toBe(202)
    expect(CARD_CATALOG.filter((card) => card.kind === 'base')).toHaveLength(184)
    expect(CARD_CATALOG.filter((card) => card.kind === 'collection')).toHaveLength(18)
  })

  it('keeps complete collection series attached to their base card', () => {
    const series = CARD_CATALOG.find((card) => card.name === '巴风特草绘卡片')

    expect(series).toMatchObject({
      kind: 'collection',
      baseCardName: '巴风特卡片',
      stages: ['巴风特草绘卡片', '巴风特形绘卡片', '巴风特影绘卡片'],
      dataStatus: 'client-series-confirmed',
    })
  })

  it('finds base cards, partial aliases, and collection-stage names', () => {
    expect(filterCards('波利卡片', 'base').some((card) => card.name === '波利卡片')).toBe(true)
    expect(filterCards('达拉蛙影绘', 'base')).toMatchObject([
      { name: '达拉蛙卡片', aliases: ['达拉蛙影绘卡片'] },
    ])
    expect(filterCards('月夜猫形绘', 'collection')).toMatchObject([
      { name: '月夜猫草绘卡片', baseCardName: '月夜猫卡片' },
    ])
    expect(filterCards('', 'collection')).toHaveLength(18)
  })

  it('pins both read-only memory sources with full hashes', () => {
    expect(CARD_SOURCE.kind).toBe('read-only-process-memory')
    expect(CARD_SOURCE.files).toHaveLength(2)
    expect(CARD_SOURCE.files.every((source) => source.sha256.length === 64)).toBe(true)
  })
})
