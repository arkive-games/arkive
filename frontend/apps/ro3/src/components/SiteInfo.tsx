import { useTranslation } from 'react-i18next'
import { ARKIVE_ICP_RECORD } from '@gamemap/ui'
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
} from '@gamemap/ui'
import { SITE_VERSION } from '../lib/siteVersion'
import { ARKIVE_HOME_URL, IS_TOY } from '../lib/brand'

const FEEDBACK_QQ_GROUP = '1091411026'
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
      // The client's own rights holder: RagnarokOnline3.exe carries
      // "Copyright(C)2025 上海幻电信息科技有限公司", and its Unity app.info names gravity as
      // the developer. A game-sourced legal name, so it stays unlocalized.
      developerName="上海幻电信息科技有限公司"
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
