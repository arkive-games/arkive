import type { Language } from '../../i18n'

// UI chrome for the Pals list-page filters + list (table) view, plus labels for
// the `reaction` (遭遇反応) enum and the `nocturnal` (夜行性) flag. These are NOT
// in the game's L10N tables, so they are hand-authored here. `en-US` is the
// complete baseline; a handful of languages carry full overrides and every other
// language falls back to `en-US` (see `filterStrings`). Kept out of the 17-lang
// `PAL_STRINGS` giant on purpose — this is a small, self-contained surface.

export interface FilterStrings {
  filters: string
  elements: string
  work: string
  reaction: string
  nocturnal: string
  nocturnalOnly: string
  loot: string
  lootPlaceholder: string
  lootEmpty: string
  clear: string
  gridView: string
  listView: string
  noResults: string
  yes: string
  col: {
    no: string
    name: string
    elements: string
    work: string
    nocturnal: string
    reaction: string
    rarity: string
    drops: string
  }
  /** raw `reaction` value -> label. */
  reactions: Record<string, string>
}

const EN: FilterStrings = {
  filters: 'Filters',
  elements: 'Elements',
  work: 'Work',
  reaction: 'Reaction',
  nocturnal: 'Nocturnal',
  nocturnalOnly: 'Nocturnal only',
  loot: 'Drops',
  lootPlaceholder: 'Filter by dropped item…',
  lootEmpty: 'No item found.',
  clear: 'Clear filters',
  gridView: 'Grid',
  listView: 'List',
  noResults: 'No Pals match these filters.',
  yes: 'Yes',
  col: {
    no: 'No.',
    name: 'Pal',
    elements: 'Elements',
    work: 'Work Suitability',
    nocturnal: 'Nocturnal',
    reaction: 'Reaction',
    rarity: 'Rarity',
    drops: 'Drops',
  },
  reactions: {
    Warlike: 'Aggressive',
    Warlike_Anyway: 'Always hostile',
    Warlike_WithoutPlayer: 'Attacks other Pals',
    Kill_All: 'Hunts everything',
    Escape_to_Battle: 'Flees, then fights',
    NotInterested: 'Passive',
    Escape: 'Flees',
    Friendly: 'Friendly',
    Boss: 'Boss',
    None: '—',
  },
}

const OVERRIDES: Partial<Record<Language, FilterStrings>> = {
  'zh-CN': {
    filters: '筛选',
    elements: '属性',
    work: '工作适性',
    reaction: '遭遇反应',
    nocturnal: '夜行性',
    nocturnalOnly: '仅夜行性',
    loot: '掉落物',
    lootPlaceholder: '按掉落物筛选…',
    lootEmpty: '未找到物品。',
    clear: '清除筛选',
    gridView: '网格',
    listView: '列表',
    noResults: '没有符合条件的帕鲁。',
    yes: '是',
    col: {
      no: '编号',
      name: '帕鲁',
      elements: '属性',
      work: '工作适性',
      nocturnal: '夜行性',
      reaction: '遭遇反应',
      rarity: '稀有度',
      drops: '掉落物',
    },
    reactions: {
      Warlike: '好战',
      Warlike_Anyway: '无差别攻击',
      Warlike_WithoutPlayer: '攻击其他帕鲁',
      Kill_All: '猎杀一切',
      Escape_to_Battle: '先逃后战',
      NotInterested: '冷漠',
      Escape: '逃跑',
      Friendly: '友好',
      Boss: '头目',
      None: '—',
    },
  },
  'zh-TW': {
    filters: '篩選',
    elements: '屬性',
    work: '工作適性',
    reaction: '遭遇反應',
    nocturnal: '夜行性',
    nocturnalOnly: '僅夜行性',
    loot: '掉落物',
    lootPlaceholder: '依掉落物篩選…',
    lootEmpty: '找不到物品。',
    clear: '清除篩選',
    gridView: '網格',
    listView: '清單',
    noResults: '沒有符合條件的帕魯。',
    yes: '是',
    col: {
      no: '編號',
      name: '帕魯',
      elements: '屬性',
      work: '工作適性',
      nocturnal: '夜行性',
      reaction: '遭遇反應',
      rarity: '稀有度',
      drops: '掉落物',
    },
    reactions: {
      Warlike: '好戰',
      Warlike_Anyway: '無差別攻擊',
      Warlike_WithoutPlayer: '攻擊其他帕魯',
      Kill_All: '獵殺一切',
      Escape_to_Battle: '先逃後戰',
      NotInterested: '冷漠',
      Escape: '逃跑',
      Friendly: '友好',
      Boss: '頭目',
      None: '—',
    },
  },
  'ja-JP': {
    filters: 'フィルター',
    elements: '属性',
    work: '仕事適性',
    reaction: '遭遇反応',
    nocturnal: '夜行性',
    nocturnalOnly: '夜行性のみ',
    loot: 'ドロップ',
    lootPlaceholder: 'ドロップ品で絞り込み…',
    lootEmpty: 'アイテムが見つかりません。',
    clear: 'クリア',
    gridView: 'グリッド',
    listView: 'リスト',
    noResults: '条件に合うパルがいません。',
    yes: 'はい',
    col: {
      no: 'No.',
      name: 'パル',
      elements: '属性',
      work: '仕事適性',
      nocturnal: '夜行性',
      reaction: '遭遇反応',
      rarity: 'レア度',
      drops: 'ドロップ',
    },
    reactions: {
      Warlike: '好戦的',
      Warlike_Anyway: '無差別に攻撃',
      Warlike_WithoutPlayer: '他のパルを攻撃',
      Kill_All: '皆殺し',
      Escape_to_Battle: '逃走後に反撃',
      NotInterested: '無関心',
      Escape: '逃走',
      Friendly: '友好的',
      Boss: 'ボス',
      None: '—',
    },
  },
  'ko-KR': {
    filters: '필터',
    elements: '속성',
    work: '작업 적성',
    reaction: '조우 반응',
    nocturnal: '야행성',
    nocturnalOnly: '야행성만',
    loot: '드롭',
    lootPlaceholder: '드롭 아이템으로 필터…',
    lootEmpty: '아이템을 찾을 수 없습니다.',
    clear: '필터 지우기',
    gridView: '그리드',
    listView: '목록',
    noResults: '조건에 맞는 팰이 없습니다.',
    yes: '예',
    col: {
      no: '번호',
      name: '팰',
      elements: '속성',
      work: '작업 적성',
      nocturnal: '야행성',
      reaction: '조우 반응',
      rarity: '희귀도',
      drops: '드롭',
    },
    reactions: {
      Warlike: '호전적',
      Warlike_Anyway: '무차별 공격',
      Warlike_WithoutPlayer: '다른 팰 공격',
      Kill_All: '전부 사냥',
      Escape_to_Battle: '도주 후 반격',
      NotInterested: '무관심',
      Escape: '도주',
      Friendly: '우호적',
      Boss: '보스',
      None: '—',
    },
  },
}

/** Filter/list UI strings for a language, falling back to `en-US`. */
export function filterStrings(lng: string): FilterStrings {
  return OVERRIDES[lng as Language] ?? EN
}
