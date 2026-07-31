// @vitest-environment jsdom
// (leaflet touches `window` at import time, so this file needs a DOM)
import { describe, it, expect } from "vitest";
import type { GameMapMeta } from "@gamemap/data-contract";
import { resolveTileCoords } from "./GameMapTiles";

const MAP: GameMapMeta = {
  id: "MainWorld", name: "MainWorld", type: "world",
  tileWidth: 1024, tileHeight: 1024, tilesCountX: 8, tilesCountY: 8,
  isVisible: true, tileLevels: 3,
};

describe("resolveTileCoords", () => {
  it("maps level-0 coords (z=0, negative y) to the top-left-origin grid", () => {
    expect(resolveTileCoords(MAP, { x: 0, y: -8, z: 0 })).toEqual({ level: 0, x: 0, y: 0 });
    expect(resolveTileCoords(MAP, { x: 7, y: -1, z: 0 })).toEqual({ level: 0, x: 7, y: 7 });
  });
  it("maps native zoom -1 to level 1 with a 4x4 grid", () => {
    expect(resolveTileCoords(MAP, { x: 0, y: -4, z: -1 })).toEqual({ level: 1, x: 0, y: 0 });
    expect(resolveTileCoords(MAP, { x: 3, y: -1, z: -1 })).toEqual({ level: 1, x: 3, y: 3 });
  });
  it("maps native zoom -3 to the single whole-map tile", () => {
    expect(resolveTileCoords(MAP, { x: 0, y: -1, z: -3 })).toEqual({ level: 3, x: 0, y: 0 });
  });
  it("rejects out-of-grid indices per level", () => {
    expect(resolveTileCoords(MAP, { x: 8, y: -1, z: 0 })).toBeNull();
    expect(resolveTileCoords(MAP, { x: 4, y: -1, z: -1 })).toBeNull();
    expect(resolveTileCoords(MAP, { x: 0, y: 0, z: 0 })).toBeNull(); // y >= 0 is below the map
  });
  it("clamps the level to the map's tileLevels (positive z stays level 0)", () => {
    expect(resolveTileCoords(MAP, { x: 0, y: -8, z: 2 })).toEqual({ level: 0, x: 0, y: 0 });
    const single: GameMapMeta = { ...MAP, tileLevels: undefined };
    expect(resolveTileCoords(single, { x: 0, y: -8, z: 0 })).toEqual({ level: 0, x: 0, y: 0 });
  });
});
