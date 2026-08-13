import React, { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DomEvent } from "leaflet";
import { useMap, useMapEvents } from "react-leaflet";

import type { GameMapMeta } from "@gamemap/data-contract";
import type { EngineMarker } from "../engineTypes.ts";
import { dataToLatLng } from "../coords.ts";

type Props = {
  map: GameMapMeta;
  marker: EngineMarker | null;
  renderPopupContent: (marker: EngineMarker) => ReactNode;
};

/**
 * Stop the map claiming gestures that belong to the detail surface.
 *
 * This anchor is portalled *into* the Leaflet container, and Leaflet binds
 * natively on that container -- click and drag on `_container`, wheel through the
 * smooth-zoom handler. React's own `stopPropagation` cannot help: React delegates
 * from the app root, which is an ANCESTOR of the map container, so its listener
 * runs after Leaflet's, not before. The `<Popup>` this replaced only behaved
 * because Leaflet calls exactly these two functions on it.
 *
 * Without this, on the Leaflet engine: clicking a tab inside the panel reaches
 * the map's deselect handler and closes the panel, the wheel zooms the map
 * instead of scrolling the panel, and dragging inside it pans the map. The WebGL
 * engine is unaffected because its gestures bind to the canvas.
 */
function detachFromMapGestures(element: HTMLDivElement | null) {
  if (!element) return;
  DomEvent.disableClickPropagation(element);
  DomEvent.disableScrollPropagation(element);
}

const SelectedMarkerPopup: React.FC<Props> = ({ map, marker, renderPopupContent }) => {
  const leafletMap = useMap();
  const markerX = marker?.x;
  const markerY = marker?.y;
  const [screen, setScreen] = useState<{ x: number; y: number } | null>(null);
  const position = useMemo(
    () => markerX != null && markerY != null ? dataToLatLng(map, markerX, markerY) : null,
    [map, markerX, markerY],
  );

  const update = useCallback(() => {
    if (!position) {
      setScreen(null);
      return;
    }
    const point = leafletMap.latLngToContainerPoint(position);
    setScreen((current) => current?.x === point.x && current.y === point.y
      ? current
      : { x: point.x, y: point.y });
  }, [leafletMap, position]);

  useEffect(update, [leafletMap, position]);
  useMapEvents({ move: update, zoom: update, resize: update });
  const pannedMarkerRef = React.useRef<string | null>(null);

  useEffect(() => {
    const container = leafletMap.getContainer();
    const handleDetailPan = (event: Event) => {
      const x = (event as CustomEvent<{ x?: number }>).detail?.x;
      if (!(x && x > 0) || !marker || pannedMarkerRef.current === marker.id) return;
      pannedMarkerRef.current = marker.id;
      leafletMap.panBy([x, 0], { animate: false });
    };
    container.addEventListener("marker-detail-pan", handleDetailPan);
    return () => container.removeEventListener("marker-detail-pan", handleDetailPan);
  }, [leafletMap, marker]);

  useEffect(() => {
    if (!marker) pannedMarkerRef.current = null;
  }, [marker]);

  const content = marker ? renderPopupContent(marker) : null;
  if (!marker || !screen || content == null) return null;

  return createPortal(
    <div
      ref={detachFromMapGestures}
      data-marker-detail-anchor=""
      className="gm-marker-detail-anchor"
      style={{ transform: `translate3d(${Math.round(screen.x)}px, ${Math.round(screen.y)}px, 0)` }}
    >
      {content}
    </div>,
    leafletMap.getContainer(),
  );
};

export default SelectedMarkerPopup;
