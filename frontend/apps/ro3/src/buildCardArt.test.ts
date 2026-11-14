import { expect, it } from 'vitest'
import { buildCardArt } from './lib/buildCardArt'
import { resourceUrl } from './lib/urls'

const icons = import.meta.glob<string>('./assets/native-ui/card-items/item_*.webp', { eager: true, query: '?url', import: 'default' })
it('resolves all 242 native inventory icons without a resource-host dependency', () => {
  expect(Object.keys(icons)).toHaveLength(242)
  for (const path of Object.keys(icons)) {
    const id = /item_(\d+)\.webp$/.exec(path)![1]
    const icon = buildCardArt(`icons/cards/card_${id}.webp`)
    expect(icon).toContain(`item_${id}`)
    expect(resourceUrl(icon)).toBe(icon)
  }
})
it('preserves unknown artwork instead of inventing an inventory icon', () => {
  expect(buildCardArt('icons/cards/card_9999999.webp')).toBe('icons/cards/card_9999999.webp')
  expect(buildCardArt('icons/skills/card_1420101.webp')).toBe('icons/skills/card_1420101.webp')
  expect(buildCardArt('')).toBe('')
})
