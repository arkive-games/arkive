import { useTranslation } from "react-i18next";
import { useArkiveLanguageSettings, type ArkiveSettingsConfig } from "@gamemap/map-shell";

import i18n, { applyLanguage, LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from "@/i18n";

/**
 * One settings config for both surfaces that show it -- the account menu on
 * desktop, the "More" sheet on a phone -- so the two cannot offer different
 * rows, and the language layer subscription is written once.
 *
 * The theme half is absent by design: it comes from ThemeProvider, which owns
 * both layers and must be the one to write them so the page re-renders.
 */
export function useSettingsConfig(): ArkiveSettingsConfig {
  const { t } = useTranslation(["common"]);

  const language = useArkiveLanguageSettings({
    languages: SUPPORTED_LANGUAGES,
    labels: LANGUAGE_LABELS,
    fallback: "zh-CN",
    apply: applyLanguage,
  });

  return {
    locale: i18n.resolvedLanguage ?? i18n.language,
    // The GAME's name, not the Arkive brand: `getArkiveBrandName` returns
    // "Arkive.games", which would head the override group "Arkive.games only"
    // on every site. No localized per-game string exists, and these are proper
    // nouns, so a literal is both correct and stable.
    site: { name: "AION2" },
    themeOptions: [
      { value: "auto", label: t("common:theme.auto") },
      { value: "light", label: t("common:theme.light") },
      { value: "dark", label: t("common:theme.dark") },
    ],
    language,
  };
}
