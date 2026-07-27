// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameMapMeta } from "@gamemap/data-contract";

import type { MapAssets } from "../core/assets.ts";
import type { RenderBackend } from "../core/renderer.ts";
import GameMapEmbed, { type EmbedPin } from "./GameMapEmbed.tsx";
import { setRenderBackendFactory } from "./renderBackend.ts";
import { DEFAULT_PIN_THEME } from "./theme.ts";

/**
 * Same jsdom harness as `GameMapView.test.tsx`: an injected recording backend and
 * a null 2D context, so the real camera, layers, atlas and gesture binding all run
 * without GL.
 */

const VIEWPORT = { width: 800, height: 600 };

const MAP: GameMapMeta = {
  id: "MapA",
  name: "Map A",
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

/**
 * MODULE-LEVEL, deliberately: this is the exact hazard the rebuild keys guard
 * against. A stable `pins` identity means the marker-push effect does not re-run on
 * its own when the stack is rebuilt, so the rebuild keys are the only thing that
 * gets the pins back onto the fresh (empty) marker layer.
 *
 * ONE pin, so the initial `pins` fit centres the camera exactly on it and it
 * projects to the middle of the viewport — no projection arithmetic in the test.
 */
const PINS: EmbedPin[] = [{ id: "p1", x: 200, y: 300 }];
const CENTRE = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };

let backend: RenderBackend & { disposals: number };
let restoreBackend: () => void;

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

function tapCentre(container: HTMLElement): void {
  const canvas = container.querySelector<HTMLElement>('[data-testid="gl-embed-canvas"]');
  if (!canvas) throw new Error("embed canvas not rendered");
  act(() => {
    canvas.dispatchEvent(pointer("pointerdown", CENTRE.x, CENTRE.y));
    canvas.dispatchEvent(pointer("pointerup", CENTRE.x, CENTRE.y, 0));
  });
}

beforeAll(() => {
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
  backend = {
    disposals: 0,
    setPixelRatio() {},
    setSize() {},
    render() {},
    dispose() {
      this.disposals += 1;
    },
  };
  restoreBackend = setRenderBackendFactory(() => backend);
});

afterEach(() => {
  cleanup();
  restoreBackend();
});

describe("GameMapEmbed", () => {
  it("fits the pins and reports a tap on one", () => {
    const onPinClick = vi.fn();
    const { container } = render(
      <GameMapEmbed map={MAP} assets={ASSETS} pins={PINS} onPinClick={onPinClick} />,
    );
    tapCentre(container);
    expect(onPinClick).toHaveBeenCalledWith("p1");
  });

  it("keeps its pins after a map change, even with a stable pins array", () => {
    const onPinClick = vi.fn();
    const { container, rerender } = render(
      <GameMapEmbed map={MAP} assets={ASSETS} pins={PINS} onPinClick={onPinClick} />,
    );
    rerender(
      <GameMapEmbed
        map={{ ...MAP, id: "MapB" }}
        assets={ASSETS}
        pins={PINS}
        onPinClick={onPinClick}
      />,
    );
    // The old stack was torn down, so this is a genuinely fresh marker layer.
    expect(backend.disposals).toBe(1);

    tapCentre(container);
    expect(onPinClick).toHaveBeenCalledWith("p1");
  });

  it("keeps its pins after a theme change, even with a stable pins array", () => {
    const onPinClick = vi.fn();
    const { container, rerender } = render(
      <GameMapEmbed map={MAP} assets={ASSETS} pins={PINS} onPinClick={onPinClick} />,
    );
    rerender(
      <GameMapEmbed
        map={MAP}
        assets={ASSETS}
        pins={PINS}
        onPinClick={onPinClick}
        theme={{ ...DEFAULT_PIN_THEME, pinDot: "#ff0000" }}
      />,
    );
    expect(backend.disposals).toBe(1);

    tapCentre(container);
    expect(onPinClick).toHaveBeenCalledWith("p1");
  });

  it("does not rebuild when the theme object changes but its values do not", () => {
    const { rerender } = render(
      <GameMapEmbed map={MAP} assets={ASSETS} pins={PINS} theme={{ ...DEFAULT_PIN_THEME }} />,
    );
    rerender(
      <GameMapEmbed map={MAP} assets={ASSETS} pins={PINS} theme={{ ...DEFAULT_PIN_THEME }} />,
    );
    expect(backend.disposals).toBe(0);
  });

  it("releases the GL stack on unmount", () => {
    const { unmount } = render(<GameMapEmbed map={MAP} assets={ASSETS} pins={PINS} />);
    unmount();
    expect(backend.disposals).toBe(1);
  });
});
