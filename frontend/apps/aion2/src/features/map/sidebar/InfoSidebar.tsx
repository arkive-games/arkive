import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShellSidebar } from "@gamemap/map-shell";
import SiteInfo from "@/components/SiteInfo";

const COLLAPSED_KEY = "aion2.siteInfoSidebarCollapsed";

/**
 * Expanded on a first-ever visit so the feedback invite is actually seen, then
 * the visitor's own choice wins forever. Storage lives here rather than in the
 * shell package, which must stay storage-free.
 */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
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
      width={320}
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
        collapseButton: "text-[#3D3D3D] bg-[color:var(--color-sidebar-collapse)]",
        content: "px-3 pt-3",
      }}
    >
      <SiteInfo />
    </ShellSidebar>
  );
}
