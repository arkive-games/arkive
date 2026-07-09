import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

export const LANGUAGES = ['en-US', 'de-DE', 'es-ES', 'es-MX', 'fr-FR', 'id-ID', 'it-IT', 'ja-JP', 'ko-KR', 'pl-PL', 'pt-BR', 'ru-RU', 'th-TH', 'tr-TR', 'vi-VN', 'zh-CN', 'zh-TW'] as const
export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  'en-US': 'English',
  'de-DE': 'Deutsch',
  'es-ES': 'Español',
  'es-MX': 'Español (México)',
  'fr-FR': 'Français',
  'id-ID': 'Bahasa Indonesia',
  'it-IT': 'Italiano',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'pl-PL': 'Polski',
  'pt-BR': 'Português (Brasil)',
  'ru-RU': 'Русский',
  'th-TH': 'ไทย',
  'tr-TR': 'Türkçe',
  'vi-VN': 'Tiếng Việt',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
}

// The full translated string set for this hub page. Game names ("AION2",
// "Palworld") and the brand ("Arkive Games") stay untranslated.
interface Strings {
  aion2Desc: string
  palDesc: string
  open: string
  themeAuto: string
  themeLight: string
  themeDark: string
  language: string
}

const STRINGS: Record<Language, Strings> = {
  'en-US': { aion2Desc: 'Interactive map and game database', palDesc: 'Map, Paldeck and breeding calculator', open: 'Open site', themeAuto: 'System', themeLight: 'Light', themeDark: 'Dark', language: 'Language' },
  'de-DE': { aion2Desc: 'Interaktive Karte und Spieldatenbank', palDesc: 'Karte, Paldeck und Zuchtrechner', open: 'Seite öffnen', themeAuto: 'System', themeLight: 'Hell', themeDark: 'Dunkel', language: 'Sprache' },
  'es-ES': { aion2Desc: 'Mapa interactivo y base de datos del juego', palDesc: 'Mapa, Paldex y calculadora de crianza', open: 'Abrir sitio', themeAuto: 'Sistema', themeLight: 'Claro', themeDark: 'Oscuro', language: 'Idioma' },
  'es-MX': { aion2Desc: 'Mapa interactivo y base de datos del juego', palDesc: 'Mapa, Paldex y calculadora de crianza', open: 'Abrir sitio', themeAuto: 'Sistema', themeLight: 'Claro', themeDark: 'Oscuro', language: 'Idioma' },
  'fr-FR': { aion2Desc: 'Carte interactive et base de données du jeu', palDesc: "Carte, Paldex et calculateur d'élevage", open: 'Ouvrir le site', themeAuto: 'Système', themeLight: 'Clair', themeDark: 'Sombre', language: 'Langue' },
  'id-ID': { aion2Desc: 'Peta interaktif dan basis data game', palDesc: 'Peta, Paldeck, dan kalkulator ternak', open: 'Buka situs', themeAuto: 'Sistem', themeLight: 'Terang', themeDark: 'Gelap', language: 'Bahasa' },
  'it-IT': { aion2Desc: 'Mappa interattiva e database di gioco', palDesc: 'Mappa, Paldeck e calcolatore di riproduzione', open: 'Apri sito', themeAuto: 'Sistema', themeLight: 'Chiaro', themeDark: 'Scuro', language: 'Lingua' },
  'ja-JP': { aion2Desc: 'インタラクティブマップとゲームデータベース', palDesc: 'マップ、パルデック、交配計算機', open: 'サイトを開く', themeAuto: 'システム', themeLight: 'ライト', themeDark: 'ダーク', language: '言語' },
  'ko-KR': { aion2Desc: '인터랙티브 지도 및 게임 데이터베이스', palDesc: '지도, 팰덱, 교배 계산기', open: '사이트 열기', themeAuto: '시스템', themeLight: '라이트', themeDark: '다크', language: '언어' },
  'pl-PL': { aion2Desc: 'Interaktywna mapa i baza danych gry', palDesc: 'Mapa, Paldeks i kalkulator hodowli', open: 'Otwórz stronę', themeAuto: 'System', themeLight: 'Jasny', themeDark: 'Ciemny', language: 'Język' },
  'pt-BR': { aion2Desc: 'Mapa interativo e banco de dados do jogo', palDesc: 'Mapa, Paldeck e calculadora de criação', open: 'Abrir site', themeAuto: 'Sistema', themeLight: 'Claro', themeDark: 'Escuro', language: 'Idioma' },
  'ru-RU': { aion2Desc: 'Интерактивная карта и база данных игры', palDesc: 'Карта, Палдек и калькулятор разведения', open: 'Открыть сайт', themeAuto: 'Система', themeLight: 'Светлая', themeDark: 'Тёмная', language: 'Язык' },
  'th-TH': { aion2Desc: 'แผนที่แบบโต้ตอบและฐานข้อมูลเกม', palDesc: 'แผนที่ พาลเด็ค และเครื่องคำนวณการผสมพันธุ์', open: 'เปิดเว็บไซต์', themeAuto: 'ระบบ', themeLight: 'สว่าง', themeDark: 'มืด', language: 'ภาษา' },
  'tr-TR': { aion2Desc: 'Etkileşimli harita ve oyun veritabanı', palDesc: 'Harita, Paldeck ve üretim hesaplayıcı', open: 'Siteyi aç', themeAuto: 'Sistem', themeLight: 'Açık', themeDark: 'Koyu', language: 'Dil' },
  'vi-VN': { aion2Desc: 'Bản đồ tương tác và cơ sở dữ liệu game', palDesc: 'Bản đồ, Paldeck và công cụ tính lai tạo', open: 'Mở trang', themeAuto: 'Hệ thống', themeLight: 'Sáng', themeDark: 'Tối', language: 'Ngôn ngữ' },
  'zh-CN': { aion2Desc: '交互式地图与游戏数据库', palDesc: '地图、帕鲁图鉴与配种计算器', open: '打开网站', themeAuto: '系统', themeLight: '浅色', themeDark: '深色', language: '语言' },
  'zh-TW': { aion2Desc: '互動式地圖與遊戲資料庫', palDesc: '地圖、帕魯圖鑑與配種計算器', open: '開啟網站', themeAuto: '系統', themeLight: '淺色', themeDark: '深色', language: '語言' },
}

const resources = Object.fromEntries(
  LANGUAGES.map((lng) => {
    const s = STRINGS[lng]
    return [
      lng,
      {
        translation: {
          brand: 'Arkive Games',
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
