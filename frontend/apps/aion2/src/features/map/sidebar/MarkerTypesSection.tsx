import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { useGameMap } from "@/context/GameMapContext";
import MarkerTypes from "./MarkerTypes";

/**
 * The "Marker Types" heading plus the filter panel. Rendered by the desktop
 * sidebar AND by the mobile filter sheet, so the two cannot drift apart.
 * Returns null until a map is selected (the counts come from its markers).
 */
export default function MarkerTypesSection() {
  const { t } = useTranslation(["common"]);
  const { selectedMap } = useGameMap();

  if (!selectedMap) return null;

  return (
    <div className="w-full" data-testid="marker-types-section">
      {/* Static section header — no longer collapsible. */}
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="flex h-4 w-4 items-center justify-center">
          <Sparkles className="h-3.5 w-3.5 fill-primary text-primary" />
        </span>
        <span className="truncate text-base font-bold leading-[16px]">
          {t("common:menu.markerTypes", "Marker Types")}
        </span>
      </div>
      <MarkerTypes />
    </div>
  );
}
