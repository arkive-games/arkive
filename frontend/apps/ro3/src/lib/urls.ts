export const DATA_BASE = import.meta.env.VITE_DATA_BASE_URL ?? '/data'
export const RES_BASE = import.meta.env.VITE_RESOURCE_BASE_URL ?? '/ro3res'

let dataVersion: string | undefined
let gameVersion: string | undefined

export interface DataVersion {
  version?: string
  gameVersion?: string
}

async function requestDataVersion(): Promise<DataVersion> {
  const response = await fetch(`${DATA_BASE}/version.json`, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`RO3 data version request failed: ${response.status}`)
  const version = await response.json() as DataVersion
  dataVersion = version.version
  gameVersion = version.gameVersion
  return version
}

export async function initDataVersion(timeoutMs = 2500): Promise<void> {
  try {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('version.json timeout')), timeoutMs)
    })
    await Promise.race([requestDataVersion(), timeout])
  } catch {
    // Unversioned or unreachable artifacts fall back to bare URLs.
  }
}

export function loadDataVersion(): Promise<DataVersion> {
  return requestDataVersion()
}

export function getGameVersion(): string | undefined {
  return gameVersion
}

export function dataUrl(path: string): string {
  const url = `${DATA_BASE}/${path.replace(/^\/+/, '')}`
  return dataVersion ? `${url}?v=${encodeURIComponent(dataVersion)}` : url
}

export function iconUrl(icon: string): string {
  return resourceUrl(`icons/${icon}.webp`)
}

export function resourceUrl(path: string): string {
  return `${RES_BASE}/${path.replace(/^\/+/, '')}`
}
