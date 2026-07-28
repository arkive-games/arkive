import { useTranslation } from "react-i18next";
import { ShellSidebar } from "@gamemap/map-shell";
import { useTheme } from "@/context/ThemeContext";
import { getStaticUrl } from "@/lib/url";
import Logo from "./Logo";
import SelectMap from "./SelectMap";
import MarkerTypesSection from "./MarkerTypesSection";

export default function Sidebar() {
  const { t } = useTranslation(["common"]);
  const { realTheme } = useTheme();

  const isLight = realTheme === "light";
  const bgUrl = getStaticUrl(
    isLight ? "images/Sidebar_Light.webp" : "images/Sidebar_Dark.webp",
  );

  return (
    <ShellSidebar
      collapseLabel={t("common:menu.collapse", "Collapse")}
      expandLabel={t("common:menu.expand", "Expand")}
      classNames={{
        root: "text-foreground bg-[image:var(--background-image-sidebar)]",
        collapseButton: "text-[#3D3D3D] bg-[color:var(--color-sidebar-collapse)]",
      }}
      backgroundSlot={
        <div
          className="pointer-events-none absolute inset-0 bg-no-repeat opacity-70"
          style={{
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: "346px auto",
            backgroundPosition: "top left",
          }}
        />
      }
      headerSlot={<Logo />}
      mapSelectorSlot={<SelectMap />}
    >
      <MarkerTypesSection />
    </ShellSidebar>
  );
}
