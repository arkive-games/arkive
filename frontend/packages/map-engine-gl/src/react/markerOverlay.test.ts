// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { MarkerTypeSubtype } from "@gamemap/data-contract";

import { Camera } from "../core/camera.ts";
import {
  collectLabelSources,
  cullLabelSources,
  labelTransform,
  markerLabelText,
  MarkerOverlay,
  MAX_LABELS,
  type LabelMarker,
  type LabelSource,
} from "./markerOverlay.ts";

function marker(over: Partial<LabelMarker> & { id: string }): LabelMarker {
  return {
    subtype: "poi",
    x: 0,
    y: 0,
    images: [],
    contributors: [],
    indexInSubtype: 0,
    localizedName: "",
    name: "",
    subtypeLabel: "",
    ...over,
  } as LabelMarker;
}

const subtype = (over: Partial<MarkerTypeSubtype>): MarkerTypeSubtype => ({
  id: "s",
  name: "s",
  ...over,
});

const allVisible = {
  selectedId: null,
  visibleSubtypes: new Set(["poi"]),
  lodEnabled: false,
  visibleTier: 3,
  positionOf: (id: string) => ({ x: Number(id), y: Number(id) }),
};

describe("markerLabelText", () => {
  it("prefers the localized name", () => {
    expect(
      markerLabelText(
        marker({ id: "a", localizedName: "Loc", name: "Raw", subtypeLabel: "Sub" }),
      ),
    ).toBe("Loc");
  });

  it("falls back to the raw name, then to the subtype label", () => {
    expect(
      markerLabelText(marker({ id: "a", localizedName: "", name: "Raw", subtypeLabel: "Sub" })),
    ).toBe("Raw");
    expect(
      markerLabelText(marker({ id: "a", localizedName: "", name: "", subtypeLabel: "Sub" })),
    ).toBe("Sub");
  });

  it("is empty when every step of the chain is empty", () => {
    expect(markerLabelText(marker({ id: "a" }))).toBe("");
  });
});

describe("collectLabelSources", () => {
  it("skips hideTooltip subtypes, the selected marker and unnamed markers", () => {
    const markers = [
      marker({ id: "1", localizedName: "Named" }),
      marker({ id: "2", localizedName: "Hidden", subtypeMeta: subtype({ hideTooltip: true }) }),
      marker({ id: "3", localizedName: "Selected" }),
      marker({ id: "4" }),
    ];
    const out = collectLabelSources(markers, { ...allVisible, selectedId: "3" });
    expect(out.map((s) => s.text)).toEqual(["Named"]);
  });

  it("applies the same visibility rules as the sprites", () => {
    const markers = [
      marker({ id: "1", localizedName: "Shown" }),
      marker({ id: "2", subtype: "other", localizedName: "FilteredOut" }),
      marker({ id: "3", subtype: "other", localizedName: "Forced" }),
    ];
    const out = collectLabelSources(markers, {
      ...allVisible,
      forceShowIds: new Set(["3"]),
    });
    expect(out.map((s) => s.text)).toEqual(["Shown", "Forced"]);
  });

  it("uses the fanned position the layer reports, and skips markers without one", () => {
    const out = collectLabelSources([marker({ id: "7", localizedName: "A" })], {
      ...allVisible,
      positionOf: () => ({ x: 111, y: 222 }),
    });
    expect(out).toEqual([{ id: "7", text: "A", x: 111, y: 222 }]);
    expect(
      collectLabelSources([marker({ id: "7", localizedName: "A" })], {
        ...allVisible,
        positionOf: () => null,
      }),
    ).toEqual([]);
  });
});

describe("cullLabelSources", () => {
  const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const at = (id: string, x: number, y: number): LabelSource => ({ id, text: id, x, y });

  it("keeps only labels inside the bounds", () => {
    const out = cullLabelSources(
      [at("in", 50, 50), at("left", -1, 50), at("below", 50, 101)],
      bounds,
    );
    expect(out.map((s) => s.id)).toEqual(["in"]);
  });

  it("caps the result and skips the overflow", () => {
    const many = Array.from({ length: 500 }, (_, i) => at(`m${i}`, 1, 1));
    expect(cullLabelSources(many, bounds)).toHaveLength(MAX_LABELS);
    expect(cullLabelSources(many, bounds, 3).map((s) => s.id)).toEqual(["m0", "m1", "m2"]);
    expect(cullLabelSources(many, bounds, 0)).toEqual([]);
  });
});

describe("labelTransform", () => {
  it("lifts the box by the Leaflet tooltip offset and centres it", () => {
    expect(labelTransform({ x: 10.4, y: 60.6 })).toBe(
      "translate3d(10px, 43px, 0) translate(-50%, -100%)",
    );
  });
});

describe("MarkerOverlay", () => {
  let container: HTMLElement;
  let camera: Camera;
  let overlay: MarkerOverlay;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    camera = new Camera({
      mapWidthPx: 1000,
      mapHeightPx: 1000,
      minZoom: -3,
      maxZoom: 2,
      viewportWidth: 800,
      viewportHeight: 600,
      center: { x: 500, y: 500 },
      zoom: 0,
    });
    overlay = new MarkerOverlay(container);
  });

  it("shows and hides the hover tooltip", () => {
    overlay.setTooltip("Fast Travel", { x: 500, y: 500 });
    overlay.reposition(camera);
    const node = container.querySelector(".gmgl-tooltip") as HTMLElement;
    expect(node.textContent).toBe("Fast Travel");
    expect(node.style.display).not.toBe("none");
    // Camera centre → viewport centre, lifted by the tooltip offset.
    expect(node.style.transform).toContain("translate3d(400px, 282px, 0)");

    overlay.setTooltip(null, null);
    expect(node.style.display).toBe("none");
  });

  it("draws no labels until they are enabled", () => {
    overlay.setLabelSources([{ id: "a", text: "A", x: 500, y: 500 }]);
    overlay.reposition(camera);
    expect(overlay.visibleLabelTexts()).toEqual([]);
    overlay.setLabelsEnabled(true);
    overlay.reposition(camera);
    expect(overlay.visibleLabelTexts()).toEqual(["A"]);
  });

  it("culls labels to the viewport and reuses its nodes", () => {
    overlay.setLabelsEnabled(true);
    overlay.setLabelSources([
      { id: "a", text: "A", x: 500, y: 500 },
      // Far outside the 800x600 viewport at zoom 0.
      { id: "b", text: "B", x: 5000, y: 5000 },
    ]);
    overlay.reposition(camera);
    expect(overlay.visibleLabelTexts()).toEqual(["A"]);
    const nodeCount = container.querySelectorAll(".gmgl-label").length;

    overlay.setLabelSources([{ id: "b", text: "B", x: 500, y: 480 }]);
    overlay.reposition(camera);
    expect(overlay.visibleLabelTexts()).toEqual(["B"]);
    // The pool is reused rather than re-created.
    expect(container.querySelectorAll(".gmgl-label").length).toBe(nodeCount);
  });

  it("removes every node on dispose", () => {
    overlay.setLabelsEnabled(true);
    overlay.setLabelSources([{ id: "a", text: "A", x: 500, y: 500 }]);
    overlay.setTooltip("T", { x: 500, y: 500 });
    overlay.reposition(camera);
    expect(container.children.length).toBeGreaterThan(0);
    overlay.dispose();
    expect(container.children.length).toBe(0);
    // Idempotent, and inert afterwards.
    overlay.dispose();
    overlay.setTooltip("T", { x: 1, y: 1 });
    expect(container.children.length).toBe(0);
  });
});
