import { describe, expect, it } from "vitest";
import {
  dataToPoint,
  pointToData,
  mapHeightOf,
  mapWidthOf,
  worldToPixel,
  pixelToWorld,
} from "./coords.ts";
import type { GameMapMeta } from "@gamemap/data-contract";

const map: GameMapMeta = {
  id: "World_L_A",
  name: "World_L_A",
  type: "light",
  tileWidth: 256,
  tileHeight: 256,
  tilesCountX: 32,
  tilesCountY: 32,
  isVisible: true,
};

// Palworld MainWorld: 8192×8192 grid, world→pixel via pxAxis=Y, flipY.
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

describe("coords", () => {
  it("mapWidthOf / mapHeightOf = tile size * tiles count", () => {
    expect(mapWidthOf(map)).toBe(8192);
    expect(mapHeightOf(map)).toBe(8192);
  });

  // The Leaflet engine asserts `dataToLatLng(map, 100, 0).lat === 8192` (its one
  // vertical flip). This engine stays in image-pixel space, so the expectation
  // is the UNFLIPPED value: y=0 stays at the top edge (py=0).
  it("applies no vertical flip (y=0 → py=0)", () => {
    const p = dataToPoint(map, 100, 0);
    expect(p.y).toBe(0);
    expect(p.x).toBe(100);
  });

  it("dataToPoint agrees with the Leaflet engine via the height flip", () => {
    const p = dataToPoint(map, 100, 0);
    // What map-engine's dataToLatLng would have produced.
    expect(mapHeightOf(map) - p.y).toBe(8192);
    expect(p.x).toBe(100);
  });

  it("pointToData ∘ dataToPoint = identity", () => {
    for (const [x, y] of [
      [0, 0],
      [4096, 4096],
      [8191.5, 123.25],
    ]) {
      const p = dataToPoint(map, x, y);
      const back = pointToData(map, p.x, p.y);
      expect(back.x).toBeCloseTo(x, 10);
      expect(back.y).toBeCloseTo(y, 10);
    }
  });
});

describe("worldToPixel / pixelToWorld", () => {
  it("is identity when the map has no worldBounds (legacy pixel data)", () => {
    expect(worldToPixel(map, 100, 200)).toEqual({ x: 100, y: 200 });
    expect(pixelToWorld(map, 100, 200)).toEqual({ x: 100, y: 200 });
  });

  it("maps MainWorld world coords to pixels (pxAxis=Y, flipY)", () => {
    // Center of world bounds → center pixel.
    expect(worldToPixel(worldMap, -375000, 0)).toMatchObject({ x: 4096, y: 4096 });
    // (minX,minY) → bottom-left pixel (flipY sends min world-X to py=height).
    expect(worldToPixel(worldMap, -1099400, -724400)).toMatchObject({ x: 0, y: 8192 });
    // (maxX,maxY) → top-right pixel.
    expect(worldToPixel(worldMap, 349400, 724400)).toMatchObject({ x: 8192, y: 0 });
  });

  it("pixelToWorld ∘ worldToPixel = identity", () => {
    for (const [x, y] of [
      [-375000, 0],
      [12345.6, -98765.4],
      [200000, 500000],
    ]) {
      const p = worldToPixel(worldMap, x, y);
      const back = pixelToWorld(worldMap, p.x, p.y);
      expect(back.x).toBeCloseTo(x, 4);
      expect(back.y).toBeCloseTo(y, 4);
    }
  });
});

describe("dataToPoint on a world map", () => {
  it("is world→pixel with no extra transform", () => {
    const p = dataToPoint(worldMap, -375000, 0);
    expect(p.x).toBeCloseTo(4096, 6);
    expect(p.y).toBeCloseTo(4096, 6);
  });

  it("pointToData ∘ dataToPoint = identity (world coords in/out)", () => {
    for (const [x, y] of [
      [-375000, 0],
      [200000, 500000],
      [-900000, -300000],
    ]) {
      const p = dataToPoint(worldMap, x, y);
      const back = pointToData(worldMap, p.x, p.y);
      expect(back.x).toBeCloseTo(x, 3);
      expect(back.y).toBeCloseTo(y, 3);
    }
  });
});
