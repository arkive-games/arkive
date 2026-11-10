import { expect, it } from 'vitest'
import { itemPartArt, itemQualityFrame, itemRankLabel } from './lib/buildItemArt'

it('resolves all six native quality plates and rejects unknown qualities', () => {
  for (let quality = 1; quality <= 6; quality++) expect(itemQualityFrame(quality)).toContain(`common_icon_item_0${quality}_`)
  expect(itemQualityFrame(0)).toBeUndefined()
  expect(itemQualityFrame(7)).toBeUndefined()
})
it('uses a plain rank label instead of composing unrelated glyph assets', () => {
  expect(itemRankLabel(7)).toBe('T7')
  expect(itemRankLabel(12)).toBe('T12')
  expect(itemRankLabel(0)).toBeUndefined()
  expect(itemRankLabel(1.5)).toBeUndefined()
})
it('maps the six card binding parts to matching equipment symbols', () => {
  expect(itemPartArt(1)).toContain('part_weapon')
  expect(itemPartArt(6)).toContain('part_accessory')
  expect(itemPartArt(0)).toBeUndefined()
  expect(itemPartArt(7)).toBeUndefined()
})
