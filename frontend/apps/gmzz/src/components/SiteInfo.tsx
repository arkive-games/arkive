import { useTranslation } from 'react-i18next'
import { ARKIVE_FEEDBACK_QQ_GROUP, ARKIVE_ICP_RECORD } from '@gamemap/ui'
import { ArkiveSiteInfo, ArkiveSiteInfoDialog, type ArkiveSiteInfoStrings } from '@gamemap/map-shell'
import { SITE_VERSION } from '../lib/siteVersion'
import { ARKIVE_HOME_URL, IS_TOY } from '../lib/brand'

export function SiteInfo({ className }: { className?: string }) {
  const { t } = useTranslation()
  const strings: ArkiveSiteInfoStrings = {
    aboutTitle: t('siteInfo.aboutTitle'),
    introTemplate: t('siteInfo.introTemplate'),
    disclaimerTemplate: t('siteInfo.disclaimerTemplate'),
    versionTitle: t('siteInfo.versionTitle'),
    viewVersionTemplate: t('siteInfo.viewVersionTemplate'),
    feedbackTitle: t('siteInfo.feedbackTitle'),
    feedbackHint: t('siteInfo.feedbackHint'),
  }

  return (
    <ArkiveSiteInfo
      icpRecord={import.meta.env.VITE_ICP_BEIAN ?? ARKIVE_ICP_RECORD}
      className={className}
      strings={strings}
      arkiveName={t('siteInfo.arkiveName')}
      arkiveHomeUrl={ARKIVE_HOME_URL}
      arkiveHomeLinkProps={{ target: '_blank', rel: 'noopener noreferrer' }}
      gameName={t('siteInfo.gameName')}
      developerName="上海幻电信息科技有限公司"
      version={SITE_VERSION}
      gameUpdatesUrl={IS_TOY ? '#/changelog' : '/changelog'}
      feedbackGroup={{
        label: t('siteInfo.feedbackGroupLabel'),
        number: ARKIVE_FEEDBACK_QQ_GROUP,
        copyLabel: t('siteInfo.copy'),
        copiedLabel: t('siteInfo.copied'),
      }}
    />
  )
}

/** The shared About dialog, with this site's labels. */
function SiteInfoDialog() {
  const { t } = useTranslation()
  return (
    <ArkiveSiteInfoDialog labels={{ trigger: t('siteInfo.tab'), title: t('siteInfo.aboutTitle'), close: t('siteInfo.close') }}>
      <SiteInfo />
    </ArkiveSiteInfoDialog>
  )
}

export { SiteInfoDialog }
