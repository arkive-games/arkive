import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { VersionHistory, changelogLabels, resolveChangelog } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { changelog } from '../../lib/siteVersion'

export default function ChangelogPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const entries = useMemo(() => resolveChangelog(changelog, lng), [lng])

  return (
    <ContentPage active="/changelog" title={t('changelog.title')} heading>
      <VersionHistory
        entries={entries}
        labels={changelogLabels(t)}
      />
    </ContentPage>
  )
}
