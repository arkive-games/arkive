import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShellSidebar } from "@gamemap/map-shell";
import SiteInfo from "@/components/SiteInfo";

const COLLAPSED_KEY = "aion2.map.siteInfoCollapsed";

/**
 * The map remains the primary surface on first visit, while the compact edge
 * tab keeps site information one click away. A visitor's own choice then wins.
 */
function readCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored !== null) return stored === "1";
  } catch {
    /* no storage; fall through to the collapsed default */
  }
  return true;
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* no storage */
  }
}

export default function InfoSidebar() {
  const { t } = useTranslation(["common"]);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const label = t("common:siteInfo.tab", "About");

  return (
    <ShellSidebar
      side="right"
      width={304}
      collapsed={collapsed}
      onCollapsedChange={(next) => {
        setCollapsed(next);
        writeCollapsed(next);
      }}
      // The tab names what it opens rather than saying "Collapse"/"Expand",
      // which is all a visitor needs to decide whether to click it.
      collapseLabel={label}
      expandLabel={label}
      // Names the <aside> landmark, so screen-reader landmark navigation can
      // tell this sidebar apart from the filter sidebar on the same page.
      label={label}
      classNames={{
        root: "border-l border-border bg-card text-card-foreground",
        collapseButton:
          "top-4 border border-r-0 border-border bg-card text-[color:var(--arkive-orange)] shadow-sm",
        content: "px-4 pt-4",
      }}
    >
      <SiteInfo />
    </ShellSidebar>
  );
}
