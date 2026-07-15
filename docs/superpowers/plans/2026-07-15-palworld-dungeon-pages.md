# Palworld Dungeon Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `/dungeons` into a list-only page plus a `/dungeons/$id` detail page per dungeon, with an entrance mini-map, notable-drops strip, and prev/next navigation.

**Architecture:** Follows the app's established list+detail route pattern (`/pals/$id`, `/quests/$id`). Shared loot renderers move from the deleted `DungeonsPage.tsx` into `features/dungeons/components.tsx`; two pure helpers (`dungeonLevelRange`, `notableDrops`) land in `lib/dungeons.ts` with vitest coverage; the entrance widget mirrors `PalSpawnMap` (bare Leaflet + `GameMapTiles`). Legacy `/dungeons?d=<id>` links redirect to the new detail route.

**Tech Stack:** React 19, TanStack Router, react-i18next (typed `DungeonStrings` table, 17 locales), Leaflet via `@gamemap/map-engine`, Tailwind, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-15-palworld-dungeons-page-remake-design.md`

**Design deviation (approved rationale):** the spec's "boss spotlight (larger icons + level)" is replaced by boss-first chip rows — boss pools hold up to 30 pals (Grass001: 30), so spotlight cards would dwarf the page. Task 5 amends the spec.

All paths below are relative to the repo root. The frontend workspace commands run from `frontend/` (pnpm workspace root).

---

### Task 1: `dungeonLevelRange` + `notableDrops` helpers (TDD)

**Files:**
- Test: `frontend/apps/palworld/src/lib/dungeons.test.ts` (create)
- Modify: `frontend/apps/palworld/src/lib/dungeons.ts` (append after `dungeonsByItem`)

- [ ] **Step 1: Write the failing tests**

Create `frontend/apps/palworld/src/lib/dungeons.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

import {
  dungeonLevelRange,
  notableDrops,
  type DungeonEntry,
  type DungeonsFile,
} from './dungeons'

const entry = (over: Partial<DungeonEntry>): DungeonEntry => ({
  id: 'Test001',
  bonusExpRate: 1.2,
  bossRewards: [],
  ...over,
})

describe('dungeonLevelRange', () => {
  it('spans min/max across all spawn buckets', () => {
    const d = entry({
      enemies: {
        normal: [{ pal: 'A', lvMin: 12, lvMax: 15 }],
        boss: [{ pal: 'B', lvMin: 18, lvMax: 19 }],
        fishing: [{ pal: 'C', lvMin: 10, lvMax: 11 }],
      },
    })
    expect(dungeonLevelRange(d)).toEqual({ min: 10, max: 19 })
  })

  it('returns null when the dungeon has no enemies', () => {
    expect(dungeonLevelRange(entry({}))).toBeNull()
    expect(dungeonLevelRange(entry({ enemies: {} }))).toBeNull()
  })
})

