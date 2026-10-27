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
  lede: "Saved on this device only. Set them again on another device.",
  siteSection: "{game} only",
  theme: "Theme",
  themeHint: "Auto follows your device's light or dark mode",
  language: "Language",
  siteTheme: "{game} theme",
  siteLanguage: "{game} language",
  followGeneral: "Follow general",
  overriding: "Overriding general",
  followingGeneral: "Following general ({value})",
  otherSitesNote:
    "Other games keep any setting of their own until it is reset there.",
  localData: "Local data",
  localDataSummary: "Recent activity, drafts and interface choices",
  close: "Close",
}

const LOCALIZED: Record<string, ArkiveSettingsStrings> = {
  "zh-CN": {
    title: "网站设置",
    lede: "只保存在这台设备上，换设备需要重新设置。",
    siteSection: "仅限{game}",
    theme: "主题",
    themeHint: "跟随设备的深浅色",
    language: "语言",
    siteTheme: "{game}主题",
    siteLanguage: "{game}语言",
    followGeneral: "跟随通用",
    overriding: "已覆盖通用设置",
    followingGeneral: "跟随通用（{value}）",
    otherSitesNote: "其他游戏若已单独设置，需在该游戏中重置后才会跟随。",
    localData: "本地数据",
    localDataSummary: "近期记录、草稿和界面偏好",
    close: "关闭",
  },
  "zh-TW": {
    title: "網站設定",
    lede: "只儲存在這台裝置上，換裝置需要重新設定。",
    siteSection: "僅限{game}",
    theme: "主題",
    themeHint: "跟隨裝置的深淺色",
    language: "語言",
    siteTheme: "{game}主題",
    siteLanguage: "{game}語言",
    followGeneral: "跟隨一般",
    overriding: "已覆寫一般設定",
    followingGeneral: "跟隨一般（{value}）",
    otherSitesNote: "其他遊戲若已個別設定，需在該遊戲中重設後才會跟隨。",
    localData: "本機資料",
    localDataSummary: "近期記錄、草稿和介面偏好",
    close: "關閉",
  },
  "ja-JP": {
    title: "サイト設定",
    lede: "この端末にのみ保存されます。別の端末では設定し直してください。",
    siteSection: "{game}のみ",
    theme: "テーマ",
    themeHint: "「自動」は端末のライト／ダークに合わせます",
    language: "言語",
    siteTheme: "{game}のテーマ",
    siteLanguage: "{game}の言語",
    followGeneral: "全般に従う",
    overriding: "全般設定を上書き中",
    followingGeneral: "全般に従う（{value}）",
    otherSitesNote: "個別に設定した他のゲームは、そのゲームでリセットするまで変わりません。",
    localData: "ローカルデータ",
    localDataSummary: "最近の履歴・下書き・表示設定",
    close: "閉じる",
  },
  "ko-KR": {
    title: "사이트 설정",
    lede: "이 기기에만 저장되며, 다른 기기에서는 다시 설정해야 합니다.",
    siteSection: "{game} 전용",
    theme: "테마",
    themeHint: "자동은 기기의 라이트·다크 모드를 따릅니다",
    language: "언어",
    siteTheme: "{game} 테마",
    siteLanguage: "{game} 언어",
    followGeneral: "일반 따르기",
    overriding: "일반 설정을 덮어쓰는 중",
    followingGeneral: "일반 따르기({value})",
    otherSitesNote: "개별 설정된 다른 게임은 해당 게임에서 초기화해야 반영됩니다.",
    localData: "로컬 데이터",
    localDataSummary: "최근 기록, 임시 저장, 화면 설정",
    close: "닫기",
  },
}

export function settingsStringsFor(
  language: string | null | undefined,
): ArkiveSettingsStrings {
  return LOCALIZED[language ?? ""] ?? ENGLISH
}
