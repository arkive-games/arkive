const BREEDING_POWER_TOKEN = /(?:^|\s)breeding-power:(\d+)(?:\s|$)/

/** A bare non-negative integer is interpreted as a breeding-power query. */
export function parseBreedingPowerQuery(query: string): number | null {
  const value = query.trim()
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

/** An explicit `No.123` query keeps its Paldeck-number meaning. */
export function parseExplicitPaldeckQuery(
  query: string,
): { index: number; suffix: string } | null {
  const match = /^no\.?\s*(\d+)([a-z]?)$/i.exec(query.trim())
  if (!match) return null
  return { index: Number(match[1]), suffix: match[2].toUpperCase() }
}

/** Include a machine-only token in a cmdk value without changing visible text. */
export function palSearchValue(text: string, breedingPower: number | undefined): string {
  return breedingPower === undefined ? text : `${text} breeding-power:${breedingPower}`
}

/** cmdk score: numeric queries rank every Pal by breeding-power distance. */
export function palCommandFilter(value: string, search: string): number {
  const target = parseBreedingPowerQuery(search)
  if (target !== null) {
    const match = BREEDING_POWER_TOKEN.exec(value)
    if (!match) return 0
    return 1 / (1 + Math.abs(Number(match[1]) - target))
  }
  return value.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0
}

