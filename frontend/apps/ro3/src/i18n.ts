import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { createLanguagePreference, detectLanguagePreference } from '@gamemap/state-memory'
import { bindArkiveDocumentLocale } from '@gamemap/map-shell'

/**
 * Languages offered in the switcher.
 *
 * These are the languages Ragnarok Online 3 itself ships text for — the game
 * stores localized assets as per-language bundle variants
 * (`<hash>.bundle.chinesesimplified`, `.english`, `.korean`, `.thai`,
 * `.vietnamese`, `.indonesian`, `.chinesetraditional`). UI strings exist for
 * en-US / zh-CN / zh-TW; the rest fall back to English chrome around fully
 * localized game text, which is the useful half.
 */
export const LANGUAGES = ['en-US', 'zh-CN', 'zh-TW', 'ko-KR', 'th-TH', 'vi-VN', 'id-ID'] as const
export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'ko-KR': '한국어',
  'th-TH': 'ไทย',
  'vi-VN': 'Tiếng Việt',
  'id-ID': 'Bahasa Indonesia',
}

const en = {
  siteTitle: 'Ragnarok Online 3 Wiki',
  brand: 'Arkive.games',
  brandSlogan: 'Sail Games With Us.',
  brandHome: 'Arkive guide home',
  login: 'Log in',
  themeAuto: 'Auto',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeMenu: 'Theme',
  languageMenu: 'Language',
  nav: { home: 'Home', changelog: 'Changelog' },
  home: {
    tagline: 'An interactive database for Ragnarok Online 3.',
    // Stated plainly because it is the honest state of the site: the game's
    // assets are encrypted, so there is no extracted data to show yet.
    comingSoon: 'Data extraction is still in progress — pages will appear here as it lands.',
  },
  changelog: {
    title: 'Version history',
    current: 'Current',
    empty: 'No entries yet.',
    kind: { feature: 'Feature', improvement: 'Improvement', fix: 'Fix', data: 'Data' },
  },
  siteInfo: {
    tab: 'About',
    aboutTitle: 'About this site',
    arkiveName: 'Arkive',
    gameName: 'Ragnarok Online 3',
    introTemplate:
      'This unofficial {game} interactive database is built and maintained by {arkive}. All game data is extracted from the game files, and the site will always remain free to use.',
    disclaimerTemplate:
      'This site is not affiliated with, authorized, or endorsed by {developer}. All rights to {game} and related game content belong to {developer}.',
    versionTitle: 'Version updates',
    viewVersionTemplate: 'View version {version}',
    feedbackTitle: 'Community and feedback',
    feedbackHint:
      'Use the feedback QQ group below to suggest improvements or report problems.',
    feedbackGroupLabel: 'Feedback QQ group',
    copy: 'Copy',
    copied: 'Copied',
    close: 'Close',
  },
}

type Strings = typeof en

const zhCN: Strings = {
  siteTitle: '仙境传说3 资料站',
  brand: 'Arkive.games',
  brandSlogan: '与我们一起遨游游戏世界。',
  brandHome: 'Arkive 攻略主站',
  login: '登录',
  themeAuto: '自动',
  themeLight: '浅色',
  themeDark: '深色',
  themeMenu: '主题',
  languageMenu: '语言',
  nav: { home: '首页', changelog: '更新日志' },
  home: {
    tagline: '《仙境传说3》互动资料库。',
    comingSoon: '数据提取仍在进行中，完成后会在此处逐步开放页面。',
  },
  changelog: {
    title: '版本历史',
    current: '当前版本',
    empty: '暂无记录。',
    kind: { feature: '新功能', improvement: '优化', fix: '修复', data: '数据' },
  },
  siteInfo: {
    tab: '关于',
    aboutTitle: '关于本站',
    arkiveName: 'Arkive',
    gameName: '仙境传说3',
    introTemplate:
      '本站是由 {arkive} 建设并维护的非官方《{game}》互动资料库。所有游戏数据均从游戏文件中提取，本站将始终免费使用。',
    disclaimerTemplate:
      '本站与 {developer} 无隶属关系，未获其授权或认可。《{game}》及相关游戏内容的全部权利归 {developer} 所有。',
    versionTitle: '版本更新',
    viewVersionTemplate: '查看版本 {version}',
    feedbackTitle: '社区与反馈',
    feedbackHint: '如有建议或发现问题，欢迎通过下方反馈 QQ 群联系我们。',
    feedbackGroupLabel: '反馈 QQ 群',
    copy: '复制',
    copied: '已复制',
    close: '关闭',
  },
}

const zhTW: Strings = {
  siteTitle: '仙境傳說3 資料站',
  brand: 'Arkive.games',
  brandSlogan: '與我們一起遨遊遊戲世界。',
  brandHome: 'Arkive 攻略主站',
  login: '登入',
  themeAuto: '自動',
  themeLight: '淺色',
  themeDark: '深色',
  themeMenu: '主題',
  languageMenu: '語言',
  nav: { home: '首頁', changelog: '更新日誌' },
  home: {
    tagline: '《仙境傳說3》互動資料庫。',
    comingSoon: '資料擷取仍在進行中，完成後會在此處逐步開放頁面。',
  },
  changelog: {
    title: '版本歷史',
    current: '目前版本',
    empty: '尚無紀錄。',
    kind: { feature: '新功能', improvement: '優化', fix: '修復', data: '資料' },
  },
  siteInfo: {
    tab: '關於',
    aboutTitle: '關於本站',
    arkiveName: 'Arkive',
    gameName: '仙境傳說3',
    introTemplate:
      '本站是由 {arkive} 建置並維護的非官方《{game}》互動資料庫。所有遊戲資料均從遊戲檔案中擷取，本站將始終免費使用。',
    disclaimerTemplate:
      '本站與 {developer} 無隸屬關係，未獲其授權或認可。《{game}》及相關遊戲內容的全部權利歸 {developer} 所有。',
    versionTitle: '版本更新',
    viewVersionTemplate: '查看版本 {version}',
    feedbackTitle: '社群與意見回饋',
    feedbackHint: '如有建議或發現問題，歡迎透過下方回饋 QQ 群聯絡我們。',
    feedbackGroupLabel: '回饋 QQ 群',
    copy: '複製',
    copied: '已複製',
    close: '關閉',
  },
}

const UI: Partial<Record<Language, Strings>> = { 'en-US': en, 'zh-CN': zhCN, 'zh-TW': zhTW }

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
    LANGUAGES.map((lng) => [lng, { translation: UI[lng] ?? en }]),
  ),
  supportedLngs: [...LANGUAGES],
  fallbackLng: 'en-US',
  interpolation: { escapeValue: false },
})

bindArkiveDocumentLocale(i18n)
