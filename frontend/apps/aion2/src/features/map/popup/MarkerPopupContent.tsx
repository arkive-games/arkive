import React from "react";
import {
  IconBook2,
  IconCheck,
  IconCircleCheckFilled,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MarkerPopupCard } from "@gamemap/map-shell";
import { cn } from "@gamemap/ui";
import { useGameMap } from "@/context/GameMapContext";
import { useMarkers } from "@/context/MarkersContext";
import type { MarkerWithTranslations } from "@/types/game";
import { getStaticUrl, parseIconUrl } from "@/lib/url";

type Props = {
  marker: MarkerWithTranslations;
};

function resolveImage(src: string): string {
  return src.startsWith("http") ? src : getStaticUrl(src);
}

const MarkerPopupContent: React.FC<Props> = ({ marker }) => {
  const { types, selectedMap } = useGameMap();
  const { completedBySubtype, toggleMarkerCompleted } = useMarkers();
  const { t } = useTranslation(["common", "types", "wiki"]);

  const sub = types
    .flatMap((category) => category.subtypes)
    .find((subtype) => subtype.name === marker.subtype);
  const categoryId = sub?.category ?? marker.category;
  const categoryLabel = categoryId
    ? t(`types:categories.${categoryId}.name`, categoryId)
    : "";
  const subtypeLabel = t(`types:subtypes.${marker.subtype}.name`, marker.subtype);
  const fragmentTypeLabel = marker.fragmentType
    ? t(`common:fragmentType.${marker.fragmentType}`)
    : "";
  const metaLine = [categoryLabel, subtypeLabel, fragmentTypeLabel]
    .filter(Boolean)
    .join(" / ");
  const name = marker.localizedName || t("common:markerSearch.unnamed", "Unnamed");
  const description = marker.localizedDescription || "";
  const position = `${Math.round(marker.x)}, ${Math.round(marker.y)}`;
  const canComplete = sub?.canComplete !== false;
  const isCompleted =
    completedBySubtype[marker.subtype]?.has(marker.indexInSubtype) ?? false;
  const iconName = sub?.icon ?? "";
  const iconUrl = iconName && selectedMap ? parseIconUrl(iconName, selectedMap) : "";

  return (
    <MarkerPopupCard
      name={name}
      icon={iconUrl ? <img src={iconUrl} alt="" className="size-7 object-contain" /> : undefined}
      metaLine={metaLine}
      positionLabel={t("common:markerActions.position", "Position")}
      positionValue={position}
      positionCopy={{
        value: position,
        copyLabel: t("common:map.copyPosition", "Copy position"),
        copiedLabel: t("common:ui.copied", "Copied"),
        failedLabel: t("common:ui.copyFailed", "Copy failed"),
      }}
      description={description}
      images={marker.images?.map(resolveImage)}
    >
      {(marker.entity || canComplete) && (
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
          {marker.entity ? (
            <Link
              to="/wiki/$type/$slug"
              params={{
                type: marker.entity.type,
                slug: String(marker.entity.id),
              }}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-primary hover:bg-accent"
              data-testid="popup-wiki-link"
            >
              <IconBook2 className="size-4" stroke={1.8} />
              {t("wiki:nav.wiki")}
            </Link>
          ) : (
            <span />
          )}

          {canComplete && (
            <button
              type="button"
              onClick={() => toggleMarkerCompleted(marker)}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors",
                isCompleted
                  ? "bg-primary text-primary-foreground"
                  : "bg-[color:var(--arkive-filter-active)] text-primary hover:bg-[color:var(--arkive-filter-hover)]",
              )}
              aria-pressed={isCompleted}
            >
              {isCompleted ? (
                <IconCircleCheckFilled className="size-4" />
              ) : (
                <IconCheck className="size-4" stroke={1.8} />
              )}
              {isCompleted
                ? t("common:markerActions.markNotCompleted", "Completed")
                : t("common:markerActions.markCompleted", "Mark as completed")}
            </button>
          )}
        </div>
      )}
    </MarkerPopupCard>
  );
};

export default MarkerPopupContent;
