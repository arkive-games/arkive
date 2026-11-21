import { useMemo } from 'react'
import { resolveChangelog, VersionHistory } from '@gamemap/ui'
import type { ChangelogFile } from '@gamemap/ui'
import content from './locales/zh-CN.json'
import raw from './changelog.json'

const CHANGELOG = raw as ChangelogFile

export default function ChangelogPage() {
  const entries = useMemo(() => resolveChangelog(CHANGELOG, 'zh-CN'), [])
  return (
    <VersionHistory
      entries={entries}
      labels={{
        current: content.changelog.current,
        empty: content.changelog.empty,
        kinds: content.changelog.kinds,
      }}
    />
  )
}
