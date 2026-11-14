import { useMapSession } from '@gamemap/state-memory';
import { useGameMap } from '@/context/GameMapContext';
import { useMarkers } from '@/context/MarkersContext';
import { aionMapSession } from '../mapSession';
import { useTranslation } from "react-i18next";
import { ShellSidebar } from "@gamemap/map-shell";
import Logo from "./Logo";
import MarkerTypesSection from "./MarkerTypesSection";
import SelectMap from "./SelectMap";

export default function Sidebar() {
  const { t } = useTranslation(["common"]);
  const { selectedMap } = useGameMap();
  const { markersMapId } = useMarkers();
  const session = useMapSession(aionMapSession, selectedMap?.id ?? "");

  return (
    <ShellSidebar
      width={320}
      collapsed={session.collapsed}
      onCollapsedChange={session.setCollapsed}
      scrollMemory={{ ...session.scrollMemory, ready: !session.collapsed && Boolean(selectedMap) && markersMapId === selectedMap?.id }}
      collapseLabel={t("common:menu.collapse", "Collapse")}
      expandLabel={t("common:menu.expand", "Expand")}
      label={t("common:menu.markerTypes", "Marker Types")}
      classNames={{
        root: "border-r border-border bg-[color:var(--arkive-sidebar)] font-sans text-sm text-foreground",
        scrollArea: "aion2-filter-scroll",
        content: "pb-2",
        collapseButton:
          "top-4 border border-l-0 border-border bg-card text-foreground shadow-sm dark:text-white",
      }}
      headerSlot={<Logo />}
      mapSelectorSlot={<SelectMap />}
    >
      <MarkerTypesSection />
    </ShellSidebar>
  );
}
