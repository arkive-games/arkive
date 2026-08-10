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

// aion2's shipping orientation (`pxAxis: "X"`, no flips — see the coordinate
// transform in `tools/CLAUDE.md`). The grid and the world bounds are
// deliberately non-square and asymmetric so that transposing the two axes
// cannot pass: W/H = 8192/4096 and
// the X/Y world ranges differ (4000 vs 8000).
const aion2Map: GameMapMeta = {
  id: "World_L_A",
  name: "World_L_A",
  type: "world",
  tileWidth: 256,
  tileHeight: 256,
  tilesCountX: 32,
  tilesCountY: 16,
  isVisible: true,
  worldBounds: { min: { x: -1000, y: -2000 }, max: { x: 3000, y: 6000 } },
  orientation: { pxAxis: "X", flipX: false, flipY: false },
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
    const p = dataToPoint(map, 100, 1000);
    expect(p.y).toBe(1000);
    // What map-engine's dataToLatLng would have produced for the same data.
    expect(mapHeightOf(map) - p.y).toBe(7192);
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

  it("maps aion2-style world coords to pixels (pxAxis=X, no flips)", () => {
    // world X drives pixel x over a 4000-wide range on an 8192px axis,
    // world Y drives pixel y over an 8000-tall range on a 4096px axis.
    expect(worldToPixel(aion2Map, -1000, -2000)).toEqual({ x: 0, y: 0 });
    expect(worldToPixel(aion2Map, 3000, 6000)).toEqual({ x: 8192, y: 4096 });
    expect(worldToPixel(aion2Map, 1000, 2000)).toEqual({ x: 4096, y: 2048 });
    // Off-centre: the axes are not interchangeable.
    expect(worldToPixel(aion2Map, 0, 0)).toEqual({ x: 2048, y: 1024 });
  });

  it("pixelToWorld ∘ worldToPixel = identity for pxAxis=X too", () => {
    for (const [x, y] of [
      [0, 0],
      [-999.5, 5999.25],
      [2500, -1500],
    ]) {
      const p = worldToPixel(aion2Map, x, y);
      const back = pixelToWorld(aion2Map, p.x, p.y);
      expect(back.x).toBeCloseTo(x, 6);
      expect(back.y).toBeCloseTo(y, 6);
    }
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
