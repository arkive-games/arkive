import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useGameMap } from "@/context/GameMapContext";
import { aionAssets } from "@/features/map/aionAssets";
// Type-only, so it erases; the component arrives through the lazy boundary (see
// GlEmbeddedMap) so wiki pages without a map never fetch the engine.
import type { EmbedPin } from "@gamemap/map-engine-gl";
const GameMapEmbed = lazy(() => import("@/features/wiki/GlEmbeddedMap"));
import { loadGameData } from "@/lib/data";
import type { WikiPoi } from "@/types/wiki";

export type EmbeddedPoi = WikiPoi & { label?: string };

type EmbeddedRegion = {
  id: string;
  name: string;
  type: string;
  borders: number[][][];
};

type RegionsDoc = {
  regions: EmbeddedRegion[];
};

type Props = {
  mapName: string;
  pois: EmbeddedPoi[];
  highlightRegionIds?: string[];
  className?: string;
};

/** This embed opens one step further in than the engine's default. */
const MIN_ZOOM = -3;

export default function EmbeddedMap({
  mapName,
  pois,
  highlightRegionIds,
  className,
}: Props) {
  const { t } = useTranslation(["wiki"]);
  const { maps } = useGameMap();
  const map = maps.find((m) => m.name === mapName);
  const highlightRegionKey = useMemo(
    () => (highlightRegionIds ?? []).join(","),
    [highlightRegionIds],
  );
  const [highlightRegions, setHighlightRegions] = useState<EmbeddedRegion[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const ids = highlightRegionKey.split(",").filter(Boolean);
    if (!ids.length) {
      setHighlightRegions([]);
      return;
    }

    const wanted = new Set(ids);
    loadGameData<RegionsDoc>(`data/regions/${mapName}.json`)
      .then((doc) => {
        if (!cancelled) {
          setHighlightRegions(
            doc.regions.filter((region) => wanted.has(region.id)),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setHighlightRegions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [mapName, highlightRegionKey]);

  const highlightRegionRenderKey = highlightRegions
    .map((region) => region.id)
    .join(",");

  // Only the fetched regions are handed over, so every one of them is
  // highlighted — the embed draws nothing for a region that is not.
  const highlightIds = useMemo(
    () => highlightRegions.map((region) => region.id),
    [highlightRegions],
  );

  const pins = useMemo<EmbedPin[]>(
    () =>
      pois.map((p, i) => ({
        id: `poi-${i}`,
        x: p.x,
        y: p.y,
        variant: "pin",
        iconScale: 1,
        tooltip: p.label,
      })),
    [pois],
  );

  if (!map) return null;

  const firstPoi = pois[0];
  const href = `/?map=${encodeURIComponent(map.name)}${
    firstPoi
      ? `&pos=${Math.round(firstPoi.x)},${Math.round(firstPoi.y)}`
      : ""
  }`;

  return (
    <div
      className={`relative isolate overflow-hidden rounded-md border border-border ${className ?? "h-72"}`}
      data-testid="embedded-map"
    >
      {/* Keyed on the content: the regions are fetched AFTER mount, and the fit is
          applied when the GL stack is built, so the key is what re-frames the
          camera onto them once they arrive. */}
      <Suspense fallback={<div className="h-full w-full animate-pulse bg-secondary" />}>
        <GameMapEmbed
          key={`${map.id}:${pois.length}:${highlightRegionKey}:${highlightRegionRenderKey}`}
          map={map}
          assets={aionAssets}
          pins={pins}
          regions={highlightRegions}
          highlightRegionIds={highlightIds}
          minZoom={MIN_ZOOM}
        />
      </Suspense>
      <a
        href={href}
        className="absolute right-2 top-2 z-[var(--arkive-layer-map-control)] rounded-md bg-[color:var(--arkive-action)] px-3 py-2 text-xs font-semibold text-[color:var(--arkive-action-on)] transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="embed-open-full"
      >
        {t("wiki:quest.openInMap")}
      </a>
    </div>
  );
}
