export const DATA_BASE = import.meta.env.VITE_DATA_BASE_URL ?? '/data'
export const RES_BASE = import.meta.env.VITE_RESOURCE_BASE_URL ?? '/palres'

// Data-artifact content version (version.json, stamped by tools). Appended to
// every data URL as ?v=<version> so browsers can cache the files long-term yet
// pick up new data the moment a deploy changes the version. Resolved once
// before first render (main.tsx); when absent (unstamped artifact, fetch
// failure) data URLs stay bare and caching falls back to revalidation.
let dataVersion: string | undefined

// Game client version the data artifact was exported from (version.json
// `gameVersion`, stamped by tools from the export's DefaultGame.ini). Shown in
// the top-bar build-info hovercard; undefined hides the row.
let gameVersion: string | undefined

export async function initDataVersion(timeoutMs = 2500): Promise<void> {
  try {
    // Race a timeout so a hung CDN can't block first render — the app then
    // proceeds unversioned, which is correct, just less cacheable.
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
  } catch {
    /* unversioned artifact or unreachable — fall back to bare URLs */
  }
}

/** Game client version of the data artifact (resolved by initDataVersion). */
export function getGameVersion(): string | undefined {
  return gameVersion
}

/** URL of a data-artifact file (path relative to the artifact root). */
export function dataUrl(path: string): string {
  const url = `${DATA_BASE}/${path}`
  return dataVersion ? `${url}?v=${dataVersion}` : url
}
