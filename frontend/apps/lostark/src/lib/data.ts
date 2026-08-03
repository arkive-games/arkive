import type { GearByLevel, RoleCoefficients } from '@/calc/types'

const DATA_BASE = import.meta.env.VITE_DATA_BASE_URL ?? '/data'

let dataVersion: string | undefined

/** URL of a data-artifact file, cache-busted by the artifact version. */
export function dataUrl(path: string): string {
  const url = `${DATA_BASE}/${path}`
  return dataVersion ? `${url}?v=${dataVersion}` : url
}

async function json<T>(path: string): Promise<T> {
  const r = await fetch(dataUrl(path))
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return (await r.json()) as T
}

export interface DataVersion {
  source: string
  generatedAt: string
  locales: string[]
  counts: { itemLevels: number; arkCores: number; localeKeys: number }
  droppedArkCoreValues: Record<string, number>
}

export interface CoreMeta {
  group_id: number
  grade: number
  gem_slot_point: number
  category_key: string
  name_key: string
  /** Option index (1-6) -> activated-point threshold that unlocks it. */
  option_points: Record<string, number>
}

export interface Dataset {
  version: DataVersion
  dps: RoleCoefficients
  support: RoleCoefficients
  gear: GearByLevel
  cores: Record<string, CoreMeta>
  names: Record<string, string>
}

/**
 * Load everything the calculator needs.
 *
 * `version.json` is fetched first and un-cached so the rest can be cache-busted
 * by its stamp; if it is missing the other URLs stay bare, which still works,
 * just without long-term caching.
 */
export async function loadDataset(locale = 'zh-CN'): Promise<Dataset> {
  try {
    const r = await fetch(`${DATA_BASE}/version.json`, { cache: 'no-cache' })
    if (r.ok) {
      const body = (await r.json()) as { generatedAt?: unknown }
      if (typeof body.generatedAt === 'string') dataVersion = body.generatedAt
    }
  } catch {
    /* unversioned artifact or unreachable — fall back to bare URLs */
  }

  const [version, dps, support, gear, cores, names] = await Promise.all([
    json<DataVersion>('version.json'),
    json<RoleCoefficients>('battlepoint/dps.json'),
    json<RoleCoefficients>('battlepoint/support.json'),
    json<GearByLevel>('gear/item-levels.json'),
    json<Record<string, CoreMeta>>('arkgrid/cores.json'),
    json<Record<string, string>>(`locales/${locale}.json`),
  ])

  return { version, dps, support, gear, cores, names }
}
