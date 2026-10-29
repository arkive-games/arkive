import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { createLanguagePreference, detectLanguagePreference } from '@gamemap/state-memory'
import { bindArkiveDocumentLocale } from '@gamemap/map-shell'

/**
 * Languages offered in the switcher: the three the site's own strings exist
 * for. The game ships many more (its Localization/Game holds sixteen), and
 * they belong here once game data is published and has text to show in them.
 */
export const LANGUAGES = ['en-US', 'zh-CN', 'zh-TW'] as const
export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
}

const en = {
  siteTitle: 'Phantom Blade Zero Wiki',
  brand: 'Arkive.games',
  brandSlogan: 'Sail Games With Us.',
  brandHome: 'Arkive guide home',
  login: 'Log in',
  more: 'More',
  back: 'Back',
  loading: 'Loading…',
  loadError: 'Failed to load data. Please try again later.',
  themeAuto: 'Auto',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeMenu: 'Theme',
  languageMenu: 'Language',
  nav: { map: 'Map', changelog: 'Changelog' },
  siteInfo: {
    tab: 'About',
    aboutTitle: 'About this site',
    arkiveName: 'Arkive',
    gameName: 'Phantom Blade Zero',
    introTemplate: 'This unofficial {game} interactive database is built and maintained by {arkive}. All game data is extracted from the game files, and the site will always remain free to use.',
    disclaimerTemplate: 'This site is not affiliated with, authorized, or endorsed by {developer}. All rights to {game} and related game content belong to {developer}.',
    versionTitle: 'Version updates',
    viewVersionTemplate: 'View version {version}',
    feedbackTitle: 'Community and feedback',
    feedbackHint: 'Use the feedback QQ group below to suggest improvements or report problems.',
    feedbackGroupLabel: 'Feedback QQ group',
    copy: 'Copy',
    copied: 'Copied',
    close: 'Close',
  },
  map: {
    title: 'Phantom Blade Zero Interactive Map',
    search: 'Search', filter: 'Filters', showAll: 'Show all', hideAll: 'Hide all', showLabels: 'Always show labels',
    collapse: 'Collapse', expand: 'Expand', resultsCount: '{{count}} results', unnamed: 'Unnamed', noDescription: 'No description.',
    position: 'Position', copyPosition: 'Copy position', copied: 'Copied', copyFailed: 'Copy failed',
    noMapSelected: 'No map selected.', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
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
  siteTitle: '影之刃零攻略站',
  brand: '藏舟游戏攻略网',
  brandSlogan: '万千攻略，藏于一舟',
  brandHome: '藏舟攻略首页',
  login: '登录',
  more: '更多',
  back: '返回',
  loading: '加载中…',
  loadError: '数据加载失败，请稍后重试。',
  themeAuto: '跟随系统',
  themeLight: '浅色模式',
  themeDark: '深色模式',
  themeMenu: '主题',
  languageMenu: '语言',
  nav: { map: '地图', changelog: '更新日志' },
  siteInfo: {
    tab: '关于',
    aboutTitle: '关于本站',
    arkiveName: '藏舟攻略网',
    gameName: '影之刃零',
    introTemplate: '本站是由{arkive}搭建与维护的{game}非官方互动资料库，游戏数据均从游戏文件中提取，永久免费开放。',
    disclaimerTemplate: '本站与{developer}无隶属关系，也未获其授权或背书。{game}及相关游戏内容的一切权利均归{developer}所有。',
    versionTitle: '版本更新记录',
    viewVersionTemplate: '查看版本 {version}',
    feedbackTitle: '交流与反馈',
    feedbackHint: '欢迎通过下方反馈 QQ 群提出建议、反馈问题或报告错误。',
    feedbackGroupLabel: '反馈 QQ 群',
    copy: '复制',
    copied: '已复制',
    close: '关闭',
  },
  map: {
    title: '影之刃零互动地图',
    search: '搜索', filter: '筛选', showAll: '全部显示', hideAll: '全部隐藏', showLabels: '始终显示名称',
    collapse: '收起', expand: '展开', resultsCount: '{{count}} 个结果', unnamed: '未命名', noDescription: '暂无描述。',
    position: '坐标', copyPosition: '复制坐标', copied: '已复制', copyFailed: '复制失败',
    noMapSelected: '未选择地图。', zoomIn: '放大', zoomOut: '缩小',
  },
  changelog: {
    title: '更新日志',
    current: '当前版本',
    empty: '暂无记录。',
    kind: { feature: '新功能', improvement: '改进', fix: '修复', data: '数据' },
  },
}

const zhTW: Strings = {
  siteTitle: '影之刃零攻略站',
  brand: '藏舟遊戲攻略網',
  brandSlogan: '萬千攻略，藏於一舟',
  brandHome: '藏舟攻略首頁',
  login: '登入',
  more: '更多',
  back: '返回',
  loading: '載入中…',
  loadError: '資料載入失敗，請稍後再試。',
  themeAuto: '跟隨系統',
  themeLight: '淺色模式',
  themeDark: '深色模式',
  themeMenu: '主題',
  languageMenu: '語言',
  nav: { map: '地圖', changelog: '更新日誌' },
  siteInfo: {
    tab: '關於',
    aboutTitle: '關於本站',
    arkiveName: '藏舟攻略網',
    gameName: '影之刃零',
    introTemplate: '本站是由{arkive}搭建與維護的{game}非官方互動資料庫，遊戲資料均從遊戲檔案中擷取，永久免費開放。',
    disclaimerTemplate: '本站與{developer}無隸屬關係，也未獲其授權或背書。{game}及相關遊戲內容的一切權利均歸{developer}所有。',
    versionTitle: '版本更新記錄',
    viewVersionTemplate: '查看版本 {version}',
    feedbackTitle: '交流與回饋',
    feedbackHint: '歡迎透過下方回饋 QQ 群提出建議、回報問題或提交錯誤。',
    feedbackGroupLabel: '回饋 QQ 群',
    copy: '複製',
    copied: '已複製',
    close: '關閉',
  },
  map: {
    title: '影之刃零互動地圖',
    search: '搜尋', filter: '篩選', showAll: '全部顯示', hideAll: '全部隱藏', showLabels: '始終顯示名稱',
    collapse: '收合', expand: '展開', resultsCount: '{{count}} 個結果', unnamed: '未命名', noDescription: '暫無描述。',
    position: '座標', copyPosition: '複製座標', copied: '已複製', copyFailed: '複製失敗',
    noMapSelected: '未選擇地圖。', zoomIn: '放大', zoomOut: '縮小',
  },
  changelog: {
    title: '更新日誌',
    current: '目前版本',
    empty: '暫無紀錄。',
    kind: { feature: '新功能', improvement: '改進', fix: '修復', data: '資料' },
  },
}

const UI: Record<Language, Strings> = { 'en-US': en, 'zh-CN': zhCN, 'zh-TW': zhTW }

const languagePreference = createLanguagePreference(LANGUAGES, 'en-US')

/**
 * The top-bar and sheet language switchers.
 *
 * Writes this site's override and, while nothing has ever chosen a shared
 * language, seeds that too -- so a first-time visitor picking a language here
 * still sees it on the other Arkive sites, while a later change stays local.
 * The settings panel writes the layers explicitly instead.
 */
export function changeLanguagePreference(code: string) {
  languagePreference.setFromSiteControl(code as Language)
  return i18n.changeLanguage(code)
}

/** Switches the displayed language without writing a preference. */
export function applyLanguage(code: string) {
  return i18n.changeLanguage(code)
}

void i18n.use(initReactI18next).init({
  lng: detectLanguagePreference(LANGUAGES, 'en-US'),
  resources: Object.fromEntries(
    LANGUAGES.map((lng) => [lng, { translation: UI[lng] }]),
  ),
  supportedLngs: [...LANGUAGES],
  fallbackLng: 'en-US',
  interpolation: { escapeValue: false },
})

bindArkiveDocumentLocale(i18n)

export default i18n
