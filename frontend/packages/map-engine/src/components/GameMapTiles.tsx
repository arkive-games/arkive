import React, { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { GameMapMeta } from "@gamemap/data-contract";
import type { MapAssets } from "../engineTypes.ts";

type GameTilesProps = {
  selectedMap: GameMapMeta;
  assets: MapAssets;
};

type GameTileLayerOptions = L.TileLayerOptions &
  GameTilesProps & {
    isWatermark?: boolean;
  };

export interface TileGridRef {
  level: number;
  x: number;
  y: number;
}

/**
 * Leaflet tile coords (z = the clamped NATIVE zoom Leaflet chose, y negative
 * above the CRS.Simple origin) → pyramid level + top-left-origin grid indices.
 * Null = outside the level's grid (noWrap: no tile requested).
 */
export function resolveTileCoords(
  map: GameMapMeta,
  coords: { x: number; y: number; z: number },
): TileGridRef | null {
  const levels = Math.max(0, map.tileLevels ?? 0);
  const level = Math.min(levels, Math.max(0, -coords.z));
  const countX = Math.ceil(map.tilesCountX / 2 ** level);
  const countY = Math.ceil(map.tilesCountY / 2 ** level);
  const x = coords.x;
  const y = countY + coords.y;
  if (x < 0 || y < 0 || x >= countX || y >= countY) return null;
  return { level, x, y };
}

class GameTileLayer extends L.TileLayer {
  private readonly gameOptions: GameTileLayerOptions;

  constructor(options: GameTileLayerOptions) {
    options.tileSize = options.selectedMap.tileWidth;
    super("", options);
    this.gameOptions = options;
  }

  getTileUrl(coords: L.Coords): string {
    const { selectedMap, assets, isWatermark } = this.gameOptions;
    const ref = resolveTileCoords(selectedMap, coords);
    if (!ref) return "";
    if (isWatermark) return assets.watermarkUrl ?? "";
    // The engine owns grid math; the app owns URL construction.
    return assets.tileUrl(selectedMap, ref.x, ref.y, ref.level);
  }
}

const GameMapTiles: React.FC<GameTilesProps> = ({ selectedMap, assets }) => {
  const map = useMap();

  useEffect(() => {
    const layer = new GameTileLayer({
      selectedMap,
      assets,
      noWrap: true,
      minZoom: map.getMinZoom(),
      maxZoom: map.getMaxZoom(),
      maxNativeZoom: 0,
      minNativeZoom: -(selectedMap.tileLevels ?? 0),
    });

    layer.addTo(map);

    const watermarkLayer = assets.watermarkUrl
      ? new GameTileLayer({
          selectedMap,
          assets,
          isWatermark: true,
          noWrap: true,
          minZoom: map.getMinZoom(),
          maxZoom: map.getMaxZoom(),
          maxNativeZoom: 0,
          minNativeZoom: 0,
          opacity: 0.2,
        })
      : null;

    watermarkLayer?.addTo(map);

    return () => {
      map.removeLayer(layer);
      if (watermarkLayer) map.removeLayer(watermarkLayer);
    };
  }, [map, selectedMap, assets]);

  return null;
};

export default GameMapTiles;
