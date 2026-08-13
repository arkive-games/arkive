import { describe, expect, it, vi } from "vitest";
import type { GameMapMeta } from "@gamemap/data-contract";
import { Camera } from "./camera.ts";
import { dataToPoint } from "./coords.ts";
import { PointCloudLayer, type PointCloud } from "./pointCloudLayer.ts";
import { LayerOrder } from "./renderer.ts";

// Palworld MainWorld: world→pixel via pxAxis=Y + flipY, so projection is checked
// against a real orientation rather than the identity.
const worldMap: GameMapMeta = {
  id: "MainWorld",
  name: "MainWorld",
  type: "world",
  tileWidth: 1024,
  tileHeight: 1024,
  tilesCountX: 8,
  tilesCountY: 8,
  isVisible: true,
  worldBounds: { min: { x: -1099400, y: -724400 }, max: { x: 349400, y: 724400 } },
  orientation: { pxAxis: "Y", flipX: false, flipY: true },
};

const pixelMap: GameMapMeta = {
  id: "PixelMap",
  name: "Pixel Map",
  type: "world",
  tileWidth: 256,
  tileHeight: 256,
  tilesCountX: 32,
  tilesCountY: 32,
  isVisible: true,
};

function makeLayer(map: GameMapMeta = pixelMap) {
  const invalidate = vi.fn();
  const layer = new PointCloudLayer({ map, invalidate });
  return { layer, invalidate };
}

function cloud(over: Partial<PointCloud> = {}): PointCloud {
  return {
    id: "day",
    points: [
      [0, 0],
      [100, 200],
    ],
    radius: 3,
    color: "#f59e0b",
    ...over,
  };
}

function makeCamera(zoom: number): Camera {
  const camera = new Camera({
    mapWidthPx: 8192,
    mapHeightPx: 8192,
    minZoom: -4,
    maxZoom: 2,
    viewportWidth: 640,
    viewportHeight: 480,
  });
  camera.setView({ x: 4096, y: 4096 }, zoom);
  return camera;
}

/**
 * The instance buffer is a `Float32Array`, so a projected coordinate comes back
 * rounded to single precision. Compare against the same rounding rather than
 * loosening the tolerance, which would hide a real projection error.
 */
function expectSameCoord(actual: number, expected: number): void {
  expect(actual).toBe(Math.fround(expected));
}

