import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { createApiClient } from '@gamemap/api-core'
import { ArkiveMapTopBar } from '@gamemap/map-shell'
import { Button, SiteFooter } from '@gamemap/ui'
import { ContentModerationWorkspace } from '../moderation/ContentModerationWorkspace'
import { LegacyMarkerImageQueue } from '../moderation/LegacyMarkerImageQueue'
import { createModerationFixture } from './moderation-fixture'
import copy from './locales/moderation-preview.json'
import { LANGUAGE_LABELS } from '../i18n'
import '../index.css'

const legacyPreview = createApiClient({
  baseUrl: '/preview',
  adapter: async config => ({ config, status: 200, statusText: 'OK', headers: {}, data: { errorCode: 'Success', data: { count: 0, results: [] } } }),
})

function ModerationReview() {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const text = copy[language as keyof typeof copy] ?? copy['en-US']
  const [dark, setDark] = useState(false)
  const [administrator, setAdministrator] = useState(true)
  const [version, setVersion] = useState(0)
  const gateway = useMemo(() => createModerationFixture(language, administrator, version), [language, administrator, version])
  return <div className="flex min-h-dvh flex-col bg-background text-foreground" data-review-ready>
    <ArkiveMapTopBar homeUrl="/" homeLabel="Arkive" variant="docked" nav={{ items: [{ key: 'moderation', label: i18n.t('contentModeration.title'), active: true }], renderItem: (item, className) => <a href="#moderation" className={className}>{item.label}</a> }} languageSwitcher={{ current: language, languages: [{ code: 'zh-CN', label: LANGUAGE_LABELS['zh-CN'] }, { code: 'en-US', label: LANGUAGE_LABELS['en-US'] }], onChange: value => void i18n.changeLanguage(value), menuLabel: 'Language' }} themeSwitcher={{ current: dark ? 'dark' : 'light', onChange: value => { setDark(value === 'dark'); document.documentElement.classList.toggle('dark', value === 'dark') }, labels: { auto: 'Auto', light: text.light, dark: text.dark }, menuLabel: 'Theme' }} loginLabel="Preview" />
    <div className="mx-auto flex w-full max-w-[var(--arkive-content-wide-data)] flex-wrap items-center justify-between gap-2 px-[var(--arkive-page-gutter)] pt-4 text-xs text-muted-foreground"><p>{text.preview}</p><div className="flex gap-2"><Button variant="ghost" className="min-h-11 rounded-full text-xs" onClick={() => setAdministrator(value => !value)}>{administrator ? text.admin : text.moderator}</Button><Button variant="ghost" className="min-h-11 rounded-full text-xs" onClick={() => setVersion(value => value + 1)}>{text.reset}</Button></div></div>
    <ContentModerationWorkspace key={`${language}:${administrator}:${version}`} gateway={gateway} siteAdministrator={administrator}
      legacy={<LegacyMarkerImageQueue client={legacyPreview.client} />} />
    <SiteFooter homeUrl="/" githubUrl={null} />
  </div>
}

const root = createRoot(document.getElementById('root')!)
root.render(<ModerationReview />)
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount())
