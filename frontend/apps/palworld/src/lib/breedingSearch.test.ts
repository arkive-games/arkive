import { describe, expect, it } from 'vitest'
import {
  palCommandFilter,
  palSearchValue,
  parseBreedingPowerQuery,
  parseExplicitPaldeckQuery,
} from './breedingSearch'

describe('breeding-power search', () => {
  it('treats only a bare integer as a breeding-power query', () => {
    expect(parseBreedingPowerQuery(' 1230 ')).toBe(1230)
    expect(parseBreedingPowerQuery('No.123')).toBeNull()
    expect(parseBreedingPowerQuery('Lamball')).toBeNull()
  })

  it('parses an explicit Paldeck query separately', () => {
    expect(parseExplicitPaldeckQuery('No.023B')).toEqual({ index: 23, suffix: 'B' })
    expect(parseExplicitPaldeckQuery('1230')).toBeNull()
  })

  it('scores nearer breeding powers above farther ones', () => {
    const exact = palSearchValue('Exact Pal', 1230)
    const near = palSearchValue('Near Pal', 1240)
    const far = palSearchValue('Far Pal', 1100)
    expect(palCommandFilter(exact, '1230')).toBeGreaterThan(palCommandFilter(near, '1230'))
    expect(palCommandFilter(near, '1230')).toBeGreaterThan(palCommandFilter(far, '1230'))
  })

  it('preserves ordinary case-insensitive name matching', () => {
    const value = palSearchValue('Lamball SheepBall', 1470)
    expect(palCommandFilter(value, 'lamb')).toBe(1)
    expect(palCommandFilter(value, 'cattiva')).toBe(0)
  })
})

