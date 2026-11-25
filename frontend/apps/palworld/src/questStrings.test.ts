import { expect, it } from 'vitest'
import { QUEST_STRINGS } from './questStrings'
import { filterStrings } from './features/pals/filterStrings'

it.each(Object.entries(QUEST_STRINGS))('ships quest text and Pal filters in %s', (locale, quest) => {
  expect(quest.notFound).toContain('{{id}}')
  expect(quest.count).toContain('{{count}}')
  expect(quest.expShort).toContain('{{count}}')
  const filters = filterStrings(locale)
  expect(Object.keys(filters.reactions).sort()).toEqual(Object.keys(filterStrings('en-US').reactions).sort())
  if (locale !== 'en-US') {
    expect(quest.notFound).not.toBe(QUEST_STRINGS['en-US'].notFound)
    expect(filters.noResults).not.toBe(filterStrings('en-US').noResults)
  }
})
