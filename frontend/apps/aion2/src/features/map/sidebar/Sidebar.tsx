import { useTranslation } from "react-i18next";
import { ShellSidebar } from "@gamemap/map-shell";
import Logo from "./Logo";
import MarkerTypesSection from "./MarkerTypesSection";
import SelectMap from "./SelectMap";

export default function Sidebar() {
  const { t } = useTranslation(["common"]);

  return (
    <ShellSidebar
      collapseLabel={t("common:menu.collapse", "Collapse")}
      expandLabel={t("common:menu.expand", "Expand")}
      label={t("common:menu.markerTypes", "Marker Types")}
      classNames={{
        root: "border-r border-border bg-[color:var(--arkive-sidebar)] text-foreground",
        scrollArea: "aion2-filter-scroll",
        content: "pb-2",
        collapseButton:
          "border border-l-0 border-border bg-card text-[color:var(--arkive-orange)] shadow-sm",
      }}
      headerSlot={<Logo />}
      mapSelectorSlot={<SelectMap />}
    >
      <MarkerTypesSection />
    </ShellSidebar>
  );
}
