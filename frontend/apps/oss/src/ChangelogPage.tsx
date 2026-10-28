import { VersionHistory, resolveChangelog, type ChangelogFile } from '@gamemap/ui'
import { OssTopBar } from './App'
import raw from './changelog.json'
import text from './locales/zh-CN.json'

const entries = resolveChangelog(raw as ChangelogFile, 'zh-CN')

export function ChangelogPage() {
  return <div className="flex min-h-dvh flex-col bg-background text-foreground">
    <OssTopBar active="/changelog" />
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{text.changelog}</h1>
      <VersionHistory entries={entries} labels={{
        current: text.changelogCurrent,
        kinds: { feature: text.kindFeature, improvement: text.kindImprovement, fix: text.kindFix, data: text.kindData },
      }} />
    </main>
  </div>
}
