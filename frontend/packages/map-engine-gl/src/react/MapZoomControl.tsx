import React from "react";
import { IconMinus, IconPlus } from "@tabler/icons-react";

/**
 * Lanhu-style +/− zoom pill, pinned bottom-right inside the map. Same markup and
 * same labels as the Leaflet engine's `MapZoomControl`; only the wiring differs —
 * it calls back instead of reaching for a Leaflet map, because the GL view owns
 * the camera.
 */
type Props = {
  glyphColor: string;
  zoomInLabel: string;
  zoomOutLabel: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

const MapZoomControl: React.FC<Props> = ({
  glyphColor,
  zoomInLabel,
  zoomOutLabel,
  onZoomIn,
  onZoomOut,
}) => (
  <div className="gmgl-zoom" data-map-avoid="">
    <div className="gmgl-zoom-pill">
      <button
        type="button"
        aria-label={zoomInLabel}
        onClick={onZoomIn}
        className="gmgl-zoom-btn"
        style={{ color: glyphColor }}
      >
        <IconPlus className="size-4" stroke={1.8} aria-hidden />
      </button>
      <div className="gmgl-zoom-divider" />
      <button
        type="button"
        aria-label={zoomOutLabel}
        onClick={onZoomOut}
        className="gmgl-zoom-btn"
        style={{ color: glyphColor }}
      >
        <IconMinus className="size-4" stroke={1.8} aria-hidden />
      </button>
    </div>
  </div>
);

export default MapZoomControl;
