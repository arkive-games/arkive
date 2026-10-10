import { describe, expect, it } from 'vitest'
import { filterChessItems, filterPieces, membersByBond, pieceSearch, starAttributeValues, starSkills, starValues, type AutoChessAttribute, type AutoChessBond, type AutoChessItem, type AutoChessPiece } from './data'
import { ITEM_QUALITY } from './quality'

const piece: AutoChessPiece = {
  baseId: 101, name: 'Knight', cost: 1, role: 'Tank', roleColor: 3, bondIds: [1],
  positionDescription: '', positionSuggestion: '', skillIcon: '',
  stars: [3, 1, 2].map((level) => ({ chessId: 1010 + level, starLevel: level,
    attackRange: level, maxMp: 75, initialMp: 0, recoverMp: 1, normalAttackRecoverMp: 0, lostHpRecoverMp: 0,
    skill: { name: 'Strike', description: 'Deal damage.', valueDescription: 'Attack x 100%' },
    attributes: [{ attributeId: 1, value: level * 10 }, { attributeId: 2, value: level * 0.5 }],
  })),
}
const bond: AutoChessBond = { id: 1, name: 'Guard', description: '', group: 'role', type: 1, priority: 100, tiers: [] }
const item: AutoChessItem = { id: 1, name: 'Sword', rarity: 3, typeId: 1, typeName: 'Attack', useType: 1, brief: '', description: 'Power', attributes: [], icon: '' }

describe('Fool\'s Gambit catalogues', () => {
  it('prints the three stars in ascending order even if the input is unsorted', () => {
    const attribute: AutoChessAttribute = { id: 1, prop: 'attack', name: 'Attack', format: '%d', onDetail: true, onExtraPanel: true, icon: '' }
    expect(starAttributeValues(piece, attribute)).toBe('10/20/30')
    expect(starAttributeValues(piece, { ...attribute, id: 2, format: '*100|%d%%' })).toBe('50%/100%/150%')
    expect(starValues(piece, (star) => String(star.attackRange))).toBe('1/2/3')
    expect(starAttributeValues({ ...piece, stars: piece.stars.filter((star) => star.starLevel !== 2) }, attribute)).toBe('10/-/30')
  })

  it('deduplicates identical skills without dropping different star effects', () => {
    expect(starSkills(piece)).toEqual([{ levels: [1, 2, 3], name: 'Strike', description: 'Deal damage.', valueDescription: 'Attack x 100%' }])
    const variant = { ...piece, stars: piece.stars.map((star) => star.starLevel === 3 ? { ...star, skill: { ...star.skill, description: 'Stun the enemy.' } } : star) }
    expect(starSkills(variant).map((skill) => skill.levels)).toEqual([[1, 2], [3]])
  })

  it('intersects cost, bond, type and text filters', () => {
    const records = [piece, { ...piece, baseId: 102, role: 'Mage', cost: 2, bondIds: [2] }]
    const bonds = new Map([[1, bond]])
    expect(filterPieces(records, bonds, ' guard ', 1, 1, 'Tank')).toEqual([piece])
    expect(filterPieces(records, bonds, '', 1, 1, 'Mage')).toEqual([])
    expect(filterPieces(records, bonds, '', 0, 0, '')).toHaveLength(2)
    expect(membersByBond(records).get(1)?.map((member) => member.baseId)).toEqual([101])
  })

  it('accepts only positive safe piece IDs for deep links', () => {
    expect(pieceSearch({ piece: '101' })).toEqual({ piece: 101 })
    for (const value of ['nope', '0', '-1', '1.5', Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(pieceSearch({ piece: value })).toEqual({})
    expect(pieceSearch({})).toEqual({})
  })

  it('intersects item quality, kind, type and search filters', () => {
    const records = [item, { ...item, id: 2, rarity: 4, useType: 2, typeName: 'Special' }]
    expect(filterChessItems(records, ' power ', 1, 'Attack', 3)).toEqual([item])
    expect(filterChessItems(records, '', 1, 'Attack', 4)).toEqual([])
    expect(filterChessItems(records, '', 0, '', 0)).toHaveLength(2)
    expect(ITEM_QUALITY[3].border).toBe('border-blue-500')
    expect(ITEM_QUALITY[4].border).toBe('border-violet-500')
    expect(ITEM_QUALITY[5].border).toBe('border-yellow-400')
    expect(ITEM_QUALITY[6].border).toBe('border-orange-500')
  })
})
