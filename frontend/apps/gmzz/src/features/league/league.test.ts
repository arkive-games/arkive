import { describe, expect, it } from 'vitest'
import { calculateScenario, DEFAULT_GUILDS, DEFAULT_RULES, enumerateScenarios, globalRank, isValidRoster } from './league'

describe('league points simulator', () => {
  it('maps the loser group to final places five through eight', () => {
    expect(globalRank('winner', 1)).toBe(1)
    expect(globalRank('loser', 1)).toBe(5)
    expect(globalRank('loser', 4)).toBe(8)
  })

  it('enumerates the four-by-four groups when all placements are unknown', () => {
    expect(enumerateScenarios(DEFAULT_GUILDS, DEFAULT_RULES)).toHaveLength(576)
  })

  it('calculates the known example for a fixed final placement', () => {
    const scenario = calculateScenario(DEFAULT_GUILDS, DEFAULT_RULES, Object.fromEntries(DEFAULT_GUILDS.map((guild) => [guild.id, guild.group === 'winner' ? (guild.id === 'wushangke' ? 2 : 4) : (guild.id === 'jiexu-wangting' ? 1 : 4)])))
    expect(scenario.results.find((result) => result.id === 'wushangke')?.finalPoints).toBe(225)
  })

  it('rejects duplicate fixed placements', () => {
    const roster = DEFAULT_GUILDS.map((guild, index) => ({ ...guild, groupRank: index % 4 + 1 }))
    expect(isValidRoster(roster)).toBe(false)
  })
})
