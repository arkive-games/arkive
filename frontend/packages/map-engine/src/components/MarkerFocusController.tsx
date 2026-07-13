import React, { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { GameMapMeta } from "@gamemap/data-contract";
import type { EngineMarker } from "../engineTypes.ts";
import { dataToLatLng } from "../coords.ts";

type MarkerFocusControllerProps = {
  map: GameMapMeta;
  markersById: ReadonlyMap<string, EngineMarker>;
  selectedMarkerId: string | null | undefined;
  selectedPosition: { x: number; y: number } | null | undefined;
  /** Duration (seconds) of the fly-to animation. */
  flyToDuration: number;
  /** One-shot: skip the first fly for this id (restored selection). */
  suppressInitialFlyForId?: string | null;
};

/**
 * Flies the map to the selected marker / search result. Navigation only — it
 * deliberately renders NO pin: the old focus pin was permanent and had no way
 * to be dismissed, so it just accumulated on every search click.
 */
const MarkerFocusController: React.FC<MarkerFocusControllerProps> = ({
  map,
  markersById,
  selectedMarkerId,
  selectedPosition,
  flyToDuration,
  suppressInitialFlyForId,
}) => {
  const leafletMap = useMap();

  // Whether the one-shot suppression has been consumed. A restored selection
  // (selection set programmatically right after the map mounts at a restored
  // view) must NOT fly — flying would recenter on the marker and stomp the
  // restored position. Any later selection of the same id flies normally.
  // Re-arms whenever the suppress id changes: the app clears it when the
  // markers reload and sets it again on re-restore (e.g. a locale switch), so
  // each restore gets its own suppressed first fly.
  const suppressConsumedRef = useRef(false);
  useEffect(() => {
    suppressConsumedRef.current = false;
  }, [suppressInitialFlyForId]);

  // Key the fly-to on the selected marker's COORDS, not the marker object or
  // the lookup map: `EngineMarker`s are rebuilt whenever app-side state (e.g.
  // completion) changes, and re-running on that would fly the map back to the
  // marker mid-interaction.
  const marker = selectedMarkerId ? markersById.get(selectedMarkerId) : undefined;
  const markerX = marker?.x;
  const markerY = marker?.y;

  useEffect(() => {
    if (!leafletMap || !selectedMarkerId) return;
    if (markerX == null || markerY == null) return;

    if (
      !suppressConsumedRef.current &&
      suppressInitialFlyForId != null &&
      selectedMarkerId === suppressInitialFlyForId
    ) {
      suppressConsumedRef.current = true;
      return;
    }

    // DATA (image-space) → Leaflet LatLng with the single vertical flip.
    const latLng = dataToLatLng(map, markerX, markerY);

    leafletMap.flyTo(latLng, leafletMap.getZoom(), { duration: flyToDuration });
    // suppressInitialFlyForId is read, not reacted to: its arrival alone must
    // not re-run (and thus trigger) a fly for the already-selected marker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletMap, selectedMarkerId, markerX, markerY, map, flyToDuration]);

  useEffect(() => {
    if (!leafletMap || !selectedPosition) return;
    const latLng = dataToLatLng(map, selectedPosition.x, selectedPosition.y);
    leafletMap.flyTo(latLng, leafletMap.getZoom(), { duration: flyToDuration });
  }, [leafletMap, selectedPosition, map, flyToDuration]);

  return null;
};

export default MarkerFocusController;
