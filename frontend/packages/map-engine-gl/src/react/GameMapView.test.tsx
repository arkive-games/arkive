// @vitest-environment jsdom
import { createRef } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameMapMeta } from "@gamemap/data-contract";

import type { MapAssets } from "../core/assets.ts";
import type { RenderBackend } from "../core/renderer.ts";
import GameMapView from "./GameMapView.tsx";
import type { EngineMarker, GameMapViewProps, GlMapRef } from "./engineTypes.ts";
import { MIN_ZOOM, POPUP_OFFSET_Y } from "./mapEngine.ts";
import { setRenderBackendFactory } from "./renderBackend.ts";

/**
 * Component tests for the GL view.
 *
 * WebGL does not exist in jsdom, so the backend is injected
 * ({@link setRenderBackendFactory}) — the real camera, the real renderer
 * scheduler, the real layers, the real gesture binding and the real DOM overlay
 * all run; only the GL calls are recorded instead of executed. `getContext` is
 * stubbed to null so the pin atlas and the tile loader take their no-context
 * paths silently (they still produce atlas ENTRIES, so hit-testing is exercised
 * for real).
 *
 * jsdom has no layout, so `clientWidth`/`clientHeight` are stubbed to give the
 * camera a viewport. `offsetWidth`/`offsetHeight` stay 0 by default; the popup
 * auto-pan regression test temporarily supplies measured dimensions.
 */

const VIEWPORT = { width: 800, height: 600 };

/** 1024×1024 pixel grid, no worldBounds → DATA space IS pixel space. */
const MAP: GameMapMeta = {
  id: "TestMap",
  name: "Test Map",
  type: "world",
  tileWidth: 256,
  tileHeight: 256,
  tilesCountX: 4,
  tilesCountY: 4,
  isVisible: true,
};

const ASSETS: MapAssets = {
  tileUrl: (map, x, y) => `tiles/${map.id}/${x}_${y}.webp`,
  markerIconUrl: (icon) => `icons/${icon ?? "none"}.webp`,
};

interface RecordingBackend extends RenderBackend {
  renders: number;
  disposals: number;
}

let backend: RecordingBackend;
let restoreBackend: () => void;

function createRecordingBackend(): RecordingBackend {
  return {
    renders: 0,
    disposals: 0,
    setPixelRatio() {},
    setSize() {},
    render() {
      this.renders += 1;
    },
    dispose() {
      this.disposals += 1;
    },
  };
}

function makeMarker(over: Partial<EngineMarker> & { id: string }): EngineMarker {
  return {
    subtype: "fastTravel",
    x: 0,
    y: 0,
    images: [],
    contributors: [],
    indexInSubtype: 0,
    localizedName: "",
    subtypeLabel: "",
    ...over,
  };
}

type Overrides = Partial<GameMapViewProps>;

function baseProps(over: Overrides = {}): GameMapViewProps {
  return {
    map: MAP,
    markers: [],
    regions: [],
    visibleSubtypes: new Set(["fastTravel"]),
    showLabels: false,
    showBorders: false,
    lodEnabled: false,
    selectedMarkerId: null,
    selectedPosition: null,
    onToggleMarker: vi.fn(),
    subzoneAt: () => "Zone",
    flyToDuration: 0,
    mapRef: createRef<GlMapRef>(),
    assets: ASSETS,
    renderPopupContent: (m) => <div className="gm-popup-card">{m.localizedName}</div>,
    ...over,
  };
}

/** `window.__glMap`, which `exposeTestHandle` publishes. */
function handle(): GlMapRef {
  const found = (window as unknown as { __glMap?: GlMapRef }).__glMap;
  if (!found) throw new Error("window.__glMap is missing");
  return found;
}

/**
 * jsdom implements no `PointerEvent`, so pointer events are `MouseEvent`s with a
 * `pointerId` bolted on — which is exactly the structural subset
 * `core/gestures.ts` declares it needs.
 */
