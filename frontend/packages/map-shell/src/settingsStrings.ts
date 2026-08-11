import type { ArkiveSettingsStrings } from "./ArkiveSettingsPanel"

/**
 * Bundled rather than fetched, matching `localDataStringsFor`.
 *
 * This package cannot reach an app's translation catalogue -- it is grep-gated
 * against i18n entirely -- and the panel is chrome that must render before an
 * app's namespaces resolve. Locales beyond these five fall back to English,
 * which is the same bargain the local-data strings already make.
 */
const ENGLISH: ArkiveSettingsStrings = {
  title: "Settings",
  general: "General",
  generalDescription: "Applies to every Arkive site.",
  siteSection: "{game} only",
  siteDescription: "Overrides the general settings on this site.",
  theme: "Theme",
  language: "Language",
  followGeneral: "Follow general",
  overriding: "Overriding general",
  followingGeneral: "Following general ({value})",
  otherSitesNote:
    "Other games keep any setting of their own until it is reset there.",
  close: "Close",
}

const LOCALIZED: Record<string, ArkiveSettingsStrings> = {
  "zh-CN": {
    title: "设置",
    general: "通用",
    generalDescription: "应用于所有 Arkive 站点。",
    siteSection: "仅限{game}",
    siteDescription: "在本站点覆盖通用设置。",
    theme: "主题",
    language: "语言",
    followGeneral: "跟随通用",
    overriding: "已覆盖通用设置",
    followingGeneral: "跟随通用（{value}）",
    otherSitesNote: "其他游戏若已单独设置，需在该游戏中重置后才会跟随。",
    close: "关闭",
  },
  "zh-TW": {
    title: "設定",
    general: "一般",
    generalDescription: "套用至所有 Arkive 站點。",
    siteSection: "僅限{game}",
    siteDescription: "在本站點覆寫一般設定。",
    theme: "主題",
    language: "語言",
    followGeneral: "跟隨一般",
    overriding: "已覆寫一般設定",
    followingGeneral: "跟隨一般（{value}）",
    otherSitesNote: "其他遊戲若已個別設定，需在該遊戲中重設後才會跟隨。",
    close: "關閉",
  },
  "ja-JP": {
    title: "設定",
    general: "全般",
    generalDescription: "すべての Arkive サイトに適用されます。",
    siteSection: "{game}のみ",
    siteDescription: "このサイトでは全般設定を上書きします。",
    theme: "テーマ",
    language: "言語",
    followGeneral: "全般に従う",
    overriding: "全般設定を上書き中",
    followingGeneral: "全般に従う（{value}）",
    otherSitesNote: "個別に設定した他のゲームは、そのゲームでリセットするまで変わりません。",
    close: "閉じる",
  },
  "ko-KR": {
    title: "설정",
    general: "일반",
    generalDescription: "모든 Arkive 사이트에 적용됩니다.",
    siteSection: "{game} 전용",
    siteDescription: "이 사이트에서 일반 설정을 덮어씁니다.",
    theme: "테마",
    language: "언어",
    followGeneral: "일반 따르기",
    overriding: "일반 설정을 덮어쓰는 중",
    followingGeneral: "일반 따르기({value})",
    otherSitesNote: "개별 설정된 다른 게임은 해당 게임에서 초기화해야 반영됩니다.",
    close: "닫기",
  },
}

export function settingsStringsFor(
  language: string | null | undefined,
): ArkiveSettingsStrings {
  return LOCALIZED[language ?? ""] ?? ENGLISH
}
