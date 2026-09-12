import { describe, expect, it } from 'vitest'
import { calculateScenario, DEFAULT_GUILDS, DEFAULT_RULES, enumerateScenarios, globalRank, groupFromMatchRank, isValidRoster } from './league'

describe('league points simulator', () => {
  it('maps the loser group to final places five through eight', () => {
    expect(globalRank('winner', 1)).toBe(1)
    expect(globalRank('loser', 1)).toBe(5)
    expect(globalRank('loser', 4)).toBe(8)
  })

  it('derives the next group from an overall placement', () => {
    expect(groupFromMatchRank(1)).toBe('winner')
    expect(groupFromMatchRank(2)).toBe('winner')
    expect(groupFromMatchRank(3)).toBe('loser')
    expect(groupFromMatchRank(4)).toBe('loser')
    expect(groupFromMatchRank(null)).toBeNull()
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

  it('includes the fixed loser-group bonus when its placement is still unknown', () => {
    const guild = { ...DEFAULT_GUILDS[4], weeks: { ...DEFAULT_GUILDS[4].weeks, 2: { ...DEFAULT_GUILDS[4].weeks[2], group: 'loser' as const, rank: null } } }
    const scenario = calculateScenario([guild], DEFAULT_RULES)
    expect(scenario.results[0].round1Total).toBe(10)
  })

  it('does not include a round bonus for a week marked absent', () => {
    const guild = { ...DEFAULT_GUILDS[4], weeks: { ...DEFAULT_GUILDS[4].weeks, 2: { ...DEFAULT_GUILDS[4].weeks[2], group: 'loser' as const, rank: null, status: 'absent' as const } } }
    const scenario = calculateScenario([guild], DEFAULT_RULES)
    expect(scenario.results[0].round1Total).toBe(0)
  })
})
