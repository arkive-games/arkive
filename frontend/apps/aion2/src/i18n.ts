import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";
import { detectLanguagePreference, saveLanguagePreference } from "@gamemap/state-memory";
import { bindArkiveDocumentLocale } from "@gamemap/map-shell";
import { parse } from "yaml";
import { getStaticBaseUrl, getDataBaseUrl } from "@/lib/url";

export type LanguageCode = "en-US" | "zh-CN" | "zh-TW" | "ko-KR";
export const SUPPORTED_LANGUAGES: LanguageCode[] = ["en-US", "zh-CN", "zh-TW", "ko-KR"];

// Native (endonym) display names — intentionally NOT translated so every
// language is recognizable to its own speakers regardless of the current UI
// language.
export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  "en-US": "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  "ko-KR": "한국어",
};

const base = getStaticBaseUrl();
const dataBase = getDataBaseUrl();

/**
 * GENERATED game-data namespaces are served as JSON from the `data/` repo
 * (`data/locales/<lng>/<ns>.json`); HAND-AUTHORED app-UI namespaces (`common`,
 * `items/*`, …) stay as `.yaml` in the app's own `public/locales`.
 * `<ns>` may be nested, e.g. `markers/World_L_A`.
 */
const GAME_DATA_NS = ["maps", "types"];
function isGameDataNs(ns: string): boolean {
  return (
    GAME_DATA_NS.includes(ns) ||
    ns.startsWith("markers/") ||
    ns.startsWith("regions/") ||
    ns.startsWith("wiki/")
  );
}

/**
 * The app-UI catalogues are authored as `.yaml`, but a Bilibili toy is served
 * by a host that 404s that extension (verified 2026-07-31: `.html`, `.js`,
 * `.css`, `.webp`, `.svg`, `.png` all serve, `.yaml` does not). `toy-build`
 * rewrites them to `.json` in the package, so the toy build asks for `.json`.
 * Both parse through `yaml.parse`, which accepts JSON as a YAML subset.
 */
const APP_LOCALE_EXT = import.meta.env.VITE_TOY ? "json" : "yaml";

function localeLoadPath(lngs: string[], nss: string[]): string {
  const lng = lngs[0];
  const ns = nss[0];
  const q = `build=${__BUILD_GIT_COMMIT__}`;
  // Generated game data → JSON from the data repo.
  if (isGameDataNs(ns)) {
    const root = dataBase ? `${dataBase}/locales` : `/data/locales`;
    return `${root}/${lng}/${ns}.json?${q}`;
  }
  // Hand-authored app-UI strings → public/locales.
  return `${base}/locales/${lng}/${ns}.${APP_LOCALE_EXT}?${q}`;
}

export function changeLanguagePreference(code: string) {
  saveLanguagePreference(code, SUPPORTED_LANGUAGES);
  return i18n.changeLanguage(code);
}

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: detectLanguagePreference(SUPPORTED_LANGUAGES, "zh-CN"),
    fallbackLng: "zh-CN",
    supportedLngs: SUPPORTED_LANGUAGES,
    ns: ["common", "maps", "types"],
    defaultNS: "common",
    backend: {
      loadPath: localeLoadPath,
      // YAML is a superset of JSON, so `yaml.parse` safely handles both the
      // `.json` game-data namespaces and the `.yaml` app-UI namespaces.
      parse: (data: string) => parse(data),
    },
    interpolation: { escapeValue: false },
  });

bindArkiveDocumentLocale(i18n);

export default i18n;
