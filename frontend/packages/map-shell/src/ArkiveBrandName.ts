export const ARKIVE_BRAND_NAME_EN = "Arkive.games"
export const ARKIVE_BRAND_NAME_ZH_CN = "藏舟游戏攻略网"
export const ARKIVE_BRAND_NAME_ZH_TW = "藏舟遊戲攻略網"

/** Resolve the shared wordmark while preserving app-owned labels for other locales. */
export function getArkiveBrandName(locale: string, fallback = ARKIVE_BRAND_NAME_EN): string {
  const normalized = locale.trim().toLowerCase().replaceAll("_", "-")
  if (normalized === "zh" || normalized === "zh-cn" || normalized === "zh-hans") {
    return ARKIVE_BRAND_NAME_ZH_CN
  }
  if (
    normalized === "zh-tw" ||
    normalized === "zh-hant" ||
    normalized === "zh-hk" ||
    normalized === "zh-mo"
  ) {
    return ARKIVE_BRAND_NAME_ZH_TW
  }
  if (normalized === "en" || normalized.startsWith("en-")) {
    return ARKIVE_BRAND_NAME_EN
  }
  return fallback
}
