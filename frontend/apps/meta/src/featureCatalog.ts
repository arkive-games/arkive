import { IS_TOY, siteHref, type GameId, type SiteCard } from './sites'

/**
 * Every page a visitor can land on inside a game site, as the portal lists it.
 *
 * The homepage draws its game cards' module lines and its tool shelf from this
 * list, and the search box indexes it -- so a visitor can type "breeding" and
 * land on the Palworld calculator without first knowing which game owns it.
 *
 * Each `path` is checked against that app's `edgeone.json` by
 * featureCatalog.test.ts: a page renamed or removed in its game without this
 * list following would otherwise ship as a homepage link that 404s on arrival.
 *
 * Names cover the three locales every changelog carries; Japanese and Korean
 * fall back to English, as game-sourced text does elsewhere on the portal.
 */
export type FeatureKind = 'tool' | 'map' | 'wiki'

export interface LocalizedText {
  'en-US': string
  'zh-CN': string
  'zh-TW': string
}

export interface GameFeature {
  /** Unique across the catalog; also the React key. */
  id: string
  gameId: GameId
  kind: FeatureKind
  /** Path, plus query where the app routes on one, relative to the game's site root. */
  path: string
  name: LocalizedText
  /** Only tools carry one: it is the second line of a tool card. */
  description?: LocalizedText
  /** Extra search terms that are not in any display name. */
  keywords?: readonly string[]
}

const text = (en: string, zhCN: string, zhTW: string): LocalizedText => ({
  'en-US': en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
})

