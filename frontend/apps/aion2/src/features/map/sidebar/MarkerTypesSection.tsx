import { useTranslation } from "react-i18next";
import { useGameMap } from "@/context/GameMapContext";
import MarkerTypes from "./MarkerTypes";

export default function MarkerTypesSection() {
  const { t } = useTranslation(["common"]);
  const { selectedMap } = useGameMap();

  if (!selectedMap) return null;

  return (
    <div className="w-full" data-testid="marker-types-section">
      <div className="flex items-center border-b border-border px-3 py-2.5">
        <span className="truncate text-sm font-bold">
          {t("common:menu.markerDisplay", "Marker display")}
        </span>
      </div>
      <MarkerTypes />
    </div>
  );
}