describe("PointCloudLayer", () => {
  it("uses the points draw-order bucket, under the markers", () => {
    const { layer } = makeLayer();
    expect(layer.order).toBe(LayerOrder.points);
    expect(LayerOrder.points).toBeGreaterThan(LayerOrder.vectors);
    expect(LayerOrder.points).toBeLessThan(LayerOrder.markers);
    expect(layer.object3D.name).toBe("point-clouds");
    layer.dispose();
  });

  it("draws one instanced mesh per cloud, one instance per point", () => {
    const { layer, invalidate } = makeLayer();
    layer.setClouds([cloud(), cloud({ id: "night", points: [[1, 1]] })]);
    expect(layer.cloudCount).toBe(2);
    expect(layer.instanceCountOf("day")).toBe(2);
    expect(layer.instanceCountOf("night")).toBe(1);
    expect(layer.object3D.children).toHaveLength(2);
    expect(invalidate).toHaveBeenCalled();
    layer.dispose();
  });

  it("projects DATA points through the map's orientation", () => {
    const { layer } = makeLayer(worldMap);
    layer.setClouds([cloud({ points: [[100, 200]] })]);
    const expected = dataToPoint(worldMap, 100, 200);
    const actual = layer.centerAt("day", 0)!;
    expectSameCoord(actual.x, expected.x);
    expectSameCoord(actual.y, expected.y);
    layer.dispose();
  });

  it("drops non-finite points instead of poisoning the buffer with NaN", () => {
    const { layer } = makeLayer();
    layer.setClouds([
      cloud({
        points: [
          [0, 0],
          [Number.NaN, 5],
          [10, 10],
        ],
      }),
    ]);
    expect(layer.instanceCountOf("day")).toBe(2);
    layer.dispose();
  });

  it("draws nothing for an empty cloud rather than an empty mesh", () => {
    const { layer } = makeLayer();
    layer.setClouds([cloud({ points: [] })]);
    expect(layer.cloudCount).toBe(0);
    expect(layer.object3D.children).toHaveLength(0);
    layer.dispose();
  });

  it("carries the radius and both opacities as uniforms", () => {
    const { layer } = makeLayer();
    layer.setClouds([cloud({ radius: 5, fillOpacity: 0.45, strokeOpacity: 0.8 })]);
    const uniforms = layer.materialOf("day")!.uniforms;
    expect(uniforms.uRadius.value).toBe(5);
    expect(uniforms.uFillOpacity.value).toBe(0.45);
    expect(uniforms.uStrokeOpacity.value).toBe(0.8);
    expect(uniforms.uColor.value.getHexString()).toBe("f59e0b");
    layer.dispose();
  });

  it("keeps the discs screen-constant: uScale tracks the camera, not the geometry", () => {
    const { layer } = makeLayer();
    layer.setClouds([cloud()]);
    const material = layer.materialOf("day")!;
    const before = layer.centerAt("day", 1)!;

    layer.update(makeCamera(0));
    expect(material.uniforms.uScale.value).toBe(1);
    layer.update(makeCamera(-2));
    // zoom -2 => 0.25 screen px per map px.
    expect(material.uniforms.uScale.value).toBeCloseTo(0.25, 6);
    // The instance centres are map-pixel positions and must NOT move with zoom.
    expect(layer.centerAt("day", 1)).toEqual(before);
    layer.dispose();
  });

  it("pushes the current scale into a cloud added after the camera settled", () => {
    const { layer } = makeLayer();
    const camera = makeCamera(-2);
    layer.setClouds([cloud()]);
    layer.update(camera);
    // A second `setClouds` builds fresh materials whose uScale defaults to 1;
    // the next update must still reach them even though the camera never moved.
    layer.setClouds([cloud({ id: "night" })]);
    layer.update(camera);
    expect(layer.materialOf("night")!.uniforms.uScale.value).toBeCloseTo(0.25, 6);
    layer.dispose();
  });

  it("skips the uniform write when the scale did not change", () => {
    const { layer } = makeLayer();
    layer.setClouds([cloud()]);
    const camera = makeCamera(0);
    layer.update(camera);
    const uniforms = layer.materialOf("day")!.uniforms;
    const spy = vi.spyOn(uniforms.uScale, "value", "set");
    layer.update(camera);
    expect(spy).not.toHaveBeenCalled();
    layer.dispose();
  });

  it("re-projects onto another map", () => {
    const { layer } = makeLayer(pixelMap);
    layer.setClouds([cloud({ points: [[100, 200]] })]);
    const asPixel = layer.centerAt("day", 0)!;
    layer.setMap(worldMap);
    const asWorld = layer.centerAt("day", 0)!;
    expect(asWorld).not.toEqual(asPixel);
    const expected = dataToPoint(worldMap, 100, 200);
    expectSameCoord(asWorld.x, expected.x);
    layer.dispose();
  });

  it("frees the previous geometry and material when the clouds are replaced", () => {
    const { layer } = makeLayer();
    layer.setClouds([cloud()]);
    const material = layer.materialOf("day")!;
    const geometry = (layer.object3D.children[0] as { geometry: { dispose: () => void } }).geometry;
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    layer.setClouds([cloud({ id: "night" })]);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(layer.cloudCount).toBe(1);
    expect(layer.instanceCountOf("day")).toBe(0);
    layer.dispose();
  });

  it("is inert after dispose", () => {
    const { layer } = makeLayer();
    layer.setClouds([cloud()]);
    const material = layer.materialOf("day")!;
    const spy = vi.spyOn(material, "dispose");
    layer.dispose();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(layer.isDisposed).toBe(true);
    expect(layer.object3D.children).toHaveLength(0);
    layer.setClouds([cloud()]);
    layer.setMap(worldMap);
    expect(layer.cloudCount).toBe(0);
  });

  it("reports nothing for an unknown cloud id", () => {
    const { layer } = makeLayer();
    layer.setClouds([cloud()]);
    expect(layer.instanceCountOf("nope")).toBe(0);
    expect(layer.materialOf("nope")).toBeNull();
    expect(layer.centerAt("nope", 0)).toBeNull();
    expect(layer.centerAt("day", 99)).toBeNull();
    layer.dispose();
  });

  it("copies the caller's points so a later mutation cannot reach the buffer", () => {
    const { layer } = makeLayer();
    const points: [number, number][] = [
      [0, 0],
      [10, 10],
    ];
    layer.setClouds([cloud({ points })]);
    points.push([20, 20]);
    expect(layer.instanceCountOf("day")).toBe(2);
    layer.dispose();
  });
});
