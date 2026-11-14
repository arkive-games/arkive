import { browserMemory } from '@gamemap/state-memory';
import { resolveRememberedMap } from '@gamemap/map-shell';
import { aionMapSession } from '@/features/map/mapSession';
import type {GameMapMeta, MapsFile, MarkerTypeCategory, TypesFile} from "@gamemap/data-contract";
import React, {createContext, useContext, useEffect, useState} from "react";
import {loadGameData} from "@/lib/data";
import {getQueryParam, setQueryParam} from "@/lib/url";

type GameMapContextValue = {
  maps: GameMapMeta[];
  types: MarkerTypeCategory[];
  loading: boolean;
  selectedMap?: GameMapMeta;
  setSelectedMap: (map?: GameMapMeta) => void;
}

const GameMapContext = createContext<GameMapContextValue | null>(null);

type GameMapProviderProps = {
  children: React.ReactNode;
};

export const GameMapProvider: React.FC<GameMapProviderProps> = ({children}: GameMapProviderProps) => {
  const [maps, setMaps] = useState<GameMapMeta[]>([]);
  const [types, setTypes] = useState<MarkerTypeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMap, setSelectedMap] = useState<GameMapMeta | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [mapsData, typesData] = await Promise.all([
          loadGameData<MapsFile>("data/maps.json"),
          loadGameData<TypesFile>("data/types.json"),
        ]);

        if (cancelled) return;

        setMaps(mapsData.maps.filter((map) => map.isVisible));
        setTypes(typesData.categories);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize selected map
  useEffect(() => {
    if (!maps || maps.length === 0) return;
    const isIndexPage = window.location.pathname === "/";

    if (selectedMap) {
      browserMemory.write(aionMapSession.lastMap, selectedMap.id);
      if (isIndexPage) {
        setQueryParam("map", selectedMap.name);
      }
      return;
    }

    const initialMapId = isIndexPage ? getQueryParam("map") : null;
    const initial = resolveRememberedMap(maps, initialMapId, browserMemory.read(aionMapSession.lastMap));
    setSelectedMap(initial);
    if (isIndexPage && initial) setQueryParam("map", initial.name);
  }, [maps, selectedMap]);


  return (
    <GameMapContext.Provider value={{
      maps,
      types,
      loading,
      selectedMap,
      setSelectedMap,
    }}>
      {children}
    </GameMapContext.Provider>
  )

}

export function useGameMap(): GameMapContextValue {
  const ctx = useContext(GameMapContext);
  if (!ctx) {
    throw new Error("useGameMap must be used inside <GameMapProvider>");
  }
  return ctx;
}
