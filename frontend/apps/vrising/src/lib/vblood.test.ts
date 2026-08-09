import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadVBloodBosses, readCompletedVBlood, rewardDisplayName } from './vblood'

const markerPayload = {
  markers: [
    {
      id: 'wolf-a', subtype: 'boss-fixed', x: 1, y: 2, indexInSubtype: 0,
      bossPrefab: 'CHAR_Forest_Wolf_VBlood', bossLevel: 16, bossAct: 'ActI',
      bossRegion: 'Farbane', movement: 'fixed' as const, images: ['bosses/wolf.webp'],
    },
    {
      id: 'wolf-b', subtype: 'boss-fixed', x: 3, y: 4, indexInSubtype: 1,
      bossPrefab: 'CHAR_Forest_Wolf_VBlood', bossLevel: 16, bossAct: 'ActI',
      bossRegion: 'Farbane', movement: 'fixed' as const, images: ['bosses/wolf.webp'],
    },
  ],
  l10n: { 'wolf-a': { name: 'Alpha Wolf' }, 'wolf-b': { name: 'Alpha Wolf' } },
}

// Back localStorage with a Map, matching palworld's completedMarkers.test.ts.
// The jsdom docblock this file used to carry does not supply one: Node ships its
// own `localStorage` global that is `undefined` without --localstorage-file, and
// it shadows jsdom's, so the bare global was undefined either way.
const store = new Map<string, string>()

describe('V Blood catalog', () => {
  beforeEach(() => {
    store.clear()
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size },
    } as Storage
    vi.restoreAllMocks()
  })

  it('groups multiple map markers by boss prefab', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/locales/') ? markerPayload.l10n : { markers: markerPayload.markers },
    })))
    const bosses = await loadVBloodBosses('en-US')
    expect(bosses).toHaveLength(1)
    expect(bosses[0]).toMatchObject({ id: 'CHAR_Forest_Wolf_VBlood', name: 'Alpha Wolf', level: 16 })
    expect(bosses[0].locations).toHaveLength(2)
  })

  it('ignores malformed completion storage', () => {
    localStorage.setItem('vrising.vblood.completed', '{bad')
    expect(readCompletedVBlood()).toEqual(new Set())
  })

  it('turns verified prefab identifiers into readable labels', () => {
    expect(rewardDisplayName('Recipe_Weapon_GreatSword_T08_Sanguine'))
      .toBe('Weapon Great Sword T08 Sanguine')
    expect(rewardDisplayName('AB_Shapeshift_Wolf_Group'))
      .toBe('Shapeshift Wolf Group')
  })
})