function pointer(type: string, x: number, y: number, buttons = 1): Event {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    buttons,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

/** A tap: press and release at the same spot. */
function tap(canvas: HTMLElement, x: number, y: number): void {
  act(() => {
    canvas.dispatchEvent(pointer("pointerdown", x, y));
    canvas.dispatchEvent(pointer("pointerup", x, y, 0));
  });
}

function canvasOf(container: HTMLElement): HTMLElement {
  const canvas = container.querySelector<HTMLElement>('[data-testid="gl-map-canvas"]');
  if (!canvas) throw new Error("canvas not rendered");
  return canvas;
}

/** Let jsdom's (timer-backed) requestAnimationFrame run for a while. */
async function flushFrames(ms = 50): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

beforeAll(() => {
  // No 2D context in jsdom either; null is the documented "cannot draw" path for
  // both the pin atlas and the tile loader, and it keeps the console quiet.
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  for (const prototype of [HTMLDivElement.prototype, HTMLCanvasElement.prototype]) {
    Object.defineProperty(prototype, "clientWidth", {
      configurable: true,
      get: () => VIEWPORT.width,
    });
    Object.defineProperty(prototype, "clientHeight", {
      configurable: true,
      get: () => VIEWPORT.height,
    });
  }
});

beforeEach(() => {
  backend = createRecordingBackend();
  restoreBackend = setRenderBackendFactory(() => backend);
});

afterEach(() => {
  cleanup();
  restoreBackend();
  delete (window as unknown as { __glMap?: GlMapRef }).__glMap;
});

describe("empty state", () => {
  it("renders the label and no canvas when no map is selected", () => {
    const { container } = render(
      <GameMapView {...baseProps({ map: undefined, labels: {
        copyPosition: "Copy",
        noMapSelected: "Pick a map",
        zoomIn: "In",
        zoomOut: "Out",
      } })} />,
    );
    expect(container.textContent).toContain("Pick a map");
    expect(container.querySelector('[data-testid="gl-map-canvas"]')).toBeNull();
  });
});

describe("initialView", () => {
  it("opens at the stored view and reports it once on mount", () => {
    const onViewChange = vi.fn();
    render(
      <GameMapView
        {...baseProps({
          initialView: { x: 100, y: 200, zoom: 1 },
          onViewChange,
          exposeTestHandle: true,
        })}
      />,
    );
    expect(handle().getCenter()).toEqual({ x: 100, y: 200 });
    expect(handle().getZoom()).toBe(1);
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith({ x: 100, y: 200, zoom: 1 });
  });

  it("clamps an out-of-range stored view into the map and the zoom range", () => {
    render(
      <GameMapView
        {...baseProps({
          initialView: { x: -500, y: 99999, zoom: 99 },
          exposeTestHandle: true,
        })}
      />,
    );
    expect(handle().getCenter()).toEqual({ x: 0, y: 1024 });
    expect(handle().getZoom()).toBe(2);
  });

  it("falls back to the whole map at min zoom for a non-finite stored view", () => {
    render(
      <GameMapView
        {...baseProps({
          initialView: { x: Number.NaN, y: 5, zoom: 0 },
          exposeTestHandle: true,
        })}
      />,
    );
    expect(handle().getCenter()).toEqual({ x: 512, y: 512 });
    expect(handle().getZoom()).toBe(MIN_ZOOM);
  });

  it("is read ONCE: a later change is ignored", () => {
    const props = baseProps({
      initialView: { x: 100, y: 200, zoom: 1 },
      exposeTestHandle: true,
    });
    const { rerender } = render(<GameMapView {...props} />);
    rerender(<GameMapView {...props} initialView={{ x: 900, y: 900, zoom: 2 }} />);
    expect(handle().getCenter()).toEqual({ x: 100, y: 200 });
    expect(handle().getZoom()).toBe(1);
  });
});

describe("onViewChange", () => {
  it("fires on flyend and coalesces a repeat of the same view", () => {
    const onViewChange = vi.fn();
    render(<GameMapView {...baseProps({ onViewChange, exposeTestHandle: true })} />);
    expect(onViewChange).toHaveBeenCalledTimes(1);

    act(() => handle().flyTo(300, 400, undefined, 0));
    expect(onViewChange).toHaveBeenCalledTimes(2);
    expect(onViewChange).toHaveBeenLastCalledWith({ x: 300, y: 400, zoom: MIN_ZOOM });

    // Same destination again: the view did not change, so nothing is reported.
    act(() => handle().flyTo(300, 400, undefined, 0));
    expect(onViewChange).toHaveBeenCalledTimes(2);
  });

  it("fires once at the end of a wheel-zoom gesture", () => {
    vi.useFakeTimers();
    try {
      const onViewChange = vi.fn();
      const { container } = render(
        <GameMapView {...baseProps({ onViewChange, exposeTestHandle: true })} />,
      );
      onViewChange.mockClear();
      const canvas = canvasOf(container);
      act(() => {
        canvas.dispatchEvent(
          new WheelEvent("wheel", { deltaY: -100, clientX: 400, clientY: 300, bubbles: true }),
        );
      });
      // The gesture ends 200 ms after the last wheel event (Leaflet's idle window).
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(onViewChange).toHaveBeenCalledTimes(1);
      expect(onViewChange.mock.calls[0][0].zoom).toBeGreaterThan(MIN_ZOOM);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("fly-to controller", () => {
  const marker = makeMarker({ id: "m1", x: 200, y: 300, localizedName: "Alpha" });

  it("flies to the selected marker", () => {
    render(
      <GameMapView
        {...baseProps({
          markers: [marker],
          selectedMarkerId: "m1",
          exposeTestHandle: true,
        })}
      />,
    );
    expect(handle().getCenter()).toEqual({ x: 200, y: 300 });
  });

  it("does NOT re-fly when the same marker is rebuilt with new state", () => {
    const props = baseProps({
      markers: [marker],
      selectedMarkerId: "m1",
      exposeTestHandle: true,
    });
    const { rerender } = render(<GameMapView {...props} />);
    act(() => handle().flyTo(600, 600, undefined, 0));
    expect(handle().getCenter()).toEqual({ x: 600, y: 600 });

    // A completion toggle rebuilds the marker object; the coords are unchanged, so
    // the fly must NOT run again.
    rerender(
      <GameMapView {...props} markers={[{ ...marker, completed: true }]} />,
    );
    expect(handle().getCenter()).toEqual({ x: 600, y: 600 });

    // Moving the marker DOES fly.
    rerender(<GameMapView {...props} markers={[{ ...marker, x: 250, y: 350 }]} />);
    expect(handle().getCenter()).toEqual({ x: 250, y: 350 });
  });

  it("flies to selectedPosition", () => {
    const props = baseProps({ exposeTestHandle: true });
    const { rerender } = render(<GameMapView {...props} />);
    rerender(<GameMapView {...props} selectedPosition={{ x: 700, y: 100 }} />);
    expect(handle().getCenter()).toEqual({ x: 700, y: 100 });
  });

  it("honours suppressInitialFlyForId as a one-shot that re-arms per id", () => {
    const second = makeMarker({ id: "m2", x: 400, y: 450, localizedName: "Beta" });
    const props = baseProps({
      markers: [marker, second],
      selectedMarkerId: "m1",
      suppressInitialFlyForId: "m1",
      exposeTestHandle: true,
    });
    const { rerender } = render(<GameMapView {...props} />);
    // Suppressed: still on the default whole-map view.
    expect(handle().getCenter()).toEqual({ x: 512, y: 512 });

    // Re-selecting the same marker flies: the one-shot is spent.
    rerender(<GameMapView {...props} selectedMarkerId={null} />);
    rerender(<GameMapView {...props} selectedMarkerId="m1" />);
    expect(handle().getCenter()).toEqual({ x: 200, y: 300 });

    // A NEW suppression id re-arms the one-shot.
    rerender(
      <GameMapView {...props} selectedMarkerId={null} suppressInitialFlyForId="m2" />,
    );
    rerender(
      <GameMapView {...props} selectedMarkerId="m2" suppressInitialFlyForId="m2" />,
    );
    expect(handle().getCenter()).toEqual({ x: 200, y: 300 });
  });
});

describe("selection by tap", () => {
  const marker = makeMarker({ id: "m1", x: 200, y: 300, localizedName: "Alpha" });

  it("selects the marker under the tap and deselects on the background", () => {
    const onToggleMarker = vi.fn();
    const { container } = render(
      <GameMapView
        {...baseProps({ markers: [marker], onToggleMarker, exposeTestHandle: true })}
      />,
    );
    const canvas = canvasOf(container);
    const at = handle().project(200, 300);

    tap(canvas, at.sx, at.sy);
    expect(onToggleMarker).toHaveBeenCalledWith("m1");

    onToggleMarker.mockClear();
    // Far from the marker AND far enough from the previous tap not to be read as
    // a double tap (which is a zoom, and reports no tap at all).
    tap(canvas, at.sx + 200, at.sy + 200);
    expect(onToggleMarker).toHaveBeenCalledWith(null);
  });
});

describe("map switch", () => {
  it("rebuilds the engine and re-pushes props that did not change identity", () => {
    const marker = makeMarker({ id: "m1", x: 200, y: 300, localizedName: "Alpha" });
    const onToggleMarker = vi.fn();
    // The SAME Set object across the switch: the filter effect must still push it
    // into the freshly built engine, or nothing would be visible.
    const props = baseProps({
      markers: [marker],
      visibleSubtypes: new Set(["fastTravel"]),
      onToggleMarker,
      exposeTestHandle: true,
    });
    const { container, rerender } = render(<GameMapView {...props} />);

    rerender(<GameMapView {...props} map={{ ...MAP, id: "OtherMap" }} />);
    expect(backend.disposals).toBe(1);

    const canvas = canvasOf(container);
    const at = handle().project(200, 300);
    tap(canvas, at.sx, at.sy);
    expect(onToggleMarker).toHaveBeenCalledWith("m1");
  });
});

describe("selected popup", () => {
  it("mounts the app card and anchors it above the marker", () => {
    // The marker fixture is alone on its coordinate, so its fanned position is
    // its projected position.
    const marker = makeMarker({ id: "m1", x: 200, y: 300, localizedName: "Alpha" });
    const props = baseProps({
      markers: [marker],
      // A stored view keeps the marker away from the exact viewport centre.
      initialView: { x: 512, y: 512, zoom: 0 },
      suppressInitialFlyForId: "m1",
      exposeTestHandle: true,
    });
    const { container, rerender } = render(<GameMapView {...props} />);
    expect(container.querySelector(".gmgl-popup")).toBeNull();

    rerender(<GameMapView {...props} selectedMarkerId="m1" />);
    const popup = container.querySelector<HTMLElement>(".gmgl-popup");
    expect(popup?.querySelector(".gm-popup-card")?.textContent).toBe("Alpha");
    const at = handle().project(200, 300);
    expect(popup?.style.transform).toBe(
      `translate3d(${at.sx}px, ${at.sy - POPUP_OFFSET_Y}px, 0) translate(-50%, -100%)`,
    );

    // Deselecting removes it — selection is the only source of truth (no close
    // button, no close-on-click).
    rerender(<GameMapView {...props} selectedMarkerId={null} />);
    expect(container.querySelector(".gmgl-popup")).toBeNull();
  });

  it("auto-pans again after a programmatic fly recentres an open popup", () => {
    const widthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetWidth",
    );
    const heightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight",
    );
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get: () => 320,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => 450,
    });

    try {
      const marker = makeMarker({ id: "m1", x: 512, y: 512, localizedName: "Alpha" });
      render(
        <GameMapView
          {...baseProps({
            markers: [marker],
            selectedMarkerId: "m1",
            suppressInitialFlyForId: "m1",
            initialView: { x: 512, y: 512, zoom: 0 },
            exposeTestHandle: true,
          })}
        />,
      );

      const autoPannedCenter = handle().getCenter();
      expect(autoPannedCenter.y).toBeLessThan(512);
      const popup = document.querySelector<HTMLElement>(".gmgl-popup");
      const initialAnchor = handle().project(512, 512);
      expect(popup?.style.transform).toBe(
        `translate3d(${initialAnchor.sx}px, ${initialAnchor.sy - POPUP_OFFSET_Y}px, 0) translate(-50%, -100%)`,
      );

      act(() => handle().flyTo(512, 512, undefined, 0));
      expect(handle().getCenter()).toEqual(autoPannedCenter);
      const finalAnchor = handle().project(512, 512);
      expect(popup?.style.transform).toBe(
        `translate3d(${finalAnchor.sx}px, ${finalAnchor.sy - POPUP_OFFSET_Y}px, 0) translate(-50%, -100%)`,
      );
    } finally {
      if (widthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "offsetWidth", widthDescriptor);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
      }
      if (heightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", heightDescriptor);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
      }
    }
  });
});

describe("hover tooltip", () => {
  it("reports marker hover transitions without repeating the same id", async () => {
    const marker = makeMarker({ id: "m1", x: 200, y: 300, localizedName: "Alpha" });
    const onHoverMarker = vi.fn();
    const { container } = render(
      <GameMapView
        {...baseProps({ markers: [marker], onHoverMarker, exposeTestHandle: true })}
      />,
    );
    const canvas = canvasOf(container);
    const at = handle().project(200, 300);

    act(() => {
      canvas.dispatchEvent(pointer("pointermove", at.sx, at.sy, 0));
    });
    await flushFrames();
    expect(onHoverMarker).toHaveBeenCalledTimes(1);
    expect(onHoverMarker).toHaveBeenLastCalledWith("m1");

    act(() => {
      canvas.dispatchEvent(pointer("pointermove", at.sx + 1, at.sy + 1, 0));
    });
    await flushFrames();
    expect(onHoverMarker).toHaveBeenCalledTimes(1);

    act(() => {
      canvas.dispatchEvent(pointer("pointermove", at.sx + 200, at.sy + 200, 0));
    });
    await flushFrames();
    expect(onHoverMarker).toHaveBeenLastCalledWith(null);
  });

  it("shows the marker's name chain and nothing for the selected marker", async () => {
    const markers = [
      makeMarker({ id: "m1", x: 200, y: 300, localizedName: "", name: "Raw Name" }),
    ];
    const props = baseProps({ markers, exposeTestHandle: true });
    const { container, rerender } = render(<GameMapView {...props} />);
    const canvas = canvasOf(container);
    const at = handle().project(200, 300);

    act(() => {
      canvas.dispatchEvent(pointer("pointermove", at.sx, at.sy, 0));
    });
    await flushFrames();
    const tooltip = container.querySelector<HTMLElement>(".gmgl-tooltip");
    expect(tooltip?.textContent).toBe("Raw Name");

    // The selected marker has a popup instead.
    rerender(<GameMapView {...props} selectedMarkerId="m1" />);
    act(() => {
      canvas.dispatchEvent(pointer("pointermove", at.sx, at.sy, 0));
    });
    await flushFrames();
    expect(container.querySelector<HTMLElement>(".gmgl-tooltip")?.style.display).toBe(
      "none",
    );
  });
});

describe("permanent labels", () => {
  it("mounts one node per visible named marker only when showLabels is on", async () => {
    const markers = [
      makeMarker({ id: "m1", x: 200, y: 300, localizedName: "Alpha" }),
      makeMarker({ id: "m2", x: 260, y: 340, localizedName: "Beta" }),
      makeMarker({
        id: "m3",
        x: 300,
        y: 380,
        localizedName: "Quiet",
        subtypeMeta: { id: "s", name: "fastTravel", hideTooltip: true },
      }),
    ];
    const props = baseProps({ markers, showLabels: false, exposeTestHandle: true });
    const { container, rerender } = render(<GameMapView {...props} />);
    await flushFrames();
    expect(container.querySelectorAll(".gmgl-label").length).toBe(0);

    rerender(<GameMapView {...props} showLabels />);
    await flushFrames();
    const texts = [...container.querySelectorAll<HTMLElement>(".gmgl-label")]
      .filter((n) => n.style.display !== "none")
      .map((n) => n.textContent);
    expect(texts).toEqual(["Alpha", "Beta"]);
  });
});

describe("cursor status bar", () => {
  it("updates the readout without re-rendering the map view", async () => {
    let popupRenders = 0;
    const marker = makeMarker({ id: "m1", x: 200, y: 300, localizedName: "Alpha" });
    const { container, getByTestId } = render(
      <GameMapView
        {...baseProps({
          markers: [marker],
          selectedMarkerId: "m1",
          exposeTestHandle: true,
          // Called from GameMapView's own render, so it counts ITS renders.
          renderPopupContent: (m) => {
            popupRenders += 1;
            return <div className="gm-popup-card">{m.localizedName}</div>;
          },
        })}
      />,
    );
    const canvas = canvasOf(container);
    const rendersAfterMount = popupRenders;
    expect(rendersAfterMount).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) {
      act(() => {
        canvas.dispatchEvent(pointer("pointermove", 100 + i, 200 + i, 0));
      });
    }
    await flushFrames();

    // The pill moved…
    expect(getByTestId("map-coords").textContent).toMatch(/x:-?\d+,y:-?\d+/);
    expect(getByTestId("map-coords").textContent).not.toContain("--");
    // …and the map view did not re-render once.
    expect(popupRenders).toBe(rendersAfterMount);
  });
});

