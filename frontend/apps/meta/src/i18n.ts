import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

export const LANGUAGES = ['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR'] as const
export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
}

// The full translated string set for this hub page. Game names ("AION2",
// "Palworld") and the brand ("Arkive Games") stay untranslated.
interface Strings {
  brand: string
  aion2Desc: string
  palDesc: string
  open: string
  themeAuto: string
  themeLight: string
  themeDark: string
  language: string
}

const BRAND_EN = 'Arkive Games'

const STRINGS: Record<Language, Strings> = {
  'en-US': { brand: BRAND_EN, aion2Desc: 'Interactive map and game database', palDesc: 'Map, Paldeck and breeding calculator', open: 'Open site', themeAuto: 'System', themeLight: 'Light', themeDark: 'Dark', language: 'Language' },
  'zh-CN': { brand: '藏舟攻略网', aion2Desc: '交互式地图与游戏数据库', palDesc: '地图、帕鲁图鉴与配种计算器', open: '打开网站', themeAuto: '系统', themeLight: '浅色', themeDark: '深色', language: '语言' },
  'zh-TW': { brand: '藏舟攻略網', aion2Desc: '互動式地圖與遊戲資料庫', palDesc: '地圖、帕魯圖鑑與配種計算器', open: '開啟網站', themeAuto: '系統', themeLight: '淺色', themeDark: '深色', language: '語言' },
  'ja-JP': { brand: BRAND_EN, aion2Desc: 'インタラクティブマップとゲームデータベース', palDesc: 'マップ、パルデック、交配計算機', open: 'サイトを開く', themeAuto: 'システム', themeLight: 'ライト', themeDark: 'ダーク', language: '言語' },
  'ko-KR': { brand: BRAND_EN, aion2Desc: '인터랙티브 지도 및 게임 데이터베이스', palDesc: '지도, 팰덱, 교배 계산기', open: '사이트 열기', themeAuto: '시스템', themeLight: '라이트', themeDark: '다크', language: '언어' },
}

const resources = Object.fromEntries(
  LANGUAGES.map((lng) => {
    const s = STRINGS[lng]
    return [
      lng,
      {
        translation: {
          brand: s.brand,
          site: {
            aion2: { name: 'AION2', desc: s.aion2Desc },
            palworld: { name: 'Palworld', desc: s.palDesc },
          },
          action: { open: s.open },
          theme: { auto: s.themeAuto, light: s.themeLight, dark: s.themeDark },
          language: s.language,
        },
      },
    ]
  }),
)

i18n.use(LanguageDetector).use(initReactI18next).init({
  resources,
  supportedLngs: [...LANGUAGES],
  fallbackLng: 'en-US',
  interpolation: { escapeValue: false },
})

export default i18n
