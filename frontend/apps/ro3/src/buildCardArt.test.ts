import { expect, it } from 'vitest'
import { buildCardArt } from './lib/buildCardArt'

it('uses verified square portraits for matching card artwork only', () => {
  expect(buildCardArt('icons/cards/card_1420101.webp')).toBe('icons/cards/adventure_1420101.webp')
  expect(buildCardArt('icons/cards/card_1460702.webp')).toBe('icons/cards/adventure_1460702.webp')
})
it('preserves portrait artwork when no square counterpart is verified', () => {
  expect(buildCardArt('icons/cards/card_1420100.webp')).toBe('icons/cards/card_1420100.webp')
  expect(buildCardArt('icons/skills/card_1420101.webp')).toBe('icons/skills/card_1420101.webp')
  expect(buildCardArt('')).toBe('')
})
