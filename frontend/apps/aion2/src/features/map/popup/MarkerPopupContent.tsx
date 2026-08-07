import React from "react";
import {
  IconBook2,
  IconCheck,
  IconCircleCheckFilled,
  IconMapPin,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent, cn } from "@gamemap/ui";
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
  const canComplete = sub?.canComplete !== false;
  const isCompleted =
    completedBySubtype[marker.subtype]?.has(marker.indexInSubtype) ?? false;
  const iconName = sub?.icon ?? "";
  const iconUrl = iconName && selectedMap ? parseIconUrl(iconName, selectedMap) : "";

  return (
    <Card
      data-testid="marker-popup-card"
      className="gm-popup-card w-[320px] gap-0 overflow-hidden rounded-xl border-0 bg-card py-0 text-card-foreground shadow-[0_18px_50px_rgba(10,50,48,0.22)]"
    >
      <div className="h-1 bg-[color:var(--arkive-orange)]" aria-hidden="true" />
      <CardContent className="flex flex-col px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--arkive-filter-active)] ring-1 ring-[color:var(--arkive-divider)]">
            {iconUrl ? (
              <img src={iconUrl} alt="" className="size-7 object-contain" />
            ) : (
              <IconMapPin className="size-5 text-primary" stroke={1.8} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-snug text-foreground">{name}</h2>
            {metaLine && (
              <p className="mt-1 truncate text-xs font-medium text-muted-foreground">
                {metaLine}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[color:var(--arkive-filter-idle)] px-3 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <IconMapPin className="size-4 text-[color:var(--arkive-orange)]" stroke={1.8} />
            {t("common:markerActions.position", "Position")}
          </span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {Math.round(marker.x)}, {Math.round(marker.y)}
          </span>
        </div>

        {description ? (
          <p className="mt-3 text-sm leading-relaxed text-foreground/85">{description}</p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground/70 italic">
            {t("common:ui.noDescription", "No description")}
          </p>
        )}

        {marker.images?.length ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {marker.images.map((src, index) => (
              <img
                key={`${src}-${index}`}
                src={resolveImage(src)}
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full rounded-lg object-cover ring-1 ring-border"
              />
            ))}
          </div>
        ) : null}

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
      </CardContent>
    </Card>
  );
};

export default MarkerPopupContent;
