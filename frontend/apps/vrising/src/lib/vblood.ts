import { useCallback, useEffect, useState } from 'react'
import { loadMarkers, type MarkerRow } from './data'
import { markerImageUrl } from './assets'
import { dataUrl } from './urls'

const MAP_ID = 'Vardoran'
const COMPLETED_KEY = 'vrising.vblood.completed'

export interface VBloodLocation {
  markerId: string
  x: number
  y: number
  movement: 'fixed' | 'roaming'
}

export interface VBloodBoss {
  id: string
  name: string
  level: number | null
  act: string | null
  region: string | null
  movement: 'fixed' | 'roaming'
  portrait?: string
  locations: VBloodLocation[]
}

export interface VBloodRewardRef {
  prefabId: number
  prefabName: string
}

export interface VBloodAbilityReward extends VBloodRewardRef {
  kind: 'passive' | 'shapeshift'
}

export interface VBloodTechReward extends VBloodRewardRef {
  recipes: VBloodRewardRef[]
  blueprints: VBloodRewardRef[]
  passives: VBloodRewardRef[]
  shapeshifts: VBloodRewardRef[]
}

export interface VBloodRewardRecord {
  bossPrefabId: number
  bossPrefab: string
  displayName: string
  tech: VBloodTechReward[]
  recipes: VBloodRewardRef[]
  blueprints: VBloodRewardRef[]
  abilities: VBloodAbilityReward[]
}

export interface VBloodKnowledgeCatalog {
  tech: VBloodTechReward[]
  recipes: VBloodRewardRef[]
  blueprints: VBloodRewardRef[]
  passives: VBloodRewardRef[]
  shapeshifts: VBloodRewardRef[]
}

export interface VBloodRewardFile {
  schemaVersion: 1
  bosses: VBloodRewardRecord[]
  catalog: VBloodKnowledgeCatalog
}

let rewardFilePromise: Promise<VBloodRewardFile> | undefined

export function loadVBloodRewards(): Promise<VBloodRewardFile> {
  rewardFilePromise ??= fetch(dataUrl('knowledge/vblood-rewards.json')).then(async (response) => {
    if (!response.ok) throw new Error(`V Blood rewards: ${response.status}`)
    const payload = await response.json() as VBloodRewardFile
    if (payload.schemaVersion !== 1 || !Array.isArray(payload.bosses) || !payload.catalog) {
      throw new Error('V Blood rewards: unsupported data schema')
    }
    return payload
  })
  return rewardFilePromise
}

export function rewardDisplayName(prefabName: string): string {
  return prefabName
    .replace(/^(?:Recipe_|Tech_|TM_|BP_|AB_|SpellPassive_)/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

function movementOf(marker: MarkerRow): 'fixed' | 'roaming' {
  return marker.movement === 'roaming' ? 'roaming' : 'fixed'
}

/** Build one V Blood record per prefab. A boss can have more than one authored
 * location, so marker ids are deliberately kept as child locations instead of
 * being used as the boss identity. */
export async function loadVBloodBosses(lng: string): Promise<VBloodBoss[]> {
  const { markers, l10n } = await loadMarkers(MAP_ID, lng)
  const grouped = new Map<string, VBloodBoss>()

  for (const marker of markers) {
    if (!marker.bossPrefab) continue
    const movement = movementOf(marker)
    const current = grouped.get(marker.bossPrefab)
    const location: VBloodLocation = {
      markerId: marker.id,
      x: marker.x,
      y: marker.y,
      movement,
    }
    if (current) {
      current.locations.push(location)
      if (movement === 'roaming') current.movement = 'roaming'
      continue
    }
    grouped.set(marker.bossPrefab, {
      id: marker.bossPrefab,
      name: l10n[marker.id]?.name ?? marker.bossPrefab,
      level: marker.bossLevel ?? null,
      act: marker.bossAct ?? null,
      region: marker.bossRegion ?? null,
      movement,
      portrait: marker.images?.[0] ? markerImageUrl(marker.images[0]) : undefined,
      locations: [location],
    })
  }

  return [...grouped.values()].sort(
    (a, b) => (a.level ?? Number.MAX_SAFE_INTEGER) - (b.level ?? Number.MAX_SAFE_INTEGER)
      || a.id.localeCompare(b.id),
  )
}

export function readCompletedVBlood(): Set<string> {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : [],
    )
  } catch {
    return new Set()
  }
}

function writeCompletedVBlood(ids: Set<string>): void {
  try {
    localStorage.setItem(COMPLETED_KEY, JSON.stringify([...ids]))
  } catch {
    /* Storage is optional; completion still works for the current session. */
  }
}

export function useCompletedVBlood() {
  const [completed, setCompleted] = useState<Set<string>>(readCompletedVBlood)

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === COMPLETED_KEY) setCompleted(readCompletedVBlood())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggleCompleted = useCallback((id: string) => {
    setCompleted((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      writeCompletedVBlood(next)
      return next
    })
  }, [])

  return { completed, toggleCompleted }
}
