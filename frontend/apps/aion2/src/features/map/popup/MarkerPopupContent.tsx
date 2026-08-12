import React, { useMemo, useState } from "react";
import { IconBook2 } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { EngineMarker } from "@gamemap/map-engine";
import { MarkerDetailDrawer, markerDetailLabelsFor } from "@gamemap/map-shell";
import { useGameMap } from "@/context/GameMapContext";
import { useMarkers } from "@/context/MarkersContext";
import { getStaticUrl, parseIconUrl } from "@/lib/url";

type Props = {
  marker: EngineMarker;
  onClose: () => void;
  anchored?: boolean;
};

function resolveImage(src: string): string {
  return src.startsWith("http") ? src : getStaticUrl(src);
}

const MarkerPopupContent: React.FC<Props> = ({ marker, onClose, anchored = false }) => {
  const { types, selectedMap } = useGameMap();
  const { completedBySubtype, toggleMarkerCompleted } = useMarkers();
  const { t, i18n } = useTranslation(["common", "types"]);
  const [commentSort, setCommentSort] = useState<"popular" | "latest">("popular");

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
  const canComplete = marker.subtypeMeta?.canComplete !== false;
  const isCompleted =
    completedBySubtype[marker.subtype]?.has(marker.indexInSubtype) ?? false;
  const iconName = sub?.icon ?? "";
  const iconUrl = iconName && selectedMap ? parseIconUrl(iconName, selectedMap) : "";

  const labels = useMemo(
    () => markerDetailLabelsFor(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );

  return (
    <MarkerDetailDrawer
      name={name}
      icon={iconUrl ? <img src={iconUrl} alt="" className="size-7 object-contain" /> : undefined}
      eyebrow={metaLine}
      positionValue={position}
      positionCopyValue={position}
      description={description}
      gallery={{
        markerId: marker.id,
        images: (marker.images ?? []).map((src, index) => ({
          id: `${marker.id}-image-${index}`,
          markerId: marker.id,
          url: resolveImage(src),
          alt: name,
          moderationStatus: "published" as const,
        })),
      }}
      comments={{ markerId: marker.id, items: [], sort: commentSort, onSortChange: setCommentSort }}
      completeAction={canComplete ? {
        completed: isCompleted,
        label: t("common:markerActions.markCompleted", "Mark as completed"),
        completedLabel: t("common:markerActions.markNotCompleted", "Completed"),
        onToggle: () => toggleMarkerCompleted(marker),
      } : undefined}
      labels={labels}
      onClose={onClose}
      anchored={anchored}
    >
      {marker.entity ? (
        <div className="border-b border-border bg-card px-3 py-2">
          <Link
            to="/wiki/$type/$slug"
            params={{ type: marker.entity.type, slug: String(marker.entity.id) }}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-primary hover:bg-accent"
            data-testid="popup-wiki-link"
          >
            <IconBook2 className="size-4" stroke={1.8} />
            {t("common:nav.wiki")}
          </Link>
        </div>
      ) : null}
    </MarkerDetailDrawer>
  );
};

export default MarkerPopupContent;
