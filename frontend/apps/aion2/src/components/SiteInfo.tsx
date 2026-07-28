import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SiteInfoPanel, type SiteInfoSection } from "@gamemap/map-shell";
import { FEEDBACK_QQ_GROUP } from "@/lib/constants";

/**
 * i18next resolves `fallbackLng` BEFORE `defaultValue`, so a plain
 * `t(key, "")` on a key the active locale omits returns the zh-CN text (this
 * app falls back to zh-CN everywhere), not "". Pinning `fallbackLng: false`
 * limits the lookup to the active locale, so "" really means "this locale
 * does not define the key". palworld's adapter mirrors this — keep the two in
 * step.
 */
const LOCALE_ONLY = { defaultValue: "", fallbackLng: false } as const;

/** Renders one locale value as GitHub-flavoured markdown. */
function Body({ children }: { children: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Site information and feedback, rendered in three places: the map's right
 * sidebar, the top-bar popover and the mobile More sheet. The QQ group only
 * appears for Chinese locales — the other locales carry their own channel in
 * `siteInfo.contact.content` (Discord for en-US / ko-KR).
 */
export default function SiteInfo({ className }: { className?: string }) {
  const { t, i18n } = useTranslation(["common"]);
  const isZh = (i18n.resolvedLanguage ?? i18n.language ?? "").startsWith("zh");

  const sections: SiteInfoSection[] = [
    {
      title: t("common:siteInfo.title", "About this site"),
      body: <Body>{t("common:siteInfo.body")}</Body>,
    },
  ];

  const contactContent = t("common:siteInfo.contact.content", LOCALE_ONLY);
  const feedbackHint = isZh ? t("common:siteInfo.feedback.hint", LOCALE_ONLY) : "";
  if (contactContent || feedbackHint) {
    sections.push({
      title: t("common:siteInfo.contact.title", "Communication & Contact"),
      body: (
        <>
          {contactContent && <Body>{contactContent}</Body>}
          {/* Also through <Body>: a bare <p> would inherit the panel's text-xs
              while the markdown above renders at prose-sm, putting two
              adjacent paragraphs in one section at two different sizes. */}
          {feedbackHint && <Body>{feedbackHint}</Body>}
        </>
      ),
    });
  }

  return (
    <SiteInfoPanel
      className={className}
      sections={sections}
      feedbackGroup={
        isZh
          ? {
              label: t("common:siteInfo.feedback.label", "QQ"),
              number: FEEDBACK_QQ_GROUP,
              // Generic UI verbs live in the shared `ui` group, not `siteInfo`.
              copyLabel: t("common:ui.copy", "Copy"),
              copiedLabel: t("common:ui.copied", "Copied"),
            }
          : undefined
      }
    />
  );
}
