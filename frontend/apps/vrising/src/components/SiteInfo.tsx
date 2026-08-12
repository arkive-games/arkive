import { useTranslation } from 'react-i18next'
import { ARKIVE_ICP_RECORD } from '@gamemap/ui'
import { ArkiveSiteInfo, type ArkiveSiteInfoStrings } from '@gamemap/map-shell'
import { ARKIVE_HOME_LINK_PROPS, ARKIVE_HOME_URL, IS_TOY } from '../lib/brand'
import { SITE_VERSION } from '../lib/siteVersion'

export const FEEDBACK_QQ_GROUP = '1091411026'
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
      arkiveHomeLinkProps={ARKIVE_HOME_LINK_PROPS}
      gameName={t('gameName')}
      developerName="Stunlock Studios"
      version={SITE_VERSION}
      gameUpdatesUrl={IS_TOY ? '#/changelog' : '/changelog'}
      feedbackGroup={{
        label: t('siteInfo.feedbackGroupLabel'),
        number: FEEDBACK_QQ_GROUP,
        copyLabel: t('siteInfo.copy'),
        copiedLabel: t('siteInfo.copied'),
      }}
    />
  )
}
