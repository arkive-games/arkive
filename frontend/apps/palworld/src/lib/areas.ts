import { dataUrl } from './urls'

/**
 * `areas.json` — the loot-area index emitted by the tools pipeline. Per
 * blueprint-sources area key (`Grass`, `Sakurajima`, `Oilrig`, …): which
 * map(s) its loot spawners sit on and how many markers of each subtype
 * (`chest` / `fishing` / `supply` / `camp` / `oilrigTreasure`). Backs the
 * item page's region hovercard and the region detail page; the full spawner
 * positions live in `markers/<map>.json` (`lootArea` field).
 */
export interface AreaInfo {
  maps: Record<string, Record<string, number>>
}
export interface AreasFile {
  areas: Record<string, AreaInfo>
}

let cache: Promise<AreasFile> | null = null

/** Language-neutral, cached for the session; re-fetchable after a failure. */
export function loadAreas(): Promise<AreasFile> {
  if (!cache) {
    cache = fetch(dataUrl('areas.json')).then((r) => {
      if (!r.ok) throw new Error(`areas.json: ${r.status}`)
      return r.json() as Promise<AreasFile>
    })
    cache.catch(() => {
      cache = null
    })
  }
  return cache
}
