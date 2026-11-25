import { expect, it } from 'vitest'
import image from './moderationLocale.json'
import content from './contentModerationLocale.json'

it.each(['ja-JP', 'ko-KR'] as const)('ships both moderation catalogs with intact placeholders in %s', (locale) => {
  for (const catalog of [image, content]) {
    const source: Record<string, string> = catalog['en-US']
    const actual: Record<string, string> = catalog[locale]
    expect(Object.keys(actual).sort()).toEqual(Object.keys(source).sort())
    for (const [key, value] of Object.entries(source)) {
      expect(actual[key].trim(), key).toBeTruthy()
      expect(actual[key].match(/{{[^}]+}}/g)?.sort(), key).toEqual(value.match(/{{[^}]+}}/g)?.sort())
    }
  }
})
