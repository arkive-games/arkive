import React, { useSyncExternalStore } from "react";
import { cursorStore } from "./cursorStore.ts";

type Props = {
  displayCoords: (x: number, y: number) => { x: number; y: number };
  /** `(x, y)` DATA-space → localized subzone name (app-side lookup). */
  subzoneAt: (x: number, y: number) => string;
  footerText?: string;
  pillBg: string;
};

/**
 * Bottom-left footer + live cursor pill — a straight port of the Leaflet
 * engine's `MapStatusBar`, including the `map-coords` test id the e2e suites
 * assert on.
 *
 * It subscribes to {@link cursorStore} itself, so pointer movement re-renders
 * ONLY this component. That matters more here than in the Leaflet engine: a
 * re-render of the GL `GameMapView` re-runs the effects that own the renderer,
 * the layers and the gesture binding.
 */
const MapStatusBar: React.FC<Props> = ({
  displayCoords,
  subzoneAt,
  footerText,
  pillBg,
}) => {
  const pos = useSyncExternalStore(cursorStore.subscribe, cursorStore.getSnapshot);
  const subzone = pos ? subzoneAt(pos.x, pos.y) : "";
  const d = pos ? displayCoords(pos.x, pos.y) : null;

  return (
    <div className="gmgl-statusbar">
      {footerText && (
        <span className="gmgl-statusbar-footer">
          {footerText}
        </span>
      )}
      <div className="gmgl-statusbar-stack" data-map-avoid="">
        <div
          data-testid="map-coords"
          className="gmgl-statusbar-pill"
          style={{ backgroundColor: pillBg }}
        >
          <span className="gmgl-statusbar-coords">
            {d ? `x:${Math.round(d.x)},y:${Math.round(d.y)}` : "x:--,y:--"}
          </span>
          {subzone && <span className="gmgl-statusbar-subzone">{subzone}</span>}
        </div>
      </div>
    </div>
  );
};

export default MapStatusBar;
