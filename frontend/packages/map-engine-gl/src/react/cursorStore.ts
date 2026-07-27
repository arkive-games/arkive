// High-frequency map cursor position kept OUT of React state so that pointer
// movement does not re-render `GameMapView` (and with it the effects that own
// the renderer, the layers and the gesture binding). Only the status bar
// subscribes, via `useSyncExternalStore`.
//
// Port of `@gamemap/map-engine`'s `cursorStore.ts`, unchanged apart from the
// coordinate source: the GL view feeds it from the canvas' own pointermove
// (DATA space via `pointToData`) instead of a Leaflet `mousemove`.
//
// A module-level singleton, exactly as in the Leaflet engine: only one map view
// is ever mounted at a time, and the status bar it feeds is that view's own
// child. Two simultaneously mounted views would share the store (the last
// pointer to move wins).
export type CursorPos = { x: number; y: number } | null;

let pos: CursorPos = null;
const subscribers = new Set<() => void>();

export const cursorStore = {
  set(x: number, y: number) {
    pos = { x, y };
    subscribers.forEach((fn) => fn());
  },
  clear() {
    if (pos === null) return;
    pos = null;
    subscribers.forEach((fn) => fn());
  },
  subscribe(fn: () => void) {
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  },
  // Stable reference between updates (required by useSyncExternalStore).
  getSnapshot(): CursorPos {
    return pos;
  },
};
