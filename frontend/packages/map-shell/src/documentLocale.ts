const DEFAULT_LOCALE = "en-US"

const ARKIVE_LOCALE_ALIASES: Record<string, string> = {
  en: "en-US",
  "en-us": "en-US",
  ja: "ja-JP",
  "ja-jp": "ja-JP",
  ko: "ko-KR",
  "ko-kr": "ko-KR",
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  "zh-hans": "zh-CN",
  "zh-sg": "zh-CN",
  "zh-hant": "zh-TW",
  "zh-hk": "zh-TW",
  "zh-mo": "zh-TW",
  "zh-tw": "zh-TW",
}

export interface ArkiveLanguageSource {
  language?: string
  resolvedLanguage?: string
  on: (event: "languageChanged", listener: (language: string) => void) => unknown
  off?: (event: "languageChanged", listener: (language: string) => void) => unknown
}

export function normalizeArkiveLanguageTag(language?: string | null): string {
  const candidate = language?.trim().replaceAll("_", "-")
  if (!candidate) return DEFAULT_LOCALE

  const aliased = ARKIVE_LOCALE_ALIASES[candidate.toLowerCase()]
  if (aliased) return aliased

  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

export function applyArkiveDocumentLocale(
  language?: string | null,
  targetDocument: Document | undefined = typeof document === "undefined" ? undefined : document,
): string {
  const locale = normalizeArkiveLanguageTag(language)
  if (targetDocument) targetDocument.documentElement.lang = locale
  return locale
}

export function bindArkiveDocumentLocale(
  source: ArkiveLanguageSource,
  targetDocument: Document | undefined = typeof document === "undefined" ? undefined : document,
): () => void {
  const applyLanguage = (language: string) => {
    applyArkiveDocumentLocale(language, targetDocument)
  }

  applyArkiveDocumentLocale(source.resolvedLanguage ?? source.language, targetDocument)
  source.on("languageChanged", applyLanguage)

  return () => {
    source.off?.("languageChanged", applyLanguage)
  }
}