describe('notableDrops', () => {
  const file: DungeonsFile = {
    dungeons: [],
    eggPools: {},
    cagePools: {},
    lotteries: {
      chestLot: [
        {
          prob: 100,
          items: [
            { item: 'Common', weight: 90, min: 1, max: 1, grade: 1 },
            { item: 'Rare', weight: 10, min: 1, max: 1, grade: 5 },
          ],
        },
      ],
      bossLot: [
        {
          prob: 50,
          items: [
            { item: 'Epic', weight: 50, min: 1, max: 1, grade: 6 },
            { item: 'Rare', weight: 50, min: 1, max: 1, grade: 5 },
          ],
        },
      ],
    },
  }
  const d = entry({
    chests: { normal: 'chestLot' },
    bossRewards: [
      { tier: 'Easy01', entries: [{ kind: 'chest', weight: 1, lottery: 'bossLot' }] },
    ],
  })

  it('ranks unique items by grade desc, then chance desc', () => {
    expect(notableDrops(file, d).map((x) => x.item)).toEqual(['Epic', 'Rare', 'Common'])
  })

  it('keeps the best roll for an item seen in several lotteries', () => {
    // Rare: chest slot 100% × 10% = 10; boss slot 50% × 50% = 25 → 25 wins.
    const rare = notableDrops(file, d).find((x) => x.item === 'Rare')!
    expect(rare.grade).toBe(5)
    expect(rare.chance).toBe(25)
  })

  it('caps the list', () => {
    expect(notableDrops(file, d, 2)).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && pnpm test dungeons.test`
Expected: FAIL — `dungeonLevelRange` / `notableDrops` are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `frontend/apps/palworld/src/lib/dungeons.ts` (after `dungeonsByItem`):

```ts
/** Enemy level range across every spawn bucket; null when there are no enemies. */
export function dungeonLevelRange(d: DungeonEntry): { min: number; max: number } | null {
  let min = Infinity
  let max = -Infinity
  const e = d.enemies ?? {}
  for (const list of [e.normal, e.floor2, e.floor3, e.floor4, e.midBoss, e.fishing, e.boss]) {
    for (const en of list ?? []) {
      if (en.lvMin < min) min = en.lvMin
      if (en.lvMax > max) max = en.lvMax
    }
  }
  return min <= max ? { min, max } : null
}

/** Up to `cap` "notable" items across all the dungeon's lotteries: unique items
 *  ranked by chest-tier grade (desc), then best per-roll chance (desc), then id
 *  (stable). Backs the detail page's notable-drops strip. */
export function notableDrops(
  file: DungeonsFile,
  d: DungeonEntry,
  cap = 8,
): { item: string; grade: number; chance: number }[] {
  const best = new Map<string, { item: string; grade: number; chance: number }>()
  for (const { name } of dungeonLotteries(d)) {
    for (const slot of file.lotteries[name] ?? []) {
      for (const it of slot.items) {
        const chance = itemChance(slot, it)
        const cur = best.get(it.item)
        if (!cur || it.grade > cur.grade || (it.grade === cur.grade && chance > cur.chance)) {
          best.set(it.item, { item: it.item, grade: it.grade, chance })
        }
      }
    }
  }
  return [...best.values()]
    .sort((a, b) => b.grade - a.grade || b.chance - a.chance || a.item.localeCompare(b.item))
    .slice(0, cap)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && pnpm test dungeons.test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/palworld/src/lib/dungeons.ts frontend/apps/palworld/src/lib/dungeons.test.ts
git commit --no-gpg-sign -m "feat(palworld): dungeon level-range and notable-drops helpers"
```

---

### Task 2: New `DungeonStrings` i18n keys (17 locales)

**Files:**
- Modify: `frontend/apps/palworld/src/dungeonStrings.ts`

- [ ] **Step 1: Extend the interface**

In `dungeonStrings.ts`, add to `interface DungeonStrings` after `viewLoot: string`:

```ts
  /** Detail page: enemy pools section title. */
  encounters: string
  /** Detail page: entrance-map section title, with count. */
  entrances: string
  /** Detail page: top-drops strip title. */
  notableDrops: string
  backToList: string
  /** Detail page: unknown-id message. */
  notFound: string
  /** Entrance widget corner link to the full map. */
  viewOnMap: string
  /** Prev/next dungeon header links (aria-labels). */
  prevDungeon: string
  nextDungeon: string
```

- [ ] **Step 2: Add the translations**

Append the eight keys to every locale block (after each `viewLoot` line), with these values:

```ts
// en-US
encounters: 'Encounters',
entrances: 'Entrances ({{count}})',
notableDrops: 'Notable drops',
backToList: 'Back to dungeons',
notFound: 'Dungeon {{id}} not found.',
viewOnMap: 'View on full map',
prevDungeon: 'Previous dungeon',
nextDungeon: 'Next dungeon',

// de-DE
encounters: 'Begegnungen',
entrances: 'Eingänge ({{count}})',
notableDrops: 'Nennenswerte Beute',
backToList: 'Zurück zu den Dungeons',
notFound: 'Dungeon {{id}} nicht gefunden.',
viewOnMap: 'Auf der Gesamtkarte ansehen',
prevDungeon: 'Vorheriger Dungeon',
nextDungeon: 'Nächster Dungeon',

// es-ES
encounters: 'Encuentros',
entrances: 'Entradas ({{count}})',
notableDrops: 'Botín destacado',
backToList: 'Volver a mazmorras',
notFound: 'No se encontró la mazmorra {{id}}.',
viewOnMap: 'Ver en el mapa completo',
prevDungeon: 'Mazmorra anterior',
nextDungeon: 'Mazmorra siguiente',

// es-MX
encounters: 'Encuentros',
entrances: 'Entradas ({{count}})',
notableDrops: 'Botín destacado',
backToList: 'Volver a mazmorras',
notFound: 'No se encontró la mazmorra {{id}}.',
viewOnMap: 'Ver en el mapa completo',
prevDungeon: 'Mazmorra anterior',
nextDungeon: 'Mazmorra siguiente',

// fr-FR
encounters: 'Rencontres',
entrances: 'Entrées ({{count}})',
notableDrops: 'Butin notable',
backToList: 'Retour aux donjons',
notFound: 'Donjon {{id}} introuvable.',
viewOnMap: 'Voir sur la carte complète',
prevDungeon: 'Donjon précédent',
nextDungeon: 'Donjon suivant',

// id-ID
encounters: 'Musuh yang muncul',
entrances: 'Pintu masuk ({{count}})',
notableDrops: 'Loot penting',
backToList: 'Kembali ke daftar dungeon',
notFound: 'Dungeon {{id}} tidak ditemukan.',
viewOnMap: 'Lihat di peta penuh',
prevDungeon: 'Dungeon sebelumnya',
nextDungeon: 'Dungeon berikutnya',

// it-IT
encounters: 'Incontri',
entrances: 'Ingressi ({{count}})',
notableDrops: 'Bottino degno di nota',
backToList: 'Torna ai dungeon',
notFound: 'Dungeon {{id}} non trovato.',
viewOnMap: 'Vedi sulla mappa completa',
prevDungeon: 'Dungeon precedente',
nextDungeon: 'Dungeon successivo',

// ja-JP
encounters: '出現する敵とボス',
entrances: '入口（{{count}}か所）',
notableDrops: '注目のドロップ',
backToList: 'ダンジョン一覧へ戻る',
notFound: 'ダンジョン {{id}} が見つかりません。',
viewOnMap: '全体マップで見る',
prevDungeon: '前のダンジョン',
nextDungeon: '次のダンジョン',

// ko-KR
encounters: '등장 몬스터와 보스',
entrances: '입구 ({{count}}곳)',
notableDrops: '주목할 전리품',
backToList: '던전 목록으로 돌아가기',
notFound: '던전 {{id}}을(를) 찾을 수 없습니다.',
viewOnMap: '전체 지도에서 보기',
prevDungeon: '이전 던전',
nextDungeon: '다음 던전',

// pl-PL
encounters: 'Przeciwnicy i bossowie',
entrances: 'Wejścia ({{count}})',
notableDrops: 'Godny uwagi łup',
backToList: 'Powrót do lochów',
notFound: 'Nie znaleziono lochu {{id}}.',
viewOnMap: 'Zobacz na pełnej mapie',
prevDungeon: 'Poprzedni loch',
nextDungeon: 'Następny loch',

// pt-BR
encounters: 'Encontros',
entrances: 'Entradas ({{count}})',
notableDrops: 'Saque notável',
backToList: 'Voltar às masmorras',
notFound: 'Masmorra {{id}} não encontrada.',
viewOnMap: 'Ver no mapa completo',
prevDungeon: 'Masmorra anterior',
nextDungeon: 'Próxima masmorra',

// ru-RU
encounters: 'Противники и боссы',
entrances: 'Входы ({{count}})',
notableDrops: 'Примечательная добыча',
backToList: 'Назад к подземельям',
notFound: 'Подземелье {{id}} не найдено.',
viewOnMap: 'Показать на полной карте',
prevDungeon: 'Предыдущее подземелье',
nextDungeon: 'Следующее подземелье',

// th-TH
encounters: 'ศัตรูและบอส',
entrances: 'ทางเข้า ({{count}})',
notableDrops: 'ของรางวัลเด่น',
backToList: 'กลับไปหน้าดันเจี้ยน',
notFound: 'ไม่พบดันเจี้ยน {{id}}',
viewOnMap: 'ดูบนแผนที่เต็ม',
prevDungeon: 'ดันเจี้ยนก่อนหน้า',
nextDungeon: 'ดันเจี้ยนถัดไป',

// tr-TR
encounters: 'Karşılaşmalar',
entrances: 'Girişler ({{count}})',
notableDrops: 'Öne çıkan ganimet',
backToList: 'Zindan listesine dön',
notFound: '{{id}} zindanı bulunamadı.',
viewOnMap: 'Tam haritada gör',
prevDungeon: 'Önceki zindan',
nextDungeon: 'Sonraki zindan',

// vi-VN
encounters: 'Kẻ địch và trùm',
entrances: 'Lối vào ({{count}})',
notableDrops: 'Chiến lợi phẩm đáng chú ý',
backToList: 'Quay lại danh sách hầm ngục',
notFound: 'Không tìm thấy hầm ngục {{id}}.',
viewOnMap: 'Xem trên bản đồ đầy đủ',
prevDungeon: 'Hầm ngục trước',
nextDungeon: 'Hầm ngục sau',

// zh-CN
encounters: '敌人与头目',
entrances: '入口（{{count}} 个）',
notableDrops: '重点掉落',
backToList: '返回地下城列表',
notFound: '未找到地下城 {{id}}。',
viewOnMap: '在完整地图中查看',
prevDungeon: '上一个地下城',
nextDungeon: '下一个地下城',

// zh-TW
encounters: '敵人與頭目',
entrances: '入口（{{count}} 個）',
notableDrops: '重點掉落',
backToList: '返回地下城列表',
notFound: '未找到地下城 {{id}}。',
viewOnMap: '在完整地圖中檢視',
prevDungeon: '上一個地下城',
nextDungeon: '下一個地下城',
```

**Caution:** this file contains CJK text — per the repo's known NFC-normalization trap, do not regex-rewrite the whole file; append keys with targeted `Edit` calls per locale block.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && pnpm --filter palworld exec tsc -b`
Expected: clean — the typed `Record<Language, DungeonStrings>` fails to compile if any locale misses a key.

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/palworld/src/dungeonStrings.ts
git commit --no-gpg-sign -m "feat(palworld): dungeon detail/list page strings (17 locales)"
```

---

### Task 3: Extract shared loot renderers to `features/dungeons/components.tsx`

**Files:**
- Create: `frontend/apps/palworld/src/features/dungeons/components.tsx`
- Modify: `frontend/apps/palworld/src/features/dungeons/DungeonsPage.tsx`

- [ ] **Step 1: Create `components.tsx`**

Move (verbatim, plus `export`) `Bundles`, `TIER_KEY`, `LOTUS_STAT`, `gradeBadgeClass`, `ChanceBadge`, `LotteryTable`, `PalPool`, `RewardEntryRow` from `DungeonsPage.tsx` into `frontend/apps/palworld/src/features/dungeons/components.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { ItemsBundle } from '../../lib/catalog'
import type { PalsBundle } from '../../lib/pals'
import {
  itemChance,
  entryShare,
  formatChance,
  type DungeonsBundle,
  type LotterySlot,
  type RewardEntry,
  type RewardTier,
} from '../../lib/dungeons'
import { ItemLink, PalLink } from '../catalog/components'

export interface Bundles {
  dungeons: DungeonsBundle
  items: ItemsBundle
  pals: PalsBundle
}

/** Reward tiers → display label key (Easy01/Medium01/Hard01/Hard03). */
export const TIER_KEY: Record<string, 'easy' | 'medium' | 'hard' | 'bonus'> = {
  Easy01: 'easy', Medium01: 'medium', Hard01: 'hard', Hard02: 'hard', Hard03: 'bonus',
}

/** PickupItem_Lotus_<Stat>_NN → lotusStat label key. */
const LOTUS_STAT: Record<string, 'workspeed' | 'attack' | 'hp' | 'stamina' | 'weight'> = {
  Workspeed: 'workspeed', Attack: 'attack', HP: 'hp', Stamina: 'stamina', Weight: 'weight',
}

/** Chest-tier badge colors, loosely following the game's chest materials
 *  (wood → copper → silver → gold for the locked blueprint chests). */
export function gradeBadgeClass(grade: number): string {
  if (grade >= 6) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  if (grade >= 4) return 'bg-slate-400/20 text-slate-600 dark:text-slate-300'
  if (grade >= 3) return 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
  return 'bg-secondary text-muted-foreground'
}

export function ChanceBadge({ pct }: { pct: number }) {
  return (
    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-primary">
      {formatChance(pct)}%
    </span>
  )
}
```

…then `LotteryTable`, `PalPool`, and `RewardEntryRow` exactly as they are in `DungeonsPage.tsx` today (lines 60–196), each with `export` added. No behavior changes.

- [ ] **Step 2: Point `DungeonsPage.tsx` at the new module**

Delete the moved declarations from `DungeonsPage.tsx` and replace the corresponding imports with:

```tsx
import { LotteryTable, RewardEntryRow, TIER_KEY, type Bundles } from './components'
```

(`DungeonsPage` keeps only `DungeonCard` + the default export; the `itemChance`/`entryShare`/`formatChance`/`ItemLink` imports move out with the components — keep whatever `DungeonCard` still references: `Fish`, `Skull`, `Swords`, `CatalogSection`, `PalLink`, loaders, types.)

- [ ] **Step 3: Verify build + lint**

Run: `cd frontend && pnpm --filter palworld exec tsc -b && pnpm lint:palworld`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/palworld/src/features/dungeons/components.tsx frontend/apps/palworld/src/features/dungeons/DungeonsPage.tsx
git commit --no-gpg-sign -m "refactor(palworld): extract dungeon loot renderers to components.tsx"
```

---

### Task 4: `DungeonEntranceMap` widget

**Files:**
- Create: `frontend/apps/palworld/src/features/dungeons/DungeonEntranceMap.tsx`

- [ ] **Step 1: Create the widget**

```tsx
import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Tooltip } from 'react-leaflet'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
// Importing the map-engine barrel also registers the smooth wheel-zoom handler.
import { GameMapTiles, createPinIcon, dataToLatLng } from '@gamemap/map-engine'
import { palworldAssets } from '../../lib/assets'
import { loadStatic, loadMarkers, type MapMeta } from '../../lib/data'
import { CatalogSection } from '../catalog/components'

/** Every dungeon portal marker lives on MainWorld (157 portals in the dataset,
 *  none on WorldTree). */
const PORTAL_MAP_ID = 'MainWorld'

interface Entrance {
  id: string
  x: number
  y: number
  name?: string
}

interface Loaded {
  map: MapMeta
  icon?: string
  entrances: Entrance[]
}

/**
 * Embedded mini-map of a dungeon's entrance portals, modeled on PalSpawnMap
 * (bare Leaflet + tiles, no engine chrome). Best-effort: hides itself when
 * the marker data fails to load or the dungeon has no portals.
 */
export function DungeonEntranceMap({
  dungeonId,
  dungeonName,
}: {
  dungeonId: string
  /** Prefills the full map's search box (portal markers share the dungeon name). */
  dungeonName: string
}) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const [data, setData] = useState<Loaded | 'error' | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    Promise.all([loadStatic(lng), loadMarkers(PORTAL_MAP_ID, lng)])
      .then(([stat, markerData]) => {
        if (cancelled) return
        const map = stat.maps.find((m) => m.id === PORTAL_MAP_ID)
        if (!map) {
          setData('error')
          return
        }
        setData({
          map,
          icon: stat.types.subtypes.find((s) => s.id === 'dungeon')?.icon,
          entrances: markerData.markers
            .filter((m) => m.dungeonArea === dungeonId)
            .map((m) => ({ id: m.id, x: m.x, y: m.y, name: markerData.l10n[m.id]?.name })),
        })
      })
      .catch(() => {
        if (!cancelled) setData('error')
      })
    return () => {
      cancelled = true
    }
  }, [lng, dungeonId])

  // Full map extent — open zoomed out so the portal spread is visible at once.
  const bounds = useMemo(() => {
    if (!data || data === 'error') return null
    const { map } = data
    return [
      [0, 0],
      [map.tileHeight * map.tilesCountY, map.tileWidth * map.tilesCountX],
    ] as L.LatLngBoundsExpression
  }, [data])

  if (data === 'error' || (data && data.entrances.length === 0)) return null
  if (!data || !bounds) {
    return <div className="h-80 animate-pulse rounded-lg bg-secondary" />
  }

  const pin = createPinIcon(
    data.icon ? palworldAssets.markerIconUrl(data.icon, data.map) : '',
    0.95,
    false,
  )

  return (
    <CatalogSection
      title={t('dungeon.entrances', { count: data.entrances.length })}
      testId="dungeon-entrance-map"
      className="self-start"
    >
      <div className="relative isolate h-72 overflow-hidden rounded-lg border border-border">
        <MapContainer
          key={dungeonId}
          bounds={bounds}
          maxBounds={bounds}
          crs={L.CRS.Simple}
          minZoom={-4}
          maxZoom={2}
          zoomSnap={0}
          zoomDelta={0.25}
          scrollWheelZoom={false}
          smoothWheelZoom={true}
          smoothSensitivity={4}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
        >
          <GameMapTiles selectedMap={data.map} assets={palworldAssets} />
          {data.entrances.map((p) => (
            <Marker key={p.id} position={dataToLatLng(data.map, p.x, p.y)} icon={pin}>
              {p.name ? <Tooltip direction="top">{p.name}</Tooltip> : null}
            </Marker>
          ))}
        </MapContainer>
        <Link
          to="/"
          search={{ map: PORTAL_MAP_ID, q: dungeonName }}
          className="absolute top-2 right-2 z-[500] rounded bg-background/80 px-2 py-1 text-xs hover:bg-background"
          data-testid="dungeon-entrance-open-full"
        >
          {t('dungeon.viewOnMap')}
        </Link>
      </div>
    </CatalogSection>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && pnpm --filter palworld exec tsc -b`
Expected: clean (the widget is not yet referenced; tsc still type-checks it).

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/palworld/src/features/dungeons/DungeonEntranceMap.tsx
git commit --no-gpg-sign -m "feat(palworld): dungeon entrance mini-map widget"
```

---

### Task 5: `DungeonDetailPage` + `/dungeons/$id` route

**Files:**
- Create: `frontend/apps/palworld/src/features/dungeons/DungeonDetailPage.tsx`
- Modify: `frontend/apps/palworld/src/features/catalog/components/ui.tsx` (CatalogNotFound `to` union)
- Modify: `frontend/apps/palworld/src/main.tsx` (add route)
- Modify: `docs/superpowers/specs/2026-07-15-palworld-dungeons-page-remake-design.md` (boss-spotlight deviation)

- [ ] **Step 1: Widen `CatalogNotFound`'s `to` union**

In `ui.tsx`:

```tsx
  to: '/items' | '/buildings' | '/quests' | '/dungeons'
```

- [ ] **Step 2: Create the detail page**

`frontend/apps/palworld/src/features/dungeons/DungeonDetailPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Fish, Skull, Swords } from 'lucide-react'
import { ContentPage } from '../../components/ContentPage'
import { loadItems } from '../../lib/catalog'
import { loadPals } from '../../lib/pals'
import {
  loadDungeons,
  dungeonLevelRange,
  notableDrops,
  type DungeonEntry,
} from '../../lib/dungeons'
import {
  CatalogSection,
  CatalogPageLoading,
  CatalogNotFound,
  CatalogDataProvider,
  ItemLink,
  PalLink,
} from '../catalog/components'
import { LotteryTable, RewardEntryRow, TIER_KEY, type Bundles } from './components'
import { DungeonEntranceMap } from './DungeonEntranceMap'

const NAV_LINK =
  'inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm transition hover:border-primary/60 hover:bg-accent'

/** Difficulty order shared with the list page (ascending EXP bonus, then id). */
function orderDungeons(list: DungeonEntry[]): DungeonEntry[] {
  return [...list].sort((a, c) => a.bonusExpRate - c.bonusExpRate || a.id.localeCompare(c.id))
}

export default function DungeonDetailPage() {
  const { id } = useParams({ from: '/dungeons/$id' })
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [b, setB] = useState<Bundles | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadDungeons(lng), loadItems(lng), loadPals(lng)])
      .then(([dungeons, items, pals]) => {
        if (!cancelled) setB({ dungeons, items, pals })
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  let body: React.ReactNode
  if (loadError) {
    body = <div className="text-center text-destructive">{loadError}</div>
  } else if (!b) {
    body = <CatalogPageLoading />
  } else {
    const d = b.dungeons.byId.get(id)
    if (!d) {
      body = (
        <CatalogNotFound
          message={t('dungeon.notFound', { id })}
          to="/dungeons"
          backLabel={t('dungeon.backToList')}
        />
      )
    } else {
      const name = b.dungeons.text[d.id]?.name ?? d.id
      const range = dungeonLevelRange(d)
      const ordered = orderDungeons(b.dungeons.file.dungeons)
      const idx = ordered.findIndex((x) => x.id === d.id)
      const prev = idx > 0 ? ordered[idx - 1] : null
      const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null
      const notable = notableDrops(b.dungeons.file, d)
      const e = d.enemies ?? {}
      // Row per spawn bucket, boss first. When deeper floors exist (the
      // Terraria-collab dungeon), the base pool reads "Floor 1".
      const enemyRows = [
        { key: 'boss', label: t('dungeon.boss'), icon: Swords, tone: 'text-destructive', list: e.boss },
        { key: 'midBoss', label: t('dungeon.midBoss'), icon: Swords, tone: 'text-muted-foreground', list: e.midBoss },
        {
          key: 'normal',
          label: e.floor2 ? t('dungeon.floor', { n: 1 }) : t('dungeon.enemies'),
          icon: Skull, tone: 'text-muted-foreground', list: e.normal,
        },
        { key: 'floor2', label: t('dungeon.floor', { n: 2 }), icon: Skull, tone: 'text-muted-foreground', list: e.floor2 },
        { key: 'floor3', label: t('dungeon.floor', { n: 3 }), icon: Skull, tone: 'text-muted-foreground', list: e.floor3 },
        { key: 'floor4', label: t('dungeon.floor', { n: 4 }), icon: Skull, tone: 'text-muted-foreground', list: e.floor4 },
        { key: 'fishing', label: t('dungeon.fishing'), icon: Fish, tone: 'text-muted-foreground', list: e.fishing },
      ]
        .map((r) => ({ ...r, list: r.list ?? [] }))
        .filter((r) => r.list.length)
      const normalLot = d.chests?.normal ? b.dungeons.file.lotteries[d.chests.normal] : undefined
      const specialLot = d.chests?.special ? b.dungeons.file.lotteries[d.chests.special] : undefined

      body = (
        <div className="space-y-6">
          <div data-testid="dungeon-header" className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold">{name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{d.id}</span>
                {range ? (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium tabular-nums">
                    Lv. {range.min}–{range.max}
                  </span>
                ) : null}
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                  {t('dungeon.expBonus', { rate: d.bonusExpRate })}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {prev ? (
                <Link
                  to="/dungeons/$id"
                  params={{ id: prev.id }}
                  aria-label={t('dungeon.prevDungeon')}
                  data-testid="dungeon-prev"
                  className={NAV_LINK}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  <span className="max-w-36 truncate">{b.dungeons.text[prev.id]?.name ?? prev.id}</span>
                </Link>
              ) : null}
              {next ? (
                <Link
                  to="/dungeons/$id"
                  params={{ id: next.id }}
                  aria-label={t('dungeon.nextDungeon')}
                  data-testid="dungeon-next"
                  className={NAV_LINK}
                >
                  <span className="max-w-36 truncate">{b.dungeons.text[next.id]?.name ?? next.id}</span>
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              ) : null}
            </div>
          </div>

          {notable.length ? (
            <CatalogSection title={t('dungeon.notableDrops')} testId="dungeon-notable-drops">
              <div className="flex flex-wrap gap-1.5">
                {notable.map((n) => (
                  <ItemLink
                    key={n.item}
                    id={n.item}
                    name={b.items.text[n.item]?.name ?? n.item}
                    icon={b.items.byId.get(n.item)?.icon}
                  />
                ))}
              </div>
            </CatalogSection>
          ) : null}

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            {enemyRows.length ? (
              <CatalogSection title={t('dungeon.encounters')} testId="dungeon-encounters">
                <div className="space-y-3">
                  {enemyRows.map((row) => (
                    <div key={row.key} className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${row.tone}`}>
                        <row.icon className="size-3.5" aria-hidden />
                        {row.label}
                      </span>
                      {row.list.map((en, i) => (
                        <span key={`${en.pal}-${i}`} className="inline-flex items-center gap-1">
                          <PalLink
                            id={en.pal}
                            name={b.pals.text[en.pal]?.name ?? en.pal}
                            icon={b.pals.byId.get(en.pal)?.icon}
                          />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            Lv.{en.lvMin === en.lvMax ? en.lvMin : `${en.lvMin}–${en.lvMax}`}
                          </span>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </CatalogSection>
            ) : null}
            <DungeonEntranceMap dungeonId={d.id} dungeonName={name} />
          </div>

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              {normalLot ? (
                <CatalogSection title={t('dungeon.chestLoot')} testId="dungeon-chest-loot">
                  <LotteryTable slots={normalLot} b={b} />
                </CatalogSection>
              ) : null}
              {specialLot ? (
                <CatalogSection title={t('dungeon.techChest')} testId="dungeon-tech-chest">
                  <LotteryTable slots={specialLot} b={b} />
                </CatalogSection>
              ) : null}
            </div>
            {d.bossRewards.length ? (
              <CatalogSection title={t('dungeon.bossRewards')} testId="dungeon-boss-rewards">
                <div className="space-y-3">
                  {d.bossRewards.map((tier) => (
                    <div key={tier.tier}>
                      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                        {t(`dungeon.tier.${TIER_KEY[tier.tier] ?? 'hard'}`)}
                      </div>
                      <ul className="space-y-1.5">
                        {tier.entries.map((entry, i) => (
                          <RewardEntryRow key={i} tier={tier} entry={entry} b={b} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </CatalogSection>
            ) : null}
          </div>

          <Link to="/dungeons" className="inline-block text-sm text-primary hover:underline">
            {t('dungeon.backToList')}
          </Link>
        </div>
      )
    }
  }

  return (
    <ContentPage active="/dungeons" title={t('dungeon.title')}>
      <CatalogDataProvider items={b?.items} pals={b?.pals}>
        {body}
      </CatalogDataProvider>
    </ContentPage>
  )
}
```

- [ ] **Step 3: Register the route**

In `main.tsx`, after the `dungeonsRoute` declaration add:

```tsx
const dungeonDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dungeons/$id',
  component: DungeonDetailPage,
})
```

with the import `import DungeonDetailPage from './features/dungeons/DungeonDetailPage'` next to the `DungeonsPage` import, and `dungeonDetailRoute` added to `routeTree.addChildren([...])` right after `dungeonsRoute`.

- [ ] **Step 4: Amend the spec's boss-spotlight line**

In `docs/superpowers/specs/2026-07-15-palworld-dungeons-page-remake-design.md`, §3 item 3, replace "**Encounters**: boss spotlight (larger icons + level), then mid-boss / floor pools / fishing as the existing chip rows" with "**Encounters**: enemy-pool chip rows, boss first (boss pools hold up to 30 pals, so spotlight cards would dwarf the page)".

- [ ] **Step 5: Verify + smoke-check in browser**

Run: `cd frontend && pnpm --filter palworld exec tsc -b && pnpm lint:palworld`
Expected: clean.

Probe the dev server (`curl -s -o /dev/null -w "%{http_code}" http://localhost:15174`); if it responds, load `http://localhost:15174/dungeons/Grass001` and check the header, sections, and entrance map render.

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/palworld/src/features/dungeons/DungeonDetailPage.tsx frontend/apps/palworld/src/features/catalog/components/ui.tsx frontend/apps/palworld/src/main.tsx docs/superpowers/specs/2026-07-15-palworld-dungeons-page-remake-design.md
git commit --no-gpg-sign -m "feat(palworld): dungeon detail page at /dungeons/\$id"
```

---

### Task 6: `DungeonListPage` + legacy redirect; delete `DungeonsPage`

**Files:**
- Create: `frontend/apps/palworld/src/features/dungeons/DungeonListPage.tsx`
- Modify: `frontend/apps/palworld/src/main.tsx`
- Delete: `frontend/apps/palworld/src/features/dungeons/DungeonsPage.tsx`

- [ ] **Step 1: Create the list page**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useSearch } from '@tanstack/react-router'
import { ContentPage } from '../../components/ContentPage'
import { loadPals, type PalsBundle } from '../../lib/pals'
import { palIconUrl } from '../../lib/assets'
import { loadDungeons, dungeonLevelRange, type DungeonsBundle } from '../../lib/dungeons'
import { CatalogPageLoading } from '../catalog/components'

interface Bundles {
  dungeons: DungeonsBundle
  pals: PalsBundle
}

/** Boss-pool preview icons per list row. */
const BOSS_PREVIEW_MAX = 3

export default function DungeonListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const { d: legacyId } = useSearch({ from: '/dungeons' })

  const [b, setB] = useState<Bundles | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadDungeons(lng), loadPals(lng)])
      .then(([dungeons, pals]) => {
        if (!cancelled) setB({ dungeons, pals })
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  // Ascending difficulty (the emit order is alphabetical).
  const ordered = useMemo(
    () =>
      b
        ? [...b.dungeons.file.dungeons].sort(
            (a, c) => a.bonusExpRate - c.bonusExpRate || a.id.localeCompare(c.id),
          )
        : [],
    [b],
  )

  // Legacy deep link (/dungeons?d=<id>) → the dungeon's own page.
  if (legacyId) return <Navigate to="/dungeons/$id" params={{ id: legacyId }} replace />

  return (
    <ContentPage active="/dungeons" title={t('dungeon.title')} heading>
      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !b ? (
        <CatalogPageLoading />
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border bg-card">
          {ordered.map((d) => {
            const range = dungeonLevelRange(d)
            const bosses = (d.enemies?.boss ?? []).slice(0, BOSS_PREVIEW_MAX)
            return (
              <li key={d.id}>
                <Link
                  to="/dungeons/$id"
                  params={{ id: d.id }}
                  data-testid="dungeon-row"
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{b.dungeons.text[d.id]?.name ?? d.id}</div>
                    <div className="font-mono text-xs text-muted-foreground">{d.id}</div>
                  </div>
                  {range ? (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      Lv. {range.min}–{range.max}
                    </span>
                  ) : null}
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                    {t('dungeon.expBonus', { rate: d.bonusExpRate })}
                  </span>
                  {bosses.length ? (
                    <span className="hidden shrink-0 -space-x-2 sm:flex">
                      {bosses.map((en, i) => {
                        const icon = b.pals.byId.get(en.pal)?.icon
                        return icon ? (
                          <img
                            key={`${en.pal}-${i}`}
                            src={palIconUrl(icon)}
                            alt={b.pals.text[en.pal]?.name ?? en.pal}
                            loading="lazy"
                            className="size-8 rounded-full border-2 border-card bg-card object-contain"
                          />
                        ) : null
                      })}
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </ContentPage>
  )
}
```

- [ ] **Step 2: Swap the route component and delete the old page**

In `main.tsx`: replace `import DungeonsPage from './features/dungeons/DungeonsPage'` with `import DungeonListPage from './features/dungeons/DungeonListPage'`, and in `dungeonsRoute` set `component: DungeonListPage` (the `validateSearch` for `d` stays). Update the `DungeonsSearch` doc comment to say the param redirects:

```tsx
export interface DungeonsSearch {
  /** Legacy deep link (/dungeons?d=<SpawnAreaId>) — redirects to /dungeons/$id. */
  d?: string
}
```

Then delete `frontend/apps/palworld/src/features/dungeons/DungeonsPage.tsx`.

- [ ] **Step 3: Verify**

Run: `cd frontend && pnpm --filter palworld exec tsc -b && pnpm lint:palworld`
Expected: clean (nothing imports `DungeonsPage` anymore).

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/palworld/src/features/dungeons/DungeonListPage.tsx frontend/apps/palworld/src/main.tsx
git rm frontend/apps/palworld/src/features/dungeons/DungeonsPage.tsx
git commit --no-gpg-sign -m "feat(palworld): list-only /dungeons page with per-dungeon detail links"
```

---

### Task 7: Migrate incoming links to the detail route

**Files:**
- Modify: `frontend/apps/palworld/src/App.tsx` (~line 551, `marker.dungeonArea` popup link)
- Modify: `frontend/apps/palworld/src/features/items/ItemDetailPage.tsx` (~line 216, dungeon chips)

- [ ] **Step 1: Map popup link**

In `App.tsx`, replace:

```tsx
        {marker.dungeonArea ? (
          <Link
            to="/dungeons"
            search={{ d: marker.dungeonArea }}
            data-testid="marker-dungeon-link"
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            {t('dungeon.viewLoot')}
          </Link>
        ) : null}
```

with:

```tsx
        {marker.dungeonArea ? (
          <Link
            to="/dungeons/$id"
            params={{ id: marker.dungeonArea }}
            data-testid="marker-dungeon-link"
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            {t('dungeon.viewLoot')}
          </Link>
        ) : null}
```

- [ ] **Step 2: Item page chips**

In `ItemDetailPage.tsx`, inside the `itemDungeons.map((d) => …)` chip, replace

```tsx
                            to="/dungeons"
                            search={{ d: d.id }}
```

with

```tsx
                            to="/dungeons/$id"
                            params={{ id: d.id }}
```

- [ ] **Step 3: Verify + commit**

Run: `cd frontend && pnpm --filter palworld exec tsc -b && pnpm lint:palworld`
Expected: clean.

```bash
git add frontend/apps/palworld/src/App.tsx frontend/apps/palworld/src/features/items/ItemDetailPage.tsx
git commit --no-gpg-sign -m "feat(palworld): point dungeon links at the detail route"
```

---

### Task 8: e2e coverage

**Files:**
- Create: `frontend/apps/palworld/e2e/dungeons.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test'

// The dungeons feature: a list-only /dungeons page linking to per-dungeon
// detail pages, with legacy ?d= deep links redirecting to the new route.

test('dungeon list shows all dungeons, difficulty-ordered, linking to detail pages', async ({ page }) => {
  await page.goto('/dungeons')
  const rows = page.getByTestId('dungeon-row')
  await expect(rows).toHaveCount(14)
  // Lowest EXP bonus first → Grass001 ("Hillside Cavern").
  await expect(rows.first()).toContainText('Hillside Cavern')
  await rows.first().click()
  await expect(page).toHaveURL(/\/dungeons\/Grass001$/)
})

test('dungeon detail renders header, sections, and the entrance map', async ({ page }) => {
  await page.goto('/dungeons/Grass001')
  await expect(page.getByTestId('dungeon-header')).toContainText('Hillside Cavern')
  await expect(page.getByTestId('dungeon-notable-drops')).toBeVisible()
  await expect(page.getByTestId('dungeon-encounters')).toBeVisible()
  await expect(page.getByTestId('dungeon-chest-loot')).toBeVisible()
  await expect(page.getByTestId('dungeon-boss-rewards')).toBeVisible()
  // Entrance mini-map: Grass001 has 4 portals on MainWorld.
  const widget = page.getByTestId('dungeon-entrance-map')
  await expect(widget).toBeVisible()
  await expect(widget.locator('.leaflet-marker-icon')).toHaveCount(4)
  // Prev/next: the easiest dungeon has no prev; next exists.
  await expect(page.getByTestId('dungeon-prev')).toHaveCount(0)
  await page.getByTestId('dungeon-next').click()
  await expect(page).toHaveURL(/\/dungeons\/Island001$/)
})

test('legacy ?d= deep link redirects to the detail page', async ({ page }) => {
  await page.goto('/dungeons?d=Forest001')
  await expect(page).toHaveURL(/\/dungeons\/Forest001/)
  await expect(page.getByTestId('dungeon-header')).toBeVisible()
})

test('item detail dungeon chip navigates to a dungeon detail page', async ({ page }) => {
  await page.goto('/items/PalUpgradeStone')
  const chips = page.getByTestId('item-dungeon-sources').getByRole('link')
  await chips.first().click()
  await expect(page).toHaveURL(/\/dungeons\/[A-Za-z]+\d+$/)
  await expect(page.getByTestId('dungeon-header')).toBeVisible()
})
```

- [ ] **Step 2: Run the spec**

Run: `cd frontend/apps/palworld && pnpm e2e dungeons.spec.ts`
(Playwright starts its own dev server on port 5188.)
Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/palworld/e2e/dungeons.spec.ts
git commit --no-gpg-sign -m "test(palworld): dungeons list/detail e2e coverage"
```

---

### Task 9: Full verification

- [ ] **Step 1: Unit tests** — `cd frontend && pnpm test` → all pass.
- [ ] **Step 2: Build** — `cd frontend && pnpm build:palworld` → clean.
- [ ] **Step 3: Lint** — `cd frontend && pnpm lint:palworld` → clean.
- [ ] **Step 4: Full e2e** — `cd frontend/apps/palworld && pnpm e2e` → only pre-existing known failures (ko-KR smoke, popup max-update-depth warnings) may appear; nothing new.
- [ ] **Step 5:** Fix anything that surfaced, amend/commit as needed.