export const FEATURES: readonly GameFeature[] = [
  // Palworld
  { id: 'palworld-map', gameId: 'palworld', kind: 'map', path: '/', name: text('Interactive Map', '互动地图', '互動地圖') },
  {
    id: 'palworld-breeding', gameId: 'palworld', kind: 'tool', path: '/breeding',
    name: text('Breeding Calculator', '配种计算器', '配種計算器'),
    description: text('Find every parent pair and the shortest route to a Pal.', '查询任意帕鲁的配种组合与最短路线。', '查詢任意帕魯的配種組合與最短路線。'),
    keywords: ['breed', '配种', '配種', '孵化'],
  },
  {
    id: 'palworld-stat-simulator', gameId: 'palworld', kind: 'tool', path: '/stat-simulator',
    name: text('Stat Simulator', '属性模拟器', '屬性模擬器'),
    description: text('Work out a Pal\'s final stats from level, IVs, passives and condensing.', '按等级、个体值、被动与浓缩推算帕鲁最终属性。', '按等級、個體值、被動與濃縮推算帕魯最終屬性。'),
    keywords: ['iv', '个体值', '個體值'],
  },
  { id: 'palworld-pals', gameId: 'palworld', kind: 'wiki', path: '/pals', name: text('Paldeck', '帕鲁图鉴', '帕魯圖鑑'), keywords: ['pal', '帕鲁', '帕魯'] },
  { id: 'palworld-passives', gameId: 'palworld', kind: 'wiki', path: '/passives', name: text('Passive Skills', '被动技能', '被動技能') },
  { id: 'palworld-active-skills', gameId: 'palworld', kind: 'wiki', path: '/active-skills', name: text('Active Skills', '主动技能', '主動技能') },
  { id: 'palworld-partner-skills', gameId: 'palworld', kind: 'wiki', path: '/partner-skills', name: text('Partner Skills', '伙伴技能', '夥伴技能') },
  { id: 'palworld-items', gameId: 'palworld', kind: 'wiki', path: '/items', name: text('Items', '道具', '道具') },
  { id: 'palworld-buildings', gameId: 'palworld', kind: 'wiki', path: '/buildings', name: text('Buildings', '建筑', '建築') },
  { id: 'palworld-merchants', gameId: 'palworld', kind: 'wiki', path: '/merchants', name: text('Merchants', '商人', '商人') },
  { id: 'palworld-technology', gameId: 'palworld', kind: 'wiki', path: '/technology', name: text('Technology', '科技', '科技') },
  { id: 'palworld-research', gameId: 'palworld', kind: 'wiki', path: '/research', name: text('Research', '研究', '研究') },
  { id: 'palworld-dungeons', gameId: 'palworld', kind: 'wiki', path: '/dungeons', name: text('Dungeons', '地下城', '地下城') },
  { id: 'palworld-quests', gameId: 'palworld', kind: 'wiki', path: '/quests', name: text('Quests', '任务', '任務') },
  { id: 'palworld-basecamp', gameId: 'palworld', kind: 'wiki', path: '/basecamp', name: text('Base Camp', '据点', '據點') },
  { id: 'palworld-raids', gameId: 'palworld', kind: 'wiki', path: '/raids', name: text('Base Raids', '据点袭击', '據點襲擊') },
  { id: 'palworld-fishing', gameId: 'palworld', kind: 'wiki', path: '/fishing', name: text('Fishing', '垂钓', '釣魚') },

  // Lord of Mysteries
  {
    id: 'gmzz-score', gameId: 'gmzz', kind: 'tool', path: '/score',
    name: text('Beyonder Rating Calculator', '非凡评分计算器', '非凡評分計算器'),
    description: text('Grade the 14 rating items against the benchmark for your level.', '填入 14 项评分，对照当前等级查看养成进度。', '填入 14 項評分，對照當前等級查看養成進度。'),
    keywords: ['rating', '评分', '評分'],
  },
  {
    id: 'gmzz-league-points', gameId: 'gmzz', kind: 'tool', path: '/tools/league-points',
    name: text('League Points Simulator', '联赛积分推演', '聯賽積分推演'),
    description: text('Enter weekly placements and explore every route to the top four.', '输入每周排名与积分，推演晋级前四的所有路径。', '輸入每週排名與積分，推演晉級前四的所有路徑。'),
    keywords: ['league', '联赛', '聯賽', '积分', '積分'],
  },
  {
    id: 'gmzz-traintrade-station', gameId: 'gmzz', kind: 'tool', path: '/tools/traintrade-station',
    name: text('Train Tycoon Station Planner', '铁路大亨站点推演', '鐵路大亨站點推演'),
    description: text('Narrow down stations and combinations from each three-station hint.', '根据每次三站提示推演站点概率与组合。', '根據每次三站提示推演站點機率與組合。'),
    keywords: ['train', 'station', '火车', '火車', '站点', '站點'],
  },
  { id: 'gmzz-traintrade', gameId: 'gmzz', kind: 'wiki', path: '/traintrade', name: text('Train Tycoon', '铁路大亨', '鐵路大亨'), keywords: ['train', '火车', '火車', '货物', '貨物'] },
  { id: 'gmzz-utopia', gameId: 'gmzz', kind: 'wiki', path: '/utopia', name: text('Utopian Theater', '乌托邦剧场', '烏托邦劇場') },
  { id: 'gmzz-reforge', gameId: 'gmzz', kind: 'wiki', path: '/reforge', name: text('Reforge Graces', '重塑恩赐', '重塑恩賜') },

  // Ragnarok Online 3 -- the app routes on `?view=` / `?wiki=`, and a bare
  // root is its class-skills view.
  { id: 'ro3-builds', gameId: 'ro3', kind: 'wiki', path: '/?view=builds', name: text('Build Handbook', '流派手册', '流派手冊'), keywords: ['build', '配装', '配裝'] },
  { id: 'ro3-skills', gameId: 'ro3', kind: 'wiki', path: '/', name: text('Class Skills', '职业技能', '職業技能') },
  { id: 'ro3-talents', gameId: 'ro3', kind: 'wiki', path: '/?view=wiki&wiki=talents', name: text('Talents', '天赋系统', '天賦系統') },
  { id: 'ro3-cards', gameId: 'ro3', kind: 'wiki', path: '/?view=wiki&wiki=cards', name: text('Cards', '卡片图鉴', '卡片圖鑑') },
  { id: 'ro3-pets', gameId: 'ro3', kind: 'wiki', path: '/?view=wiki&wiki=pets', name: text('Pets', '宠物图鉴', '寵物圖鑑') },
  { id: 'ro3-monsters', gameId: 'ro3', kind: 'wiki', path: '/?view=wiki&wiki=monsters', name: text('Monsters', '魔物图鉴', '魔物圖鑑') },
  { id: 'ro3-equipment', gameId: 'ro3', kind: 'wiki', path: '/?view=wiki&wiki=equipment', name: text('Equipment', '装备图鉴', '裝備圖鑑') },
  { id: 'ro3-souls', gameId: 'ro3', kind: 'wiki', path: '/?view=wiki&wiki=souls', name: text('Soul Echoes', '灵魂残响', '靈魂殘響') },

  // V Rising
  { id: 'vrising-map', gameId: 'vrising', kind: 'map', path: '/', name: text('Interactive Map', '互动地图', '互動地圖') },
  { id: 'vrising-vblood', gameId: 'vrising', kind: 'wiki', path: '/vblood', name: text('V Blood Bosses', 'V 型血首领', 'V 型血首領'), keywords: ['boss'] },
  { id: 'vrising-database', gameId: 'vrising', kind: 'wiki', path: '/database', name: text('Database', '资料库', '資料庫') },
  { id: 'vrising-systems', gameId: 'vrising', kind: 'wiki', path: '/systems', name: text('Powers & Research', '法术与研究', '法術與研究') },

  // AION 2
  { id: 'aion2-map', gameId: 'aion2', kind: 'map', path: '/', name: text('Interactive Map', '互动地图', '互動地圖') },
  { id: 'aion2-quests', gameId: 'aion2', kind: 'wiki', path: '/wiki/quest', name: text('Quests', '任务', '任務') },
  { id: 'aion2-npcs', gameId: 'aion2', kind: 'wiki', path: '/wiki/npc', name: text('NPCs', 'NPC', 'NPC') },
  { id: 'aion2-items', gameId: 'aion2', kind: 'wiki', path: '/wiki/item', name: text('Items', '物品', '物品') },
]

