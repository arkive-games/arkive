import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArkiveSiteInfo, type ArkiveSiteInfoStrings } from "@gamemap/map-shell";
import { resolveChangelog } from "@gamemap/ui";
import { FEEDBACK_QQ_GROUP } from "@/lib/constants";
import { changelog, SITE_VERSION } from "@/lib/siteVersion";

const LOCALE_ONLY = { defaultValue: "", fallbackLng: false } as const;
const ABOUT_HISTORY_START_VERSION = "1.13.1";

/** Renders game-owned community links as GitHub-flavoured markdown. */
function ContactBody({ children }: { children: string }) {
  return (
    <div className="break-words text-sm leading-relaxed text-muted-foreground [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: label }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default function SiteInfo({ className }: { className?: string }) {
  const { t, i18n } = useTranslation(["common"]);
  const lng = i18n.resolvedLanguage ?? i18n.language ?? "en-US";
  const recentEntries = useMemo(() => resolveChangelog(changelog, lng), [lng]);
  const contactContent = t("common:siteInfo.contact.content", LOCALE_ONLY);
  const strings: ArkiveSiteInfoStrings = {
    aboutTitle: t("common:siteInfo.aboutTitle"),
    introTemplate: t("common:siteInfo.introTemplate"),
    disclaimerTemplate: t("common:siteInfo.disclaimerTemplate"),
    versionTitle: t("common:siteInfo.versionTitle"),
    viewVersionTemplate: t("common:siteInfo.viewVersionTemplate"),
    recentUpdatesTitle: t("common:siteInfo.recentUpdatesTitle"),
    noRecentUpdates: t("common:siteInfo.noRecentUpdates"),
    feedbackTitle: t("common:siteInfo.feedback.title"),
    feedbackHint: t("common:siteInfo.feedback.hint"),
    close: t("common:ui.close", "Close"),
  };

  return (
    <ArkiveSiteInfo
      className={className}
      strings={strings}
      arkiveName={t("common:siteInfo.arkiveName")}
      arkiveHomeUrl="https://tc-imba.com/"
      arkiveHomeLinkProps={{ target: "_blank", rel: "noopener noreferrer" }}
      gameName={t("common:siteInfo.gameName")}
      developerName="NCSOFT"
      version={SITE_VERSION}
      recentEntries={recentEntries}
      historyStartVersion={ABOUT_HISTORY_START_VERSION}
      gameContact={contactContent ? <ContactBody>{contactContent}</ContactBody> : undefined}
      feedbackGroup={{
        label: t("common:siteInfo.feedback.label"),
        number: FEEDBACK_QQ_GROUP,
        copyLabel: t("common:ui.copy", "Copy"),
        copiedLabel: t("common:ui.copied", "Copied"),
      }}
    />
  );
}
