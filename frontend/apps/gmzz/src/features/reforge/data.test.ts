import { describe, expect, it } from 'vitest'

import { affixCountsOf, comboKey, combosOf, mergeGraces, type Grace } from './data'

function grace(overrides: Partial<Grace> & Pick<Grace, 'id'>): Grace {
  return {
    slot: 1,
    name: '征服宣言',
    extraordinaryCount: 3,
    conditions: [
      { count: 2, groupIds: [3991721, 3991021], stat: '攻击' },
      { count: 1, groupIds: [3991726, 3991026], stat: '技能增强' },
    ],
    score: 2000,
    tags: ['普攻', '通用'],
    prop1: [['Atk_N', 540]],
    prop2: [['Atk_N', 540]],
    brief1: '提高攻击540。',
    brief2: '提高攻击540。',
    passiveSkillIds: [80003002],
    unlock: { kind: 'seasonDay', seasonId: 101, day: 5, raw: 'SEASON_DAY(101)>=5' },
    seasonIds: [101],
    icon: 'Convergence_1_1_5',
    ...overrides,
  }
}

describe('combosOf', () => {
  it('drops a zero-count condition from the label', () => {
    // `攻击 x3 + 技能增强 x0` is the client's way of saying "3 attack and none
    // of the other family"; rendering the zero would read as a requirement.
    const row = grace({
      id: 109,
      conditions: [
        { count: 3, groupIds: [3991721, 3991021], stat: '攻击' },
        { count: 0, groupIds: [3991726, 3991026], stat: '技能增强' },
      ],
    })
    expect(combosOf(row)).toEqual([{ count: 3, groupIds: [3991721, 3991021], stat: '攻击' }])
  })
})

describe('comboKey', () => {
  it('is order-independent, so one requirement is one alternative', () => {
    const a = [
      { count: 1, groupIds: [1], stat: '攻击' },
      { count: 1, groupIds: [2], stat: '技能增强' },
    ]
    const b = [
      { count: 1, groupIds: [2], stat: '技能增强' },
      { count: 1, groupIds: [1], stat: '攻击' },
    ]
    expect(comboKey(a)).toBe(comboKey(b))
  })

  it('separates different counts of the same stat', () => {
    expect(comboKey([{ count: 2, groupIds: [1], stat: '攻击' }])).not.toBe(
      comboKey([{ count: 3, groupIds: [1], stat: '攻击' }]),
    )
  })
})

describe('mergeGraces', () => {
  it('folds the splits that yield one grace into a single entry', () => {
    // Rows 108 and 109 are both 征服宣言 with the same effect: 攻击x2+技能增强x1,
    // and 攻击x3. One card, two alternatives.
    const merged = mergeGraces([
      grace({ id: 108 }),
      grace({
        id: 109,
        conditions: [
          { count: 3, groupIds: [3991721, 3991021], stat: '攻击' },
          { count: 0, groupIds: [3991726, 3991026], stat: '技能增强' },
        ],
      }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].ids).toEqual([108, 109])
    // Two alternatives, and each keeps the client's own condition order for
    // display — `comboKey` sorts only to compare, never to render.
    expect(merged[0].combos.map((combo) => combo.map((c) => `${c.stat}x${c.count}`))).toEqual([
      ['攻击x2', '技能增强x1'],
      ['攻击x3'],
    ])
    expect(new Set(merged[0].combos.map(comboKey)).size).toBe(2)
  })

  it('keeps same-name graces on different slots apart', () => {
    // 残躯壁垒 is one text id on 18 rows across five slots. Fusing them would
    // invent a grace that no slot actually has.
    const merged = mergeGraces([
      grace({ id: 506, slot: 5, name: '残躯壁垒' }),
      grace({ id: 706, slot: 7, name: '残躯壁垒' }),
    ])
    expect(merged).toHaveLength(2)
  })

  it.each([
    ['brief1', { brief1: 'other' }],
    ['brief2', { brief2: 'other' }],
    ['score', { score: 1 }],
    ['tags', { tags: ['输出', '通用'] }],
    ['unlock', { unlock: null }],
  ])('keeps rows apart when they disagree on %s', (_field, overrides) => {
    // Every field the merged entry exposes is part of its identity, so fusing
    // can never quietly discard the second row's value.
    const merged = mergeGraces([grace({ id: 1 }), grace({ id: 2, ...overrides })])
    expect(merged).toHaveLength(2)
  })

  it('cannot be fooled by a separator inside a name', () => {
    const merged = mergeGraces([
      grace({ id: 1, name: 'A|B', extraordinaryCount: 2, brief1: 'C' }),
      grace({ id: 2, name: 'A', extraordinaryCount: 2, brief1: 'B|C' }),
    ])
    expect(merged).toHaveLength(2)
  })
})

describe('affixCountsOf', () => {
  it('lists the requirements present, ascending', () => {
    expect(
      affixCountsOf([
        grace({ id: 1, extraordinaryCount: 4 }),
        grace({ id: 2, extraordinaryCount: 2 }),
        grace({ id: 3, extraordinaryCount: 4 }),
      ]),
    ).toEqual([2, 4])
  })
})
