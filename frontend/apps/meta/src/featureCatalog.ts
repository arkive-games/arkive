import { GLIMMITH_MAP_PATH, IS_TOY, siteHref, type GameId, type SiteCard } from './sites'

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
 * Portal-authored names and descriptions cover every portal language.
 */
export type FeatureKind = 'tool' | 'map' | 'wiki'

export interface LocalizedText {
  'en-US': string
  'zh-CN': string
  'zh-TW': string
  'ja-JP'?: string
  'ko-KR'?: string
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

const text = (en: string, zhCN: string, zhTW: string, ja: string, ko: string): LocalizedText => ({
  'en-US': en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'ja-JP': ja,
  'ko-KR': ko,
})

/** Editorial selection, independent of the full tool directory. */
export const HOME_TOOL_IDS = new Set([
  'palworld-breeding', 'palworld-stat-simulator', 'gmzz-build',
  'gmzz-score', 'gmzz-league-points', 'gmzz-traintrade-station',
])

export const FEATURES: readonly GameFeature[] = [
  { id: 'glimmith-map', gameId: 'glimmith', kind: 'map', path: GLIMMITH_MAP_PATH, name: text('Interactive Map', '\u4e92\u52a8\u5730\u56fe', '\u4e92\u52d5\u5730\u5716', 'インタラクティブマップ', '인터랙티브 지도') },
  { id: 'oss-map', gameId: 'oss', kind: 'map', path: '/', name: text('Interactive Map', '互动地图', '互動地圖', 'インタラクティブマップ', '인터랙티브 지도') },
  // Palworld
  { id: 'palworld-map', gameId: 'palworld', kind: 'map', path: '/', name: text('Interactive Map', '互动地图', '互動地圖', 'インタラクティブマップ', '인터랙티브 지도') },
  {
    id: 'palworld-breeding', gameId: 'palworld', kind: 'tool', path: '/breeding',
    name: text('Breeding Calculator', '配种计算器', '配種計算器', '配合計算機', '교배 계산기'),
    description: text('Find every parent pair and the shortest route to a Pal.', '查询任意帕鲁的配种组合与最短路线。', '查詢任意帕魯的配種組合與最短路線。', '目的のパルの親候補と最短の配合ルートを調べられます。', '원하는 팰의 부모 조합과 최단 교배 경로를 찾으세요.'),
    keywords: ['breed', '配种', '配種', '孵化'],
  },
  {
    id: 'palworld-stat-simulator', gameId: 'palworld', kind: 'tool', path: '/stat-simulator',
    name: text('Stat Simulator', '属性模拟器', '屬性模擬器', 'ステータスシミュレーター', '능력치 시뮬레이터'),
    description: text('Work out a Pal\'s final stats from level, IVs, passives and condensing.', '按等级、个体值、被动与浓缩推算帕鲁最终属性。', '按等級、個體值、被動與濃縮推算帕魯最終屬性。', 'レベル・個体値・パッシブスキル・濃縮から最終ステータスを計算します。', '레벨, 개체값, 패시브 스킬과 농축 단계로 팰의 최종 능력치를 계산하세요.'),
    keywords: ['iv', '个体值', '個體值'],
  },
  { id: 'palworld-pals', gameId: 'palworld', kind: 'wiki', path: '/pals', name: text('Paldeck', '帕鲁图鉴', '帕魯圖鑑', 'パル図鑑', '팰 도감'), keywords: ['pal', '帕鲁', '帕魯'] },
  { id: 'palworld-passives', gameId: 'palworld', kind: 'wiki', path: '/passives', name: text('Passive Skills', '被动技能', '被動技能', 'パッシブスキル', '패시브 스킬') },
  { id: 'palworld-active-skills', gameId: 'palworld', kind: 'wiki', path: '/active-skills', name: text('Active Skills', '主动技能', '主動技能', 'アクティブスキル', '액티브 스킬') },
  { id: 'palworld-partner-skills', gameId: 'palworld', kind: 'wiki', path: '/partner-skills', name: text('Partner Skills', '伙伴技能', '夥伴技能', 'パートナースキル', '파트너 스킬') },
  { id: 'palworld-items', gameId: 'palworld', kind: 'wiki', path: '/items', name: text('Items', '道具', '道具', 'アイテム', '아이템') },
  { id: 'palworld-buildings', gameId: 'palworld', kind: 'wiki', path: '/buildings', name: text('Buildings', '建筑', '建築', '建築物', '건축물') },
  { id: 'palworld-merchants', gameId: 'palworld', kind: 'wiki', path: '/merchants', name: text('Merchants', '商人', '商人', '商人', '상인') },
  { id: 'palworld-technology', gameId: 'palworld', kind: 'wiki', path: '/technology', name: text('Technology', '科技', '科技', 'テクノロジー', '기술') },
  { id: 'palworld-research', gameId: 'palworld', kind: 'wiki', path: '/research', name: text('Research', '研究', '研究', '研究', '연구') },
  { id: 'palworld-dungeons', gameId: 'palworld', kind: 'wiki', path: '/dungeons', name: text('Dungeons', '地下城', '地下城', 'ダンジョン', '던전') },
  { id: 'palworld-quests', gameId: 'palworld', kind: 'wiki', path: '/quests', name: text('Quests', '任务', '任務', 'クエスト', '퀘스트') },
  { id: 'palworld-basecamp', gameId: 'palworld', kind: 'wiki', path: '/basecamp', name: text('Base Camp', '据点', '據點', '拠点', '거점') },
  { id: 'palworld-raids', gameId: 'palworld', kind: 'wiki', path: '/raids', name: text('Base Raids', '据点袭击', '據點襲擊', '拠点襲撃', '거점 습격') },
  { id: 'palworld-fishing', gameId: 'palworld', kind: 'wiki', path: '/fishing', name: text('Fishing', '垂钓', '釣魚', '釣り', '낚시') },

  // Lord of Mysteries
  {
    id: 'gmzz-build', gameId: 'gmzz', kind: 'tool', path: '/tools/build',
    name: text('Build Simulator', 'Build 模拟器', 'Build 模擬器', 'ビルドシミュレーター', '빌드 시뮬레이터'),
    description: text('Plan a loadout and import or export game one-click combos.', '搭配技能、秘偶、人脉与封印物，导入导出游戏一键连招。', '搭配技能、秘偶、人脈與封印物，匯入匯出遊戲一鍵連招。', 'スキル構成を組み、ゲーム内のワンクリックコンボを読み込み・書き出しできます。', '스킬 구성을 짜고 게임의 원클릭 콤보를 가져오거나 내보내세요.'),
    keywords: ['build', 'combo', '连招', '連招', '配装', '配裝'],
  },
  {
    id: 'gmzz-score', gameId: 'gmzz', kind: 'tool', path: '/score',
    name: text('Beyonder Rating Calculator', '非凡评分计算器', '非凡評分計算器', '非凡者の評価計算機', '비범자 평점 계산기'),
    description: text('Grade the 14 rating items against the benchmark for your level.', '填入 14 项评分，对照当前等级查看养成进度。', '填入 14 項評分，對照當前等級查看養成進度。', '14項目の評価を現在のレベルの基準と比較できます。', '14개 항목의 점수를 현재 레벨 기준과 비교하세요.'),
    keywords: ['rating', '评分', '評分'],
  },
  {
    id: 'gmzz-league-points', gameId: 'gmzz', kind: 'tool', path: '/tools/league-points',
    name: text('League Points Simulator', '联赛积分推演', '聯賽積分推演', 'リーグポイントシミュレーター', '리그 점수 시뮬레이터'),
    description: text('Enter weekly placements and explore every route to the top four.', '输入每周排名与积分，推演晋级前四的所有路径。', '輸入每週排名與積分，推演晉級前四的所有路徑。', '各週の順位とポイントから、上位4位に進むための条件を確認できます。', '주별 순위와 점수를 입력해 4위 안에 드는 경우의 수를 확인하세요.'),
    keywords: ['league', '联赛', '聯賽', '积分', '積分'],
  },
  {
    id: 'gmzz-traintrade-station', gameId: 'gmzz', kind: 'tool', path: '/tools/traintrade-station',
    name: text('Train Tycoon Station Planner', '铁路大亨站点推演', '鐵路大亨站點推演', '鉄道王の駅推理ツール', '철도왕 역 추리 도구'),
    description: text('Narrow down stations and combinations from each three-station hint.', '根据每次三站提示推演站点概率与组合。', '根據每次三站提示推演站點機率與組合。', '3駅ずつのヒントから候補の駅と組み合わせを絞り込めます。', '역 세 곳에 대한 단서를 바탕으로 가능한 역과 조합을 좁혀 보세요.'),
    keywords: ['train', 'station', '火车', '火車', '站点', '站點'],
  },
  { id: 'gmzz-traintrade', gameId: 'gmzz', kind: 'wiki', path: '/traintrade', name: text('Train Tycoon', '铁路大亨', '鐵路大亨', '鉄道王', '철도왕'), keywords: ['train', '火车', '火車', '货物', '貨物'] },
  { id: 'gmzz-managedtrade', gameId: 'gmzz', kind: 'wiki', path: '/managedtrade', name: text('Trade War', '贸易战', '貿易戰', '交易戦', '무역 전쟁'), keywords: ['trade', 'caravan', '贸易', '貿易', '商队', '商隊', '特产', '特產'] },
  { id: 'gmzz-autochess', gameId: 'gmzz', kind: 'wiki', path: '/autochess', name: text('Fool\'s Gambit', '愚者棋局', '愚者棋局', '愚者の棋局', '광대의 체스'), keywords: ['autochess', 'chess', '自走棋', '棋子', '羁绊', '羈絆'] },
  { id: 'gmzz-fellows', gameId: 'gmzz', kind: 'wiki', path: '/fellows', name: text('Connections', '人脉', '人脈', '人脈', '인맥'), keywords: ['fellows', 'relations', '人脉关系', '人脈關係'] },
  { id: 'gmzz-secretpartners', gameId: 'gmzz', kind: 'wiki', path: '/secretpartners', name: text('Puppets', '秘偶', '秘偶', '操り人形', '꼭두각시'), keywords: ['puppets', 'secretpartner', '技能', '秘偶'] },
  { id: 'gmzz-utopia', gameId: 'gmzz', kind: 'wiki', path: '/utopia', name: text('Utopian Theater', '乌托邦剧场', '烏托邦劇場', 'ユートピア劇場', '유토피아 극장') },
  { id: 'gmzz-reforge', gameId: 'gmzz', kind: 'wiki', path: '/reforge', name: text('Reforge Graces', '重塑恩赐', '重塑恩賜', '再鋳造の恩恵', '재련의 은총') },

  // Ragnarok Online 3 uses canonical paths; legacy query links remain aliases.
  { id: 'ro3-builds', gameId: 'ro3', kind: 'tool', path: '/builds', name: text('Build Handbook', '流派手册', '流派手冊', 'ビルドガイド', '빌드 가이드'), description: text('Create and save character builds.', '编辑并保存角色流派配置。', '編輯並儲存角色流派配置。', 'キャラクタービルドを作成して保存できます。', '캐릭터 빌드를 만들고 저장하세요.'), keywords: ['build', '配装', '配裝'] },
  { id: 'ro3-skills', gameId: 'ro3', kind: 'wiki', path: '/skills', name: text('Class Skills', '职业技能', '職業技能', '職業スキル', '직업 스킬') },
  { id: 'ro3-talents', gameId: 'ro3', kind: 'wiki', path: '/talents', name: text('Talents', '天赋系统', '天賦系統', '才能', '특성') },
  { id: 'ro3-cards', gameId: 'ro3', kind: 'wiki', path: '/cards', name: text('Cards', '卡片图鉴', '卡片圖鑑', 'カード図鑑', '카드 도감') },
  { id: 'ro3-pets', gameId: 'ro3', kind: 'wiki', path: '/pets', name: text('Pets', '宠物图鉴', '寵物圖鑑', 'ペット図鑑', '펫 도감') },
  { id: 'ro3-monsters', gameId: 'ro3', kind: 'wiki', path: '/monsters', name: text('Monsters', '魔物图鉴', '魔物圖鑑', 'モンスター図鑑', '몬스터 도감') },
  { id: 'ro3-equipment', gameId: 'ro3', kind: 'wiki', path: '/equipment', name: text('Equipment', '装备图鉴', '裝備圖鑑', '装備図鑑', '장비 도감') },
  { id: 'ro3-souls', gameId: 'ro3', kind: 'wiki', path: '/souls', name: text('Soul Echoes', '灵魂残响', '靈魂殘響', '魂の残響', '영혼의 잔향') },

  // Phantom Blade Zero
  { id: 'pbz-map', gameId: 'pbz', kind: 'map', path: '/', name: text('Interactive Map', '互动地图', '互動地圖', 'インタラクティブマップ', '인터랙티브 지도') },

  // V Rising
  { id: 'vrising-map', gameId: 'vrising', kind: 'map', path: '/', name: text('Interactive Map', '互动地图', '互動地圖', 'インタラクティブマップ', '인터랙티브 지도') },
  { id: 'vrising-vblood', gameId: 'vrising', kind: 'wiki', path: '/vblood', name: text('V Blood Bosses', 'V 型血首领', 'V 型血首領', 'Vブラッドボス', 'V 블러드 보스'), keywords: ['boss'] },
  { id: 'vrising-database', gameId: 'vrising', kind: 'wiki', path: '/database', name: text('Database', '资料库', '資料庫', 'データベース', '데이터베이스') },
  { id: 'vrising-systems', gameId: 'vrising', kind: 'wiki', path: '/systems', name: text('Powers & Research', '法术与研究', '法術與研究', '魔法と研究', '마법과 연구') },

  // AION 2
  { id: 'aion2-map', gameId: 'aion2', kind: 'map', path: '/', name: text('Interactive Map', '互动地图', '互動地圖', 'インタラクティブマップ', '인터랙티브 지도') },
  { id: 'aion2-quests', gameId: 'aion2', kind: 'wiki', path: '/wiki/quest', name: text('Quests', '任务', '任務', 'クエスト', '퀘스트') },
  { id: 'aion2-npcs', gameId: 'aion2', kind: 'wiki', path: '/wiki/npc', name: text('NPCs', 'NPC', 'NPC', 'NPC一覧', 'NPC 목록') },
  { id: 'aion2-items', gameId: 'aion2', kind: 'wiki', path: '/wiki/item', name: text('Items', '物品', '物品', 'アイテム', '아이템') },
]

/** Standalone tools may not have every translation yet. */
export function localize(value: LocalizedText, language: string): string {
  if (language === 'zh-CN' || language === 'zh-TW' || language === 'ja-JP' || language === 'ko-KR') return value[language] ?? value['en-US']
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
  if (!root || IS_TOY || feature.path === root) return root
  return new URL(feature.path, root.endsWith('/') ? root : `${root}/`).toString()
}

export interface RecentFeature {
  feature: GameFeature
  site: SiteCard
}

/**
 * The pages a visitor opened lately, newest first, from the portal's recent
 * destinations (`feature:<id>` entries; `game:<id>` ones are skipped).
 *
 * An entry is dropped once it is older than `maxAge`, once its feature leaves
 * the catalog, or once its game is no longer listed -- a stored id outlives
 * the page it named, and the row must never offer a dead link.
 */
export function recentFeatures(
  destinations: readonly { id: string; timestamp: number }[],
  sites: readonly SiteCard[],
  { now, maxAge, limit = 4, features = FEATURES }: {
    now: number
    maxAge: number
    limit?: number
    features?: readonly GameFeature[]
  },
): RecentFeature[] {
  const recent: RecentFeature[] = []
  for (const destination of destinations) {
    if (recent.length >= limit) break
    if (!destination.id.startsWith('feature:') || now - destination.timestamp >= maxAge) continue
    const feature = features.find((item) => `feature:${item.id}` === destination.id)
    const site = feature && sites.find((item) => item.id === feature.gameId && siteHref(item))
    if (feature && site) recent.push({ feature, site })
  }
  return recent
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

/**
 * Whether a tool matches the tools page's search box. Only tools are searched:
 * their names and descriptions in every locale, their keywords, and their
 * game's id and localized names -- so "帕鲁" lists every Palworld tool.
 */
export function matchesTool(feature: GameFeature, query: string, gameNames: readonly string[]): boolean {
  const needle = normalize(query)
  if (!needle) return true
  return [
    ...Object.values(feature.name),
    ...Object.values(feature.description ?? {}),
    ...(feature.keywords ?? []),
    feature.gameId,
    ...gameNames,
  ].some((term) => normalize(term).includes(needle))
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '')
}