/** The display name in `language`; Japanese and Korean read the English. */
export function localize(value: LocalizedText, language: string): string {
  if (language === 'zh-CN' || language === 'zh-TW') return value[language]
  return value['en-US']
}

export function featuresOf(gameId: string, features: readonly GameFeature[] = FEATURES): GameFeature[] {
  return features.filter((feature) => feature.gameId === gameId)
}

/**
 * The link for a feature, or `undefined` when its game is not open.
 *
 * Inside a Toy bundle every game is a hash-routed copy under `/toy/<slug>/`,
 * whose deep links this list does not model, so a feature there opens its
 * game's front page instead of guessing at a route.
 */
export function featureHref(feature: GameFeature, site: SiteCard | undefined): string | undefined {
  if (!site) return undefined
  const root = siteHref(site)
  if (!root || IS_TOY) return root
  return new URL(feature.path, root.endsWith('/') ? root : `${root}/`).toString()
}

export type SearchHit =
  | { type: 'game'; site: SiteCard }
  | { type: 'feature'; feature: GameFeature; site: SiteCard }

/**
 * Games and features whose names match `query`, games first.
 *
 * Matching is a case-insensitive substring over every locale's name at once,
 * so a visitor reading the English UI who types 配种 still finds it. A
 * feature also matches on its game's name, so "帕鲁" lists what Palworld has.
 * `gameNames` carries each game's localized names, which live in i18n rather
 * than here.
 */
export function searchCatalog(
  query: string,
  sites: readonly SiteCard[],
  gameNames: (site: SiteCard) => readonly string[],
  features: readonly GameFeature[] = FEATURES,
): SearchHit[] {
  const needle = normalize(query)
  if (!needle) return []

  const matches = (terms: readonly string[]) => terms.some((term) => normalize(term).includes(needle))
  const open = sites.filter((site) => siteHref(site))

  const games: SearchHit[] = open
    .filter((site) => matches([site.id, ...gameNames(site)]))
    .map((site) => ({ type: 'game', site }))

  const hits: SearchHit[] = []
  for (const feature of features) {
    const site = open.find((item) => item.id === feature.gameId)
    if (!site) continue
    const own = [...Object.values(feature.name), ...(feature.keywords ?? [])]
    if (matches(own) || matches([site.id, ...gameNames(site)])) hits.push({ type: 'feature', feature, site })
  }

  // A feature matched on its own name outranks one listed only because its
  // game matched; tools lead within each band, as on the homepage.
  const rank = (hit: SearchHit) => {
    if (hit.type !== 'feature') return 0
    const own = matches([...Object.values(hit.feature.name), ...(hit.feature.keywords ?? [])])
    return (own ? 0 : 2) + (hit.feature.kind === 'tool' ? 0 : 1)
  }
  return [...games, ...hits.map((hit, index) => ({ hit, index }))
    .sort((left, right) => rank(left.hit) - rank(right.hit) || left.index - right.index)
    .map(({ hit }) => hit)]
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '')
}
