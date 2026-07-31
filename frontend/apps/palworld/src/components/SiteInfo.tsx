import { useTranslation } from 'react-i18next'
import { ArrowUpRight } from 'lucide-react'
import { SiteInfoPanel, type SiteInfoSection } from '@gamemap/map-shell'
import { ARKIVE_HOME_LINK_PROPS, ARKIVE_HOME_URL } from '../lib/brand'

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
      {/* Index keys: the array is static and never reordered, and a translator
          duplicating a line would otherwise collide. Matches SiteInfoPanel's
          own sections.map. */}
      {lines.map((line, i) => (
        <p key={i} className="mb-1 last:mb-0">
          {line}
        </p>
      ))}
    </>
  )
}

/**
 * "This site is one of several" blurb plus a link out to the portal. The
 * anchor inherits the panel's link colour/underline; `text-primary` is spelled
 * out anyway so the affordance survives a host that drops that rule.
 */
function ArkiveSection({ blurb, brand, homeLabel }: { blurb: string; brand: string; homeLabel: string }) {
  return (
    <>
      <p className="mb-1">{blurb}</p>
      <a
        href={ARKIVE_HOME_URL}
        {...ARKIVE_HOME_LINK_PROPS}
        aria-label={homeLabel}
        title={homeLabel}
        data-testid="site-info-arkive-link"
        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
      >
        {brand}
        <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
      </a>
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
  const brand = t('brand')
  const contactTitle = t('siteInfo.contact.title', LOCALE_ONLY)
  const contactHint = t('siteInfo.contact.hint', LOCALE_ONLY)
  const groupLabel = t('siteInfo.contact.groupLabel', LOCALE_ONLY)

  const sections: SiteInfoSection[] = [
    {
      title: t('siteInfo.title'),
      body: <Paragraphs lines={Array.isArray(body) ? body : [String(body)]} />,
    },
    // Between the about body and the locale-gated contact card: the portal is
    // context for what this site is, not a support channel.
    {
      title: brand,
      body: <ArkiveSection blurb={t('siteInfo.arkive')} brand={brand} homeLabel={t('brandHome')} />,
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
