import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ArkiveSiteInfo, type ArkiveSiteInfoStrings } from '@gamemap/map-shell'
import { resolveChangelog } from '@gamemap/ui'
import { ARKIVE_HOME_LINK_PROPS, ARKIVE_HOME_URL } from '../lib/brand'
import { changelog, SITE_VERSION } from '../lib/siteVersion'

export const FEEDBACK_QQ_GROUP = '1091411026'
const ABOUT_HISTORY_START_VERSION = '0.9.2'

export function SiteInfo({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const recentEntries = useMemo(() => resolveChangelog(changelog, lng), [lng])
  const strings: ArkiveSiteInfoStrings = {
    aboutTitle: t('siteInfo.aboutTitle'),
    introTemplate: t('siteInfo.introTemplate'),
    disclaimerTemplate: t('siteInfo.disclaimerTemplate'),
    versionTitle: t('siteInfo.versionTitle'),
    viewVersionTemplate: t('siteInfo.viewVersionTemplate'),
    recentUpdatesTitle: t('siteInfo.recentUpdatesTitle'),
    noRecentUpdates: t('siteInfo.noRecentUpdates'),
    feedbackTitle: t('siteInfo.feedbackTitle'),
    feedbackHint: t('siteInfo.feedbackHint'),
    close: t('siteInfo.close'),
  }

  return (
    <ArkiveSiteInfo
      className={className}
      strings={strings}
      arkiveName={t('siteInfo.arkiveName')}
      arkiveHomeUrl={ARKIVE_HOME_URL}
      arkiveHomeLinkProps={ARKIVE_HOME_LINK_PROPS}
      gameName={t('gameName')}
      developerName="Stunlock Studios"
      version={SITE_VERSION}
      recentEntries={recentEntries}
      historyStartVersion={ABOUT_HISTORY_START_VERSION}
      feedbackGroup={{
        label: t('siteInfo.feedbackGroupLabel'),
        number: FEEDBACK_QQ_GROUP,
        copyLabel: t('siteInfo.copy'),
        copiedLabel: t('siteInfo.copied'),
      }}
    />
  )
}
