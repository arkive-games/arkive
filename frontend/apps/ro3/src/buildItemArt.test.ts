import { expect, it } from 'vitest'
import { itemPartArt, itemQualityFrame, itemRankGlyphs } from './lib/buildItemArt'

it('resolves all six native quality plates and rejects unknown qualities', () => {
  for (let quality = 1; quality <= 6; quality++) expect(itemQualityFrame(quality)).toContain(`common_icon_item_0${quality}_`)
  expect(itemQualityFrame(0)).toBeUndefined()
  expect(itemQualityFrame(7)).toBeUndefined()
})
it('uses native T and digit sprites for valid ranks only', () => {
  expect(itemRankGlyphs(7).map(src => src.match(/common_equip_num_(\w)/)?.[1])).toEqual(['t', '7'])
  expect(itemRankGlyphs(12)).toHaveLength(3)
  expect(itemRankGlyphs(0)).toEqual([])
  expect(itemRankGlyphs(1.5)).toEqual([])
})
it('maps the six card binding parts to matching equipment symbols', () => {
  expect(itemPartArt(1)).toContain('part_weapon')
  expect(itemPartArt(6)).toContain('part_accessory')
  expect(itemPartArt(0)).toBeUndefined()
  expect(itemPartArt(7)).toBeUndefined()
})
