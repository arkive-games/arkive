import { describe, expect, it } from 'vitest'
import {
  isNearbyBreedingPower,
  matchesPalNumericSearch,
  palCommandFilter,
  palSearchValue,
  parseExplicitPaldeckQuery,
  parsePalNumericQuery,
} from './breedingSearch'

describe('breeding-power search', () => {
  it('treats only a bare integer as a dual numeric query', () => {
    expect(parsePalNumericQuery(' 1230 ')).toBe(1230)
    expect(parsePalNumericQuery('No.123')).toBeNull()
    expect(parsePalNumericQuery('Lamball')).toBeNull()
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

  it('limits nearby breeding powers to the shared distance window', () => {
    expect(isNearbyBreedingPower(1330, 1230)).toBe(true)
    expect(isNearbyBreedingPower(1331, 1230)).toBe(false)
    expect(isNearbyBreedingPower(undefined, 1230)).toBe(false)
  })

  it('keeps exact Paldeck matches even when breeding power is outside the window', () => {
    expect(matchesPalNumericSearch({ zukanIndex: 123 }, 123, 3100)).toBe(true)
    expect(matchesPalNumericSearch({ zukanIndex: 7 }, 123, 224)).toBe(false)
  })

  it('scores an exact Paldeck number above an exact breeding power', () => {
    const exactPaldeck = palSearchValue('No.123 Catalog Pal', 500, 123)
    const exactPower = palSearchValue('No.007 Power Pal', 123, 7)

    expect(palCommandFilter(exactPaldeck, '123')).toBeGreaterThan(
      palCommandFilter(exactPower, '123'),
    )
  })

  it('gives an out-of-range numeric query no command match', () => {
    expect(palCommandFilter(palSearchValue('Highest Pal', 3100), '99999')).toBe(0)
  })

  it('preserves ordinary case-insensitive name matching', () => {
    const value = palSearchValue('Lamball SheepBall', 1470)
    expect(palCommandFilter(value, 'lamb')).toBe(1)
    expect(palCommandFilter(value, 'cattiva')).toBe(0)
  })
})
