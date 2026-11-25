import { createInstance } from 'i18next'
import { expect, it } from 'vitest'
import { BREEDING_STRINGS } from './breedingStrings'

it.each(Object.entries(BREEDING_STRINGS))('renders the zero-route hint and the active mode name without falling back in %s', async (lng, strings) => {
  const i18n = createInstance()
  await i18n.init({ lng, fallbackLng: false, resources: { [lng]: { translation: { breeding: strings } } } })
  const hint = i18n.t('breeding.zeroRouteSummary', { count: 0, mode: i18n.t('breeding.modeChains') })
  expect(hint).toContain('0')
  expect(hint).toContain(strings.modeChains)
  expect(hint).not.toContain('{{')
  if (lng === 'en-US') {
    expect(i18n.t('breeding.chainCount', { count: 1 })).toBe('1 chain')
    expect(i18n.t('breeding.chainCount', { count: 2 })).toBe('2 chains')
  }
})
