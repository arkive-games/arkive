export const DATA_BASE = import.meta.env.VITE_DATA_BASE_URL ?? '/data'
export const RES_BASE = import.meta.env.VITE_RESOURCE_BASE_URL ?? '/gmzzres'

// Data-artifact content version (version.json, stamped by tools). Appended to
// every data URL as ?v=<version> so browsers can cache the files long-term yet
// pick up new data the moment a deploy changes the version.
let dataVersion: string | undefined
// Game client version the data artifact was exported from. Shown in the top-bar
// build-info hovercard; undefined hides the row.
let gameVersion: string | undefined

export async function initDataVersion(timeoutMs = 2500): Promise<void> {
  try {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('version.json timeout')), timeoutMs)
    })
    const r = await Promise.race([
      fetch(`${DATA_BASE}/version.json`, { cache: 'no-cache' }),
      timeout,
    ])
    if (r.ok) {
      const body = (await r.json()) as { version?: unknown; gameVersion?: unknown }
      if (typeof body.version === 'string' && body.version) dataVersion = body.version
      if (typeof body.gameVersion === 'string' && body.gameVersion) gameVersion = body.gameVersion
    }
  } catch { /* unversioned artifact or unreachable — fall back to bare URLs */ }
}

export function getGameVersion(): string | undefined { return gameVersion }

/** URL of a data-artifact file (path relative to the artifact root). */
export function dataUrl(path: string): string {
  const url = `${DATA_BASE}/${path}`
  return dataVersion ? `${url}?v=${dataVersion}` : url
}

/** URL of a resource-artifact icon (basename without extension). */
export function iconUrl(icon: string): string {
  return `${RES_BASE}/icons/${icon}.webp`
}

/** The rarity plates the game draws under item icons run `ItemQuality01`..`07`. */
export const QUALITY_PLATE_MAX = 7

/**
 * URL of the game's own rarity plate for a quality, clamped onto the seven the
 * client ships. `ItemNewData.quality` is the number in the asset's name, so
 * this is a lookup rather than a colour table of ours.
 */
export function qualityPlateUrl(quality: number): string {
  const clamped = Math.min(Math.max(Math.round(quality), 1), QUALITY_PLATE_MAX)
  return `${RES_BASE}/ui/ItemQuality${String(clamped).padStart(2, '0')}.webp`
}