describe("context menu", () => {
  it("copies the displayed position and closes", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { container, getByRole } = render(
      <GameMapView
        {...baseProps({
          exposeTestHandle: true,
          // Doubling makes an identity transform impossible to mistake for a pass.
          displayCoords: (x, y) => ({ x: x * 2, y: y * 2 }),
          labels: {
            copyPosition: "Copy position",
            noMapSelected: "none",
            zoomIn: "In",
            zoomOut: "Out",
          },
        })}
      />,
    );
    const canvas = canvasOf(container);
    act(() => {
      canvas.dispatchEvent(
        new MouseEvent("contextmenu", {
          clientX: 100,
          clientY: 200,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    // Screen (100, 200) at centre (512,512)/zoom -3 → DATA (-1888, -288), doubled.
    const button = getByRole("button", { name: /Copy position/ });
    expect(button.textContent).toBe("Copy position (-3776, -576)");

    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledWith("-3776, -576");
    expect(container.querySelector(".gmgl-context-menu")).toBeNull();
  });

  it("closes when the camera moves", () => {
    const { container } = render(<GameMapView {...baseProps({ exposeTestHandle: true })} />);
    const canvas = canvasOf(container);
    act(() => {
      canvas.dispatchEvent(
        new MouseEvent("contextmenu", { clientX: 100, clientY: 200, bubbles: true }),
      );
    });
    expect(container.querySelector(".gmgl-context-menu")).not.toBeNull();
    act(() => handle().flyTo(700, 700, undefined, 0));
    expect(container.querySelector(".gmgl-context-menu")).toBeNull();
  });
});

describe("zoom control", () => {
  it("steps the zoom by 0.25", async () => {
    const { getByRole } = render(
      <GameMapView
        {...baseProps({
          initialView: { x: 512, y: 512, zoom: 0 },
          exposeTestHandle: true,
          labels: {
            copyPosition: "Copy",
            noMapSelected: "none",
            zoomIn: "Zoom in",
            zoomOut: "Zoom out",
          },
        })}
      />,
    );
    fireEvent.click(getByRole("button", { name: "Zoom in" }));
    // The step is animated over 0.25 s, so give the frame loop time to land it.
    await flushFrames(500);
    expect(handle().getZoom()).toBeCloseTo(0.25, 5);
  });
});

describe("test handle", () => {
  it("exposes the documented shape on the window and on mapRef", () => {
    const mapRef = createRef<GlMapRef>();
    render(<GameMapView {...baseProps({ mapRef, exposeTestHandle: true })} />);
    const api = handle();
    expect(Object.keys(api).sort()).toEqual([
      "dispose",
      "flyTo",
      "getCenter",
      "getZoom",
      "project",
    ]);
    expect(mapRef.current).toBe(api);
    // Centre of the map projects to the centre of the viewport.
    expect(api.project(512, 512)).toEqual({ sx: 400, sy: 300 });
  });

  it("stays off the window unless exposeTestHandle is set", () => {
    const mapRef = createRef<GlMapRef>();
    render(<GameMapView {...baseProps({ mapRef })} />);
    expect((window as unknown as { __glMap?: GlMapRef }).__glMap).toBeUndefined();
    expect(mapRef.current).not.toBeNull();
  });
});

describe("teardown", () => {
  it("releases the handle, the backend and every listener on unmount", async () => {
    const mapRef = createRef<GlMapRef>();
    const onViewChange = vi.fn();
    const { container, unmount } = render(
      <GameMapView
        {...baseProps({ mapRef, onViewChange, exposeTestHandle: true })}
      />,
    );
    const canvas = canvasOf(container);
    await flushFrames();
    expect(backend.renders).toBeGreaterThan(0);

    unmount();
    expect(mapRef.current).toBeNull();
    expect((window as unknown as { __glMap?: GlMapRef }).__glMap).toBeUndefined();
    expect(backend.disposals).toBe(1);

    const rendersAtUnmount = backend.renders;
    const callsAtUnmount = onViewChange.mock.calls.length;
    // Nothing is scheduled any more, and the detached canvas' events are inert.
    canvas.dispatchEvent(pointer("pointerdown", 10, 10));
    canvas.dispatchEvent(pointer("pointermove", 60, 60));
    canvas.dispatchEvent(pointer("pointerup", 60, 60, 0));
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true }));
    await flushFrames();
    expect(backend.renders).toBe(rendersAtUnmount);
    expect(onViewChange.mock.calls.length).toBe(callsAtUnmount);
  });
});
