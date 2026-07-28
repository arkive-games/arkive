import { useTranslation } from 'react-i18next'
import { SiteInfoPanel, type SiteInfoSection } from '@gamemap/map-shell'

/**
 * Feedback / suggestions / bug-report group, shared by both sites. Kept in
 * code rather than the locale tables: a group number is not a translation.
 */
export const FEEDBACK_QQ_GROUP = '1091411026'

/**
 * i18next resolves `fallbackLng` BEFORE `defaultValue`, so a plain
 * `t(key, '')` on a key this locale omits returns the en-US value. Pinning
 * `fallbackLng: false` makes "" mean "this locale has no contact channel" —
 * safe because SITE_INFO_STRINGS is a total Record<Language, …>, so no locale
 * needs the fallback for anything else. (Mirrors aion2's LOCALE_ONLY.)
 */
const LOCALE_ONLY = { defaultValue: '', fallbackLng: false } as const

function Paragraphs({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line) => (
        <p key={line} className="mb-1 last:mb-0">
          {line}
        </p>
      ))}
    </>
  )
}

/**
 * Site information and feedback, rendered in the map's right sidebar, the
 * top-bar popover and the mobile More sheet. The contact section exists only
 * for locales that have a channel — currently zh-CN and zh-TW.
 */
export function SiteInfo({ className }: { className?: string }) {
  const { t } = useTranslation()
  const body = t('siteInfo.body', { returnObjects: true }) as string[]
  const contactTitle = t('siteInfo.contact.title', LOCALE_ONLY)
  const contactHint = t('siteInfo.contact.hint', LOCALE_ONLY)
  const groupLabel = t('siteInfo.contact.groupLabel', LOCALE_ONLY)

  const sections: SiteInfoSection[] = [
    {
      title: t('siteInfo.title'),
      body: <Paragraphs lines={Array.isArray(body) ? body : [String(body)]} />,
    },
  ]
  if (contactTitle && contactHint) {
    sections.push({ title: contactTitle, body: <p>{contactHint}</p> })
  }

  return (
    <SiteInfoPanel
      className={className}
      sections={sections}
      feedbackGroup={
        groupLabel
          ? {
              label: groupLabel,
              number: FEEDBACK_QQ_GROUP,
              copyLabel: t('siteInfo.copy'),
              copiedLabel: t('siteInfo.copied'),
            }
          : undefined
      }
    />
  )
}
