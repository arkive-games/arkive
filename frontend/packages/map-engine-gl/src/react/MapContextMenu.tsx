import React from "react";

/** Where the menu opened, in both spaces the menu needs. */
export type ContextMenuState = {
  /** CSS pixels inside the map root (the menu's positioning parent). */
  x: number;
  y: number;
  /** DATA-space coordinates under the pointer. */
  mapX: number;
  mapY: number;
};

type Props = {
  state: ContextMenuState;
  copyPositionLabel: string;
  /** DATA → displayed coordinates (game-native readout). */
  displayCoords: (x: number, y: number) => { x: number; y: number };
  onCopy: (x: number, y: number) => void;
  onClose: () => void;
};

/**
 * The "copy position" context menu. Purely presentational — opening and closing
 * is decided by `GameMapView` (the gesture layer reports `contextmenu`, and any
 * tap or camera movement closes it), exactly as in the Leaflet engine.
 *
 * The displayed and copied numbers both go through `displayCoords` and are
 * rounded the same way, so what the user sees is what lands on the clipboard.
 */
const MapContextMenu: React.FC<Props> = ({
  state,
  copyPositionLabel,
  displayCoords,
  onCopy,
  onClose,
}) => {
  const d = displayCoords(state.mapX, state.mapY);
  return (
    <div
      className="gmgl-context-menu"
      style={{ left: state.x, top: state.y }}
      // The root closes the menu on click; this one must not re-close it before
      // the button's own handler runs.
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="gmgl-context-menu-item"
        onClick={(e) => {
          e.stopPropagation();
          onCopy(d.x, d.y);
          onClose();
        }}
      >
        {copyPositionLabel} ({Math.round(d.x)}, {Math.round(d.y)})
      </button>
    </div>
  );
};

export default MapContextMenu;
