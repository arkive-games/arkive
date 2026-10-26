import type { ArkiveSettingsStrings } from "./ArkiveSettingsPanel"

/**
 * Bundled rather than fetched, matching `localDataStringsFor`.
 *
 * This package cannot reach an app's translation catalogue -- it is grep-gated
 * against i18n entirely -- and the panel is chrome that must render before an
 * app's namespaces resolve. Locales beyond these five fall back to English,
 * which is the same bargain the local-data strings already make.
 *
 * `title` is set in the Arkive Rounded subset; regenerate that font when it
 * changes (see arkive-map-theme.css).
 */
const ENGLISH: ArkiveSettingsStrings = {
  title: "Site settings",
  siteSection: "{game} only",
  theme: "Theme",
  language: "Language",
  siteTheme: "{game} theme",
  siteLanguage: "{game} language",
  followGeneral: "Follow general",
  overriding: "Overriding general",
  followingGeneral: "Following general ({value})",
  otherSitesNote:
    "Other games keep any setting of their own until it is reset there.",
  localData: "Local data",
  manage: "Manage",
  close: "Close",
}

const LOCALIZED: Record<string, ArkiveSettingsStrings> = {
  "zh-CN": {
    title: "网站设置",
    siteSection: "仅限{game}",
    theme: "主题",
    language: "语言",
    siteTheme: "{game}主题",
    siteLanguage: "{game}语言",
    followGeneral: "跟随通用",
    overriding: "已覆盖通用设置",
    followingGeneral: "跟随通用（{value}）",
    otherSitesNote: "其他游戏若已单独设置，需在该游戏中重置后才会跟随。",
    localData: "本地数据管理",
    manage: "管理",
    close: "关闭",
  },
  "zh-TW": {
    title: "網站設定",
    siteSection: "僅限{game}",
    theme: "主題",
    language: "語言",
    siteTheme: "{game}主題",
    siteLanguage: "{game}語言",
    followGeneral: "跟隨一般",
    overriding: "已覆寫一般設定",
    followingGeneral: "跟隨一般（{value}）",
    otherSitesNote: "其他遊戲若已個別設定，需在該遊戲中重設後才會跟隨。",
    localData: "本機資料管理",
    manage: "管理",
    close: "關閉",
  },
  "ja-JP": {
    title: "サイト設定",
    siteSection: "{game}のみ",
    theme: "テーマ",
    language: "言語",
    siteTheme: "{game}のテーマ",
    siteLanguage: "{game}の言語",
    followGeneral: "全般に従う",
    overriding: "全般設定を上書き中",
    followingGeneral: "全般に従う（{value}）",
    otherSitesNote: "個別に設定した他のゲームは、そのゲームでリセットするまで変わりません。",
    localData: "ローカルデータ管理",
    manage: "管理",
    close: "閉じる",
  },
  "ko-KR": {
    title: "사이트 설정",
    siteSection: "{game} 전용",
    theme: "테마",
    language: "언어",
    siteTheme: "{game} 테마",
    siteLanguage: "{game} 언어",
    followGeneral: "일반 따르기",
    overriding: "일반 설정을 덮어쓰는 중",
    followingGeneral: "일반 따르기({value})",
    otherSitesNote: "개별 설정된 다른 게임은 해당 게임에서 초기화해야 반영됩니다.",
    localData: "로컬 데이터 관리",
    manage: "관리",
    close: "닫기",
  },
}

export function settingsStringsFor(
  language: string | null | undefined,
): ArkiveSettingsStrings {
  return LOCALIZED[language ?? ""] ?? ENGLISH
}
