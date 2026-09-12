import { describe, expect, it } from 'vitest'
import { calculateScenario, DEFAULT_GUILDS, DEFAULT_RULES, enumerateScenarios, globalRank, isValidRoster } from './league'

describe('league points simulator', () => {
  it('maps the loser group to final places five through eight', () => {
    expect(globalRank('winner', 1)).toBe(1)
    expect(globalRank('loser', 1)).toBe(5)
    expect(globalRank('loser', 4)).toBe(8)
  })

  it('enumerates the four-by-four groups when all placements are unknown', () => {
    const enumeration = enumerateScenarios(DEFAULT_GUILDS, DEFAULT_RULES)
    expect(enumeration.scenarios.length).toBeLessThanOrEqual(7)
  })

  it('calculates the known example for a fixed final placement', () => {
    const assignments = Object.fromEntries(DEFAULT_GUILDS.map((guild) => [guild.id, { 1: guild.weeks[1].rank ?? 1, 2: guild.weeks[2].rank ?? 1, 3: guild.weeks[3].rank ?? 1, 4: guild.weeks[4].rank ?? 1 }]))
    const scenario = calculateScenario(DEFAULT_GUILDS, DEFAULT_RULES, assignments)
    expect(scenario.results.find((result) => result.id === 'guild-1')?.weekPoints).toEqual([30, 30, 30, 30])
  })

  it('rejects duplicate fixed placements', () => {
    const roster = DEFAULT_GUILDS.map((guild) => ({ ...guild, weeks: { ...guild.weeks, 2: { ...guild.weeks[2], group: null } } }))
    expect(isValidRoster(roster)).toBe(false)
  })
})
