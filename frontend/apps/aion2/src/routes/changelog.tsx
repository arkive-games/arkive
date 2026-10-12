import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { VersionHistory, changelogLabels, resolveChangelog } from "@gamemap/ui";

import ContentLayout from "@/components/ContentLayout";
import { changelog } from "@/lib/siteVersion";

function ChangelogPage() {
  const { t, i18n } = useTranslation("common");
  const lng = i18n.resolvedLanguage ?? "en-US";
  const entries = useMemo(() => resolveChangelog(changelog, lng), [lng]);

  return (
    <ContentLayout pageTitle={t("changelog.title")}>
      <h1 className="mb-6 text-3xl font-bold">{t("changelog.title")}</h1>
      <VersionHistory
        entries={entries}
        labels={changelogLabels(t)}
      />
    </ContentLayout>
  );
}

export const Route = createFileRoute("/changelog")({
  component: ChangelogPage,
});
