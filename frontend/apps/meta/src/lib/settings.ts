import { useTranslation } from 'react-i18next'
import { useArkiveLanguageSettings, type ArkiveSettingsConfig } from '@gamemap/map-shell'

import { applyLanguage, LANGUAGES, LANGUAGE_LABELS } from '../i18n'

/**
 * The portal's settings config: general only.
 *
 * No `site`, so the panel renders no override group. meta is where the shared
 * theme and language are set; a game that overrides them is reset from that
 * game's own panel, which the general group says out loud.
 */
export function useSettingsConfig(): ArkiveSettingsConfig {
  const { t, i18n } = useTranslation()

  const language = useArkiveLanguageSettings({
    languages: LANGUAGES,
    labels: LANGUAGE_LABELS,
    fallback: 'zh-CN',
    apply: applyLanguage,
  })

  return {
    locale: i18n.resolvedLanguage ?? i18n.language,
    themeOptions: [
      { value: 'auto', label: t('theme.auto') },
      { value: 'light', label: t('theme.light') },
      { value: 'dark', label: t('theme.dark') },
    ],
    language,
  }
}
