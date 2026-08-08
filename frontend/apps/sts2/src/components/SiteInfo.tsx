import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ArkiveSiteInfo, type ArkiveSiteInfoStrings } from '@gamemap/map-shell'
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  resolveChangelog,
} from '@gamemap/ui'
import { changelog, SITE_VERSION } from '../lib/siteVersion'

const ARKIVE_HOME_URL = import.meta.env.VITE_HOME_URL ?? 'https://tc-imba.com'
const FEEDBACK_QQ_GROUP = '1091411026'
const ABOUT_HISTORY_START_VERSION = '0.2.1'

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
      arkiveHomeLinkProps={{ target: '_blank', rel: 'noopener noreferrer' }}
      gameName={t('siteInfo.gameName')}
      developerName="Mega Crit"
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

export function SiteInfoDialog() {
  const { t } = useTranslation()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" data-testid="site-info-open">
          {t('siteInfo.tab')}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[min(80dvh,44rem)] grid-rows-[auto_minmax(0,1fr)_auto]"
      >
        <DialogHeader>
          <DialogTitle className="sr-only">{t('siteInfo.aboutTitle')}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto pr-1">
          <SiteInfo />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">{t('siteInfo.close')}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
