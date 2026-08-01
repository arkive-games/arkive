import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

/**
 * Languages offered in the switcher.
 *
 * Only three, deliberately. V Rising's localization ships as 19 plain-JSON
 * files keyed by bare GUID with no names, so no game text can be joined to the
 * map data yet — every extra language would show English data under a
 * translated switcher label. When the GUID keys are resolved, add languages
 * here and in the pipeline's `data_src/types.yaml` together.
 */
export const LANGUAGES = ['en-US', 'zh-CN', 'zh-TW'] as const
export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
}

const en = {
  title: 'V Rising Interactive Map',
  siteTitle: 'V Rising Map',
  loadError: 'Failed to load data. Please try again later.',
  loading: 'Loading…',
  themeAuto: 'Auto',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeMenu: 'Theme',
  languageMenu: 'Language',
  engineMenu: 'Map renderer',
  collapse: 'Collapse',
  expand: 'Expand',
  filter: 'Filters',
  search: 'Search',
  showAll: 'Show all',
  hideAll: 'Hide all',
  showTooltip: 'Always show labels',
  showRegions: 'Show regions',
  resultsCount: '{{count}} results',
  unnamed: 'Unnamed',
  noDescription: 'No description.',
  scopeName: 'Name',
  scopeAll: 'All fields',
  copyPosition: 'Copy position',
  noMapSelected: 'No map selected.',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  nav: { map: 'Map', changelog: 'Changelog' },
  region: { accessId: 'Access ID', area: 'Area' },
  marker: {
    movement: 'Movement',
    fixed: 'Fixed spawn',
    level: 'Level',
    act: 'Act',
    gameRegion: 'Game region',
    riftCrystal: 'Rift crystal',
    emeryContainer: 'Emery container',
    ironMineCart: 'Iron mine cart',
    silverMineCart: 'Silver mine cart',
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
  title: '夜族崛起互动地图',
  siteTitle: '夜族崛起地图',
  loadError: '数据加载失败，请稍后重试。',
  loading: '加载中…',
  themeAuto: '自动',
  themeLight: '浅色',
  themeDark: '深色',
  themeMenu: '主题',
  languageMenu: '语言',
  engineMenu: '地图渲染器',
  collapse: '收起',
  expand: '展开',
  filter: '筛选',
  search: '搜索',
  showAll: '全部显示',
  hideAll: '全部隐藏',
  showTooltip: '始终显示名称',
  showRegions: '显示区域',
  resultsCount: '{{count}} 个结果',
  unnamed: '未命名',
  noDescription: '暂无描述。',
  scopeName: '名称',
  scopeAll: '全部字段',
  copyPosition: '复制坐标',
  noMapSelected: '未选择地图。',
  zoomIn: '放大',
  zoomOut: '缩小',
  nav: { map: '地图', changelog: '更新日志' },
  region: { accessId: '访问 ID', area: '面积' },
  marker: {
    movement: '移动方式',
    fixed: '固定出生',
    level: '等级',
    act: '章节',
    gameRegion: '游戏区域',
    riftCrystal: '裂隙水晶（冥河碎片）',
    emeryContainer: '金刚砂容器',
    ironMineCart: '铁矿车',
    silverMineCart: '银矿车',
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
  title: '夜族崛起互動地圖',
  siteTitle: '夜族崛起地圖',
  loadError: '資料載入失敗，請稍後再試。',
  loading: '載入中…',
  themeAuto: '自動',
  themeLight: '淺色',
  themeDark: '深色',
  themeMenu: '主題',
  languageMenu: '語言',
  engineMenu: '地圖渲染器',
  collapse: '收起',
  expand: '展開',
  filter: '篩選',
  search: '搜尋',
  showAll: '全部顯示',
  hideAll: '全部隱藏',
  showTooltip: '一律顯示名稱',
  showRegions: '顯示區域',
  resultsCount: '{{count}} 個結果',
  unnamed: '未命名',
  noDescription: '暫無描述。',
  scopeName: '名稱',
  scopeAll: '全部欄位',
  copyPosition: '複製座標',
  noMapSelected: '未選擇地圖。',
  zoomIn: '放大',
  zoomOut: '縮小',
  nav: { map: '地圖', changelog: '更新日誌' },
  region: { accessId: '存取 ID', area: '面積' },
  marker: {
    movement: '移動方式',
    fixed: '固定出生',
    level: '等級',
    act: '章節',
    gameRegion: '遊戲區域',
    riftCrystal: '裂隙水晶（冥河碎片）',
    emeryContainer: '金剛砂容器',
    ironMineCart: '鐵礦車',
    silverMineCart: '銀礦車',
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
