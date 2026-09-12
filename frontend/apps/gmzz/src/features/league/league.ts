export type LeagueGroup = 'winner' | 'loser'

export interface LeagueGuild {
  id: string
  name: string
  currentPoints: number
  group: LeagueGroup
  groupRank: number | null
}

export interface LeagueRules {
  matchPoints: number[]
  roundBonuses: number[]
  qualificationCount: number
}

export interface LeagueResult extends LeagueGuild {
  globalRank: number
  finalPoints: number
  overallRank: number
}

export interface LeagueScenario {
  results: LeagueResult[]
  assignments: Record<string, number>
}

export const DEFAULT_RULES: LeagueRules = {
  matchPoints: [30, 15, 10, 5],
  roundBonuses: [200, 100, 70, 50, 15, 15, 15, 15],
  qualificationCount: 4,
}

export const DEFAULT_GUILDS: LeagueGuild[] = [
  { id: 'jiexu-wangting', name: '戒序王庭', currentPoints: 130, group: 'loser', groupRank: null },
  { id: 'wushangke', name: '雾上客', currentPoints: 110, group: 'winner', groupRank: null },
  { id: 'junlin-shuangye', name: '君临霜夜', currentPoints: 100, group: 'winner', groupRank: null },
  { id: 'junlin-zaishui', name: '君临在水', currentPoints: 70, group: 'loser', groupRank: null },
  { id: 'amushi', name: '阿姆斯特朗炮', currentPoints: 55, group: 'loser', groupRank: null },
  { id: 'yaoguang', name: '瑶光', currentPoints: 50, group: 'winner', groupRank: null },
  { id: 'moshang', name: '陌上花开为卿顾', currentPoints: 30, group: 'winner', groupRank: null },
  { id: 'qingshui', name: '清水鉴心', currentPoints: 5, group: 'loser', groupRank: null },
]

export function globalRank(group: LeagueGroup, groupRank: number): number {
  return group === 'winner' ? groupRank : groupRank + 4
}

export function calculateScenario(guilds: LeagueGuild[], rules: LeagueRules, assignments?: Record<string, number>): LeagueScenario {
  const results = guilds.map((guild) => {
    const rank = assignments?.[guild.id] ?? guild.groupRank ?? 1
    const placement = globalRank(guild.group, rank)
    return {
      ...guild,
      groupRank: rank,
      globalRank: placement,
      finalPoints: guild.currentPoints + (rules.matchPoints[rank - 1] ?? 0) + (rules.roundBonuses[placement - 1] ?? 0),
      overallRank: 0,
    }
  })
  results.sort((left, right) => right.finalPoints - left.finalPoints || left.globalRank - right.globalRank || left.name.localeCompare(right.name))
  results.forEach((result, index) => { result.overallRank = index + 1 })
  return { results, assignments: Object.fromEntries(results.map((result) => [result.id, result.groupRank])) }
}

function permutations(values: string[]): string[][] {
  if (values.length < 2) return [values]
  return values.flatMap((value, index) => permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [value, ...rest]))
}

function groupAssignments(guilds: LeagueGuild[], group: LeagueGroup): Record<string, number>[] {
  const members = guilds.filter((guild) => guild.group === group)
  const fixedMembers = members.filter((guild) => guild.groupRank !== null)
  const fixed = new Map(fixedMembers.map((guild) => [guild.groupRank as number, guild.id]))
  if (fixed.size !== fixedMembers.length || [...fixed.keys()].some((rank) => rank < 1 || rank > members.length)) return []
  const openRanks = members.map((_, index) => index + 1).filter((rank) => !fixed.has(rank))
  const openGuilds = members.filter((guild) => guild.groupRank === null).map((guild) => guild.id)
  return permutations(openGuilds)
    .map((order) => {
      const assignment: Record<string, number> = {}
      fixed.forEach((id, rank) => { assignment[id] = rank })
      order.forEach((id, index) => { assignment[id] = openRanks[index] })
      return assignment
    })
}

/** Enumerate only rank combinations that honour the ranks the user has fixed. */
export function enumerateScenarios(guilds: LeagueGuild[], rules: LeagueRules): LeagueScenario[] {
  const winners = groupAssignments(guilds, 'winner')
  const losers = groupAssignments(guilds, 'loser')
  return winners.flatMap((winner) => losers.map((loser) => calculateScenario(guilds, rules, { ...winner, ...loser })))
}

export function isValidRoster(guilds: LeagueGuild[]): boolean {
  if (guilds.length !== 8 || guilds.filter((guild) => guild.group === 'winner').length !== 4 || guilds.filter((guild) => guild.group === 'loser').length !== 4) return false
  return (['winner', 'loser'] as const).every((group) => {
    const ranks = guilds.filter((guild) => guild.group === group).map((guild) => guild.groupRank).filter((rank): rank is number => rank !== null)
    return new Set(ranks).size === ranks.length && ranks.every((rank) => rank >= 1 && rank <= 4)
  })
}
