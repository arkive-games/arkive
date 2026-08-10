import { useTranslation } from "react-i18next";
import { ShellSidebar } from "@gamemap/map-shell";
import { defineMemoryRecord, isBoolean, memoryPolicy, useMemoryState } from "@gamemap/state-memory";
import SiteInfo from "@/components/SiteInfo";

const collapsedRecord = defineMemoryRecord({
  id: "info-collapsed",
  namespace: "aion2",
  surface: "map",
  ...memoryPolicy.userPreference("reset-map-sidebar"),
  schemaVersion: "1.0.0",
  defaultValue: () => true,
  validate: isBoolean,
  legacyKeys: ["aion2.map.siteInfoCollapsed"],
  migrateLegacy: (raw: string) => raw === "1",
});

/**
 * The map remains the primary surface on first visit, while the compact edge
 * tab keeps site information one click away. A visitor's own choice then wins.
 */
export default function InfoSidebar() {
  const { t } = useTranslation(["common"]);
  const [collapsed, setCollapsed] = useMemoryState(collapsedRecord);
  const label = t("common:siteInfo.tab", "About");

  return (
    <ShellSidebar
      side="right"
      width={304}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      // The tab names what it opens rather than saying "Collapse"/"Expand",
      // which is all a visitor needs to decide whether to click it.
      collapseLabel={label}
      expandLabel={label}
      // Names the <aside> landmark, so screen-reader landmark navigation can
      // tell this sidebar apart from the filter sidebar on the same page.
      label={label}
      classNames={{
        root: "border-l border-border bg-card font-sans text-sm text-card-foreground",
        collapseButton:
          "top-4 border border-r-0 border-border bg-card text-foreground shadow-sm dark:text-white",
        content: "px-4 pt-4",
      }}
    >
      <SiteInfo />
    </ShellSidebar>
  );
}
