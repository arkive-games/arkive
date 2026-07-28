import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SiteInfoPanel, type SiteInfoSection } from "@gamemap/map-shell";

/**
 * Feedback / suggestions / bug-report group, shared by both sites. Kept in
 * code rather than the locale files: a group number is not a translation.
 */
export const FEEDBACK_QQ_GROUP = "1091411026";

/** Renders one locale value as GitHub-flavoured markdown. */
function Body({ children }: { children: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
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

  const contactContent = t("common:siteInfo.contact.content", "");
  const feedbackHint = isZh ? t("common:siteInfo.feedback.hint", "") : "";
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
