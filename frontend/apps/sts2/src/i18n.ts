import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

/**
 * Languages offered in the switcher.
 *
 * These are the languages the game itself ships text for, plus zh-TW — which
 * the game does not ship, so its game data falls back to zh-CN (see
 * `loadBundle`). UI strings exist for en-US / zh-CN / zh-TW; the rest fall back
 * to English chrome around fully localized game text, which is the useful half.
 */
export const LANGUAGES = [
  'en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'de-DE', 'es-ES', 'es-MX',
  'fr-FR', 'it-IT', 'pl-PL', 'pt-BR', 'ru-RU', 'th-TH', 'tr-TR',
] as const
export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'de-DE': 'Deutsch',
  'es-ES': 'Español',
  'es-MX': 'Español (LA)',
  'fr-FR': 'Français',
  'it-IT': 'Italiano',
  'pl-PL': 'Polski',
  'pt-BR': 'Português (BR)',
  'ru-RU': 'Русский',
  'th-TH': 'ไทย',
  'tr-TR': 'Türkçe',
}

const en = {
  siteTitle: 'Slay the Spire 2 Wiki',
  loadError: 'Failed to load data. Please try again later.',
  loading: 'Loading…',
  notFound: 'Not found.',
  themeAuto: 'Auto',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeMenu: 'Theme',
  languageMenu: 'Language',
  nav: { home: 'Home', cards: 'Cards', characters: 'Characters', changelog: 'Changelog' },
  home: {
    tagline: 'Cards and characters, straight from the game files.',
    browseCards: 'Browse all cards',
    dataNote: 'Data extracted from game build {{version}}.',
  },
  card: {
    title: 'Cards',
    count: '{{count}} cards',
    searchPlaceholder: 'Search cards…',
    noResults: 'No cards match these filters.',
    cost: 'Cost',
    costX: 'X',
    unplayable: '—',
    type: 'Type',
    rarity: 'Rarity',
    target: 'Target',
    pool: 'Deck',
    keywords: 'Keywords',
    upgraded: 'Upgraded',
    base: 'Base',
    values: 'Values',
    description: 'Description',
    noArt: 'No art in this build',
    clearFilters: 'Clear filters',
    filters: { pool: 'Deck', type: 'Type', rarity: 'Rarity', cost: 'Cost' },
  },
  character: {
    title: 'Characters',
    count: '{{count}} characters',
    startingHp: 'Starting HP',
    startingGold: 'Starting gold',
    maxEnergy: 'Energy per turn',
    orbSlots: 'Orb slots',
    cardCount: 'Cards',
    unplayable: 'Not playable',
    cardsModifier: 'Card pool',
    viewCards: 'View {{name}} cards',
    stats: 'Stats',
  },
  changelog: {
    title: 'Changelog',
    current: 'Current',
    empty: 'No entries yet.',
    kind: { feature: 'Feature', improvement: 'Improvement', fix: 'Fix', data: 'Data' },
  },
}

type Strings = typeof en

const zhCN: Strings = {
  siteTitle: '杀戮尖塔 2 资料库',
  loadError: '数据加载失败，请稍后重试。',
  loading: '加载中…',
  notFound: '未找到。',
  themeAuto: '自动',
  themeLight: '浅色',
  themeDark: '深色',
  themeMenu: '主题',
  languageMenu: '语言',
  nav: { home: '首页', cards: '卡牌', characters: '角色', changelog: '更新日志' },
  home: {
    tagline: '直接从游戏文件提取的卡牌与角色资料。',
    browseCards: '浏览全部卡牌',
    dataNote: '数据提取自游戏版本 {{version}}。',
  },
  card: {
    title: '卡牌',
    count: '{{count}} 张卡牌',
    searchPlaceholder: '搜索卡牌…',
    noResults: '没有符合条件的卡牌。',
    cost: '费用',
    costX: 'X',
    unplayable: '—',
    type: '类型',
    rarity: '稀有度',
    target: '目标',
    pool: '牌组',
    keywords: '关键字',
    upgraded: '升级后',
    base: '基础',
    values: '数值',
    description: '描述',
    noArt: '此版本暂无卡图',
    clearFilters: '清除筛选',
    filters: { pool: '牌组', type: '类型', rarity: '稀有度', cost: '费用' },
  },
  character: {
    title: '角色',
    count: '{{count}} 个角色',
    startingHp: '初始生命',
    startingGold: '初始金币',
    maxEnergy: '每回合能量',
    orbSlots: '充能球槽位',
    cardCount: '卡牌数',
    unplayable: '不可游玩',
    cardsModifier: '卡池',
    viewCards: '查看{{name}}的卡牌',
    stats: '属性',
  },
  changelog: {
    title: '更新日志',
    current: '当前版本',
    empty: '暂无记录。',
    kind: { feature: '新功能', improvement: '改进', fix: '修复', data: '数据' },
  },
}

const zhTW: Strings = {
  ...zhCN,
  siteTitle: '殺戮尖塔 2 資料庫',
  loadError: '資料載入失敗，請稍後再試。',
  loading: '載入中…',
  notFound: '找不到。',
  themeAuto: '自動',
  themeLight: '淺色',
  themeDark: '深色',
  themeMenu: '主題',
  languageMenu: '語言',
  nav: { home: '首頁', cards: '卡牌', characters: '角色', changelog: '更新日誌' },
  home: {
    tagline: '直接從遊戲檔案擷取的卡牌與角色資料。',
    browseCards: '瀏覽全部卡牌',
    dataNote: '資料擷取自遊戲版本 {{version}}。',
  },
  card: {
    ...zhCN.card,
    title: '卡牌',
    count: '{{count}} 張卡牌',
    searchPlaceholder: '搜尋卡牌…',
    noResults: '沒有符合條件的卡牌。',
    rarity: '稀有度',
    pool: '牌組',
    keywords: '關鍵字',
    upgraded: '升級後',
    base: '基礎',
    values: '數值',
    description: '描述',
    noArt: '此版本暫無卡圖',
    clearFilters: '清除篩選',
    filters: { pool: '牌組', type: '類型', rarity: '稀有度', cost: '費用' },
  },
  character: {
    ...zhCN.character,
    startingHp: '初始生命',
    startingGold: '初始金幣',
    maxEnergy: '每回合能量',
    orbSlots: '充能球槽位',
    cardCount: '卡牌數',
    unplayable: '不可遊玩',
    cardsModifier: '卡池',
    viewCards: '檢視{{name}}的卡牌',
    stats: '屬性',
  },
  changelog: {
    title: '更新日誌',
    current: '目前版本',
    empty: '暫無紀錄。',
    kind: { feature: '新功能', improvement: '改進', fix: '修復', data: '資料' },
  },
}

const UI: Partial<Record<Language, Strings>> = { 'en-US': en, 'zh-CN': zhCN, 'zh-TW': zhTW }

void i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: Object.fromEntries(
    LANGUAGES.map((lng) => [lng, { translation: UI[lng] ?? en }]),
  ),
  supportedLngs: [...LANGUAGES],
  fallbackLng: 'en-US',
  interpolation: { escapeValue: false },
})

export default i18n
