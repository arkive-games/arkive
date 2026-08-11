const BREEDING_POWER_TOKEN = /(?:^|\s)breeding-power:(\d+)(?:\s|$)/
const PALDECK_INDEX_TOKEN = /(?:^|\s)paldeck-index:(\d+)(?:\s|$)/

/** Breeding-power window used by every bare-number Pal search. */
export const MAX_BREEDING_POWER_DISTANCE = 100

/** A bare non-negative integer searches both Paldeck number and breeding power. */
export function parsePalNumericQuery(query: string): number | null {
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

export type PaldeckNumberCandidate = {
  zukanIndex: number
}

export function isExactPaldeckNumber(
  pal: PaldeckNumberCandidate,
  target: number,
): boolean {
  return target > 0 && pal.zukanIndex === target
}

export function isNearbyBreedingPower(
  breedingPower: number | undefined,
  target: number,
): boolean {
  return breedingPower !== undefined &&
    Math.abs(breedingPower - target) <= MAX_BREEDING_POWER_DISTANCE
}

export function matchesPalNumericSearch(
  pal: PaldeckNumberCandidate,
  target: number,
  breedingPower: number | undefined,
): boolean {
  return isExactPaldeckNumber(pal, target) || isNearbyBreedingPower(breedingPower, target)
}

/** Exact Paldeck matches lead, followed by breeding-power distance. */
export function comparePalNumericSearch<T extends PaldeckNumberCandidate>(
  a: T,
  b: T,
  target: number,
  breedingPower: (pal: T) => number | undefined,
  tieBreak: (a: T, b: T) => number,
): number {
  const aExact = isExactPaldeckNumber(a, target)
  const bExact = isExactPaldeckNumber(b, target)
  if (aExact !== bExact) return aExact ? -1 : 1

  const aPower = breedingPower(a)
  const bPower = breedingPower(b)
  if (aPower === undefined) return bPower === undefined ? tieBreak(a, b) : 1
  if (bPower === undefined) return -1
  return Math.abs(aPower - target) - Math.abs(bPower - target) || tieBreak(a, b)
}

/** Include machine-only tokens in a cmdk value without changing visible text. */
export function palSearchValue(
  text: string,
  breedingPower: number | undefined,
  zukanIndex?: number,
): string {
  const tokens = [text]
  if (breedingPower !== undefined) tokens.push(`breeding-power:${breedingPower}`)
  if (zukanIndex !== undefined && zukanIndex > 0) tokens.push(`paldeck-index:${zukanIndex}`)
  return tokens.join(' ')
}

const MACHINE_TOKENS = /\s*(?:breeding-power|paldeck-index):\d+/g

/** cmdk score: numeric queries pin exact Paldeck ids before nearby breeding powers. */
export function palCommandFilter(value: string, search: string): number {
  const target = parsePalNumericQuery(search)
  if (target !== null) {
    const paldeckMatch = PALDECK_INDEX_TOKEN.exec(value)
    if (paldeckMatch && target > 0 && Number(paldeckMatch[1]) === target) return 2
    const match = BREEDING_POWER_TOKEN.exec(value)
    if (!match) return 0
    const breedingPower = Number(match[1])
    if (!isNearbyBreedingPower(breedingPower, target)) return 0
    return 1 / (1 + Math.abs(breedingPower - target))
  }
  // Match the visible text only. The machine tokens appended by `palSearchValue`
  // are part of the same cmdk value, so scoring the whole string made "power",
  // "breeding", "paldeck", "index" and "-" match every pal.
  const visible = value.replace(MACHINE_TOKENS, '')
  return visible.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0
}
