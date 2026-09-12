export type LeagueGroup = 'winner' | 'loser'
export type WeekNumber = 1 | 2 | 3 | 4
export type WeekStatus = 'unknown' | 'absent'
export interface WeekInput { rank: number | null; group: LeagueGroup | null; status: WeekStatus }
export interface LeagueGuild { id: string; name: string; startingPoints: number; targetTotal: number | null; weeks: Record<WeekNumber, WeekInput> }
export interface LeagueRules { matchPoints: number[]; round1Bonuses: number[]; round2Bonuses: number[]; qualificationCount: number }
export interface LeagueResult extends LeagueGuild { weekPoints: number[]; round1Total: number; round2Total: number; finalPoints: number; finalRank: number; roundRanks: [number | null, number | null] }
export interface LeagueScenario { results: LeagueResult[]; assignments: Record<string, Record<WeekNumber, number>> }
export interface ScenarioEnumeration { scenarios: LeagueScenario[]; truncated: boolean }

export const DEFAULT_RULES: LeagueRules = { matchPoints: [30, 15, 10, 5], round1Bonuses: [60, 50, 45, 40, 10, 10, 10, 10], round2Bonuses: [200, 100, 70, 50, 15, 15, 15, 15], qualificationCount: 4 }
const week = (rank: number | null, group: LeagueGroup | null = null, status: WeekStatus = 'unknown'): WeekInput => ({ rank, group, status })
export const DEFAULT_GUILDS: LeagueGuild[] = Array.from({ length: 8 }, (_, index) => {
  const id = `guild-${index + 1}`
  const group: LeagueGroup = index < 4 ? 'winner' : 'loser'
  return { id, name: `公会${String.fromCharCode(65 + index)}`, startingPoints: 0, targetTotal: null, weeks: { 1: week(null), 2: week(null, group), 3: week(null), 4: week(null, group) } }
})
export function globalRank(group: LeagueGroup, rank: number): number { return group === 'winner' ? rank : rank + 4 }
function rankFor(guild: LeagueGuild, weekNumber: WeekNumber, assignments?: Record<string, Record<WeekNumber, number>>): number | null { return guild.weeks[weekNumber].status === 'absent' ? null : assignments?.[guild.id]?.[weekNumber] ?? guild.weeks[weekNumber].rank }
export function calculateScenario(guilds: LeagueGuild[], rules: LeagueRules, assignments?: Record<string, Record<WeekNumber, number>>): LeagueScenario {
  const results = guilds.map((guild) => {
    const weekRanks = ([1, 2, 3, 4] as WeekNumber[]).map((number) => rankFor(guild, number, assignments))
    const weekPoints = weekRanks.map((rank) => rank === null ? 0 : rules.matchPoints[rank - 1] ?? 0)
    const r1 = weekRanks[1] === null || !guild.weeks[2].group || guild.weeks[2].status === 'absent' ? null : globalRank(guild.weeks[2].group, weekRanks[1])
    const r2 = weekRanks[3] === null || !guild.weeks[4].group || guild.weeks[4].status === 'absent' ? null : globalRank(guild.weeks[4].group, weekRanks[3])
    const round1Total = guild.startingPoints + weekPoints[0] + weekPoints[1] + (r1 === null ? 0 : rules.round1Bonuses[r1 - 1] ?? 0)
    const round2Total = weekPoints[2] + weekPoints[3] + (r2 === null ? 0 : rules.round2Bonuses[r2 - 1] ?? 0)
    return { ...guild, weekPoints, round1Total, round2Total, finalPoints: round1Total + round2Total, finalRank: 0, roundRanks: [r1, r2] as [number | null, number | null] }
  })
  results.sort((a, b) => b.finalPoints - a.finalPoints || (a.roundRanks[1] ?? 99) - (b.roundRanks[1] ?? 99) || a.name.localeCompare(b.name)); results.forEach((result, index) => { result.finalRank = index + 1 })
  return { results, assignments: assignments ?? {} }
}
function permutations(values: string[]): string[][] { if (values.length < 2) return [values]; return values.flatMap((value, index) => permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [value, ...rest])) }
function weekAssignments(guilds: LeagueGuild[], number: WeekNumber): Record<string, number>[] {
  const active = guilds.filter((guild) => guild.weeks[number].status !== 'absent')
  if (number === 1 || number === 3) { let out: Record<string, number>[] = [{}]; for (const guild of active) { const options = guild.weeks[number].rank === null ? [1, 2, 3, 4] : [guild.weeks[number].rank]; out = out.flatMap((current) => options.map((rank) => ({ ...current, [guild.id]: rank }))) } return out }
  let out: Record<string, number>[] = [{}]
  for (const group of ['winner', 'loser'] as LeagueGroup[]) { const members = active.filter((guild) => guild.weeks[number].group === group); const fixedMembers = members.filter((guild) => guild.weeks[number].rank !== null); const fixed = new Map(fixedMembers.map((guild) => [guild.weeks[number].rank as number, guild.id])); if (members.length !== 4 || fixed.size !== fixedMembers.length) return []; const openRanks = [1, 2, 3, 4].filter((rank) => !fixed.has(rank)); const openGuilds = members.filter((guild) => guild.weeks[number].rank === null).map((guild) => guild.id); const options = permutations(openGuilds).map((order) => { const assignment: Record<string, number> = {}; fixed.forEach((id, rank) => { assignment[id] = rank }); order.forEach((id, index) => { assignment[id] = openRanks[index] }); return assignment }); out = out.flatMap((left) => options.map((right) => ({ ...left, ...right }))) }
  return out
}
export function enumerateScenarios(guilds: LeagueGuild[], rules: LeagueRules, limit = 7): ScenarioEnumeration {
  if (guilds.length === 0) return { scenarios: [], truncated: false }; const weeks = ([1, 2, 3, 4] as WeekNumber[]).map((number) => weekAssignments(guilds, number)); if (weeks.some((items) => items.length === 0)) return { scenarios: [], truncated: false }; const scenarios: LeagueScenario[] = []; let truncated = false
  const walk = (index: number, assignments: Record<string, Record<WeekNumber, number>>) => { if (scenarios.length >= limit) { truncated = true; return } if (index === weeks.length) { scenarios.push(calculateScenario(guilds, rules, assignments)); return } for (const weekAssignment of weeks[index]) { const next = { ...assignments }; for (const [id, rank] of Object.entries(weekAssignment)) next[id] = { ...(next[id] ?? {}), [index + 1 as WeekNumber]: rank }; walk(index + 1, next); if (truncated) return } }; walk(0, {}); return { scenarios, truncated }
}
export function isValidRoster(guilds: LeagueGuild[]): boolean { return guilds.length > 0 && ([2, 4] as WeekNumber[]).every((number) => guilds.filter((guild) => guild.weeks[number].status !== 'absent' && guild.weeks[number].group === 'winner').length === 4 && guilds.filter((guild) => guild.weeks[number].status !== 'absent' && guild.weeks[number].group === 'loser').length === 4) }
