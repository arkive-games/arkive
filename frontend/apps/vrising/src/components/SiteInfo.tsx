import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { SiteInfoPanel, type SiteInfoSection } from '@gamemap/map-shell'
import { ARKIVE_HOME_LINK_PROPS, ARKIVE_HOME_URL } from '../lib/brand'
import { SITE_VERSION } from '../lib/siteVersion'

export const FEEDBACK_QQ_GROUP = '1091411026'

const LOCALE_ONLY = { defaultValue: '', fallbackLng: false } as const

export function SiteInfo({ className }: { className?: string }) {
  const { t } = useTranslation()
  const contactTitle = t('siteInfo.contact.title', LOCALE_ONLY)
  const contactHint = t('siteInfo.contact.hint', LOCALE_ONLY)
  const groupLabel = t('siteInfo.contact.groupLabel', LOCALE_ONLY)

  const sections: SiteInfoSection[] = [
    {
      title: t('siteInfo.title'),
      body: (
        <>
          <p className="mb-2">
            {t('siteInfo.introBefore')}
            <a
              href={ARKIVE_HOME_URL}
              {...ARKIVE_HOME_LINK_PROPS}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {t('siteInfo.arkiveName')}
            </a>
            {t('siteInfo.introAfter')}
          </p>
          <p>{t('siteInfo.disclaimer')}</p>
        </>
      ),
    },
    {
      title: t('siteInfo.version'),
      body: (
        <Link to="/changelog" className="font-medium text-primary hover:underline">
          {t('siteInfo.changelog', { version: SITE_VERSION })}
        </Link>
      ),
    },
  ]

  if (contactTitle && contactHint) {
    sections.push({ title: contactTitle, body: <p>{contactHint}</p> })
  }

  return (
    <SiteInfoPanel
      className={className}
      sections={sections}
      feedbackGroup={groupLabel ? {
        label: groupLabel,
        number: FEEDBACK_QQ_GROUP,
        copyLabel: t('siteInfo.copy'),
        copiedLabel: t('siteInfo.copied'),
      } : undefined}
    />
  )
}
