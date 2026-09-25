import { resolveArkiveHomeUrl, type ArkiveSettingsConfig } from '@gamemap/map-shell'
import content from '../locales/zh-CN.json'

export const HOME_URL = resolveArkiveHomeUrl({
  envUrl: import.meta.env.VITE_HOME_URL,
  dev: import.meta.env.DEV,
  toy: Boolean(import.meta.env.VITE_TOY),
})

/**
 * One settings config for both surfaces that show it -- the account menu on
 * desktop and the "More" sheet on a phone -- so the two cannot offer different
 * rows. RO3 ships one language, so the language half is absent; the theme half
 * comes from ThemeProvider.
 */
export const SETTINGS: ArkiveSettingsConfig = {
  locale: 'zh-CN',
  site: { name: 'Ragnarok Online 3' },
  themeOptions: [
    { value: 'auto', label: content.theme.auto },
    { value: 'light', label: content.theme.light },
    { value: 'dark', label: content.theme.dark },
  ],
}
