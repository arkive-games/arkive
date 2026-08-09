// src/providers/GameDataProvider.tsx
import React, {createContext, useContext, useEffect, useState} from "react";
import type { GameMapMeta, MarkerTypeSubtype } from "@gamemap/data-contract";
import {useGameMap} from "@/context/GameMapContext";
import {useMarkers} from "@/context/MarkersContext";
import { VISIBLE_SUBTYPES_STORAGE_PREFIX, VISIBLE_REGIONS_STORAGE_PREFIX } from "@/lib/constants";

type GameDataContextValue = {
  visibleSubtypes?: Set<string>;
  setVisibleSubtypes: (visibleSubtypes: Set<string>) => void;
  visibleRegions?: Set<string>;
  setVisibleRegions: (visibleRegions: Set<string>) => void;
  allSubtypes: Map<string, MarkerTypeSubtype>;
  setAllSubtypes: (allSubtypes: Map<string, MarkerTypeSubtype>) => void;
  handleToggleSubtype: (subTypeId: string) => void;
  handleToggleRegion: (region: string) => void;
  showBorders: boolean;
  handleToggleBorders: () => void;
  handleShowAllSubtypes: () => void;
  handleHideAllSubtypes: () => void;
  /** When true, gate higher-tier markers behind a minimum zoom (game-like LOD). */
  lodEnabled: boolean;
  setLodEnabled: (lodEnabled: boolean) => void;
};

const GameDataContext = createContext<GameDataContextValue | null>(null);

/**
 * The subtypes a map opens with: the whole "location" category, plus abyss
 * fragments. Exported because the mobile filter button needs the same answer to
 * decide whether the user has changed anything -- comparing against *all*
 * subtypes instead marked the filter as modified on every first visit, since the
 * default set is a strict subset.
 */
export function defaultVisibleSubtypeKeys(
  all: Map<string, MarkerTypeSubtype>,
  selectedMap: GameMapMeta,
): Set<string> {
  const keys = new Set<string>();
  all.forEach((sub, name) => {
    if (sub.category === "location" || (sub.name === "fragments" && selectedMap.type === "abyss")) {
      keys.add(name);
    }
  });
  return keys;
}

type GameDataProviderProps = {
  children: React.ReactNode;
};

const saveVisibleData = (prefix: string, selectedMap: GameMapMeta | undefined, data: Set<string> | undefined) => {
  if (!selectedMap || !data) return;
  const storageKey = `${prefix}${selectedMap.name}`;
  try {
    const arr = Array.from(data);
    const stored = JSON.stringify(arr);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, stored);
    }
  } catch (e) {
    console.warn("Failed to save to localStorage", storageKey, e);
  }
}

const loadVisibleData = (prefix: string, selectedMap: GameMapMeta, validKeys: Set<string>) => {
  const storageKey = `${prefix}${selectedMap.name}`;
  try {
    const stored = typeof window !== "undefined"
      ? window.localStorage.getItem(storageKey)
      : null;
    if (!stored) return null;
    const parsed = JSON.parse(stored) as string[];
    const set = new Set<string>();
    parsed.forEach((key) => {
      if (validKeys.has(key)) set.add(key);
    });
    return set;
  } catch (e) {
    console.warn("Failed to parse from localStorage", storageKey, e);
    return null;
  }
}

export const GameDataProvider: React.FC<GameDataProviderProps> = ({
                                                                    children,
                                                                  }) => {
  const [visibleSubtypes, setVisibleSubtypes] = useState<Set<string> | undefined>(undefined);
  const [visibleRegions, setVisibleRegions] = useState<Set<string> | undefined>(undefined);
  const [allSubtypes, setAllSubtypes] = useState<Map<string, MarkerTypeSubtype>>(new Map());
  const [showBorders, setShowBorders] = useState<boolean>(false);
  // Phones open with LOD on -- the full marker set is unreadable at phone width.
  // This is a *default*, not a forced value: forcing it left the sidebar's "Auto
  // detail by zoom" switch reporting OFF while culling was on, and turning it off
  // did nothing. 767 matches MOBILE_MAX_WIDTH and the CSS media query.
  const [lodEnabled, setLodEnabled] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  );

  // const { regions } = useMarkers(selectedMap?.name);

  const { types, selectedMap } = useGameMap();
  const { regions } = useMarkers();

  // Initialize visibleSubtypes once when types are loaded
  useEffect(() => {
    if (!selectedMap || types.length === 0) return;
    const all = new Map<string, MarkerTypeSubtype>();
    types.forEach((cat) => {
      cat.subtypes.forEach((sub) => {
        sub.category = cat.name;
        // Resolve the category's default pin style onto each subtype so the
        // render engine reads it from `subtypeMeta` without knowing category names.
        sub.pinVariant = sub.pinVariant ?? cat.pinVariant;
        all.set(sub.name, sub);
      });
    });
    setAllSubtypes(all);
    const validKeys = new Set(all.keys());
    const visible = loadVisibleData(VISIBLE_SUBTYPES_STORAGE_PREFIX, selectedMap, validKeys);
    if (visible) {
      setVisibleSubtypes(visible);
    } else {
      setVisibleSubtypes(defaultVisibleSubtypeKeys(all, selectedMap));
    }
  }, [selectedMap, types]);

  // Initialize visibleRegions once when regions are loaded
  useEffect(() => {
    if (!selectedMap || regions.length === 0) return;
    // setAllSubtypes(all);
    const validKeys = new Set(regions.map(x => x.name));
    const visible = loadVisibleData(VISIBLE_REGIONS_STORAGE_PREFIX, selectedMap, validKeys);
    if (visible) {
      setVisibleRegions(visible);
    } else {
      setVisibleRegions(validKeys);
    }
  }, [selectedMap, regions]);


  useEffect(() => {
    saveVisibleData(VISIBLE_SUBTYPES_STORAGE_PREFIX, selectedMap, visibleSubtypes)
  }, [selectedMap, visibleSubtypes]);

  useEffect(() => {
    saveVisibleData(VISIBLE_REGIONS_STORAGE_PREFIX, selectedMap, visibleRegions)
  }, [selectedMap, visibleRegions]);

  const handleToggleSubtype = (subtypeId: string) => {
    setVisibleSubtypes((prev) => {
      const next = new Set(prev);
      if (next.has(subtypeId)) next.delete(subtypeId);
      else next.add(subtypeId);
      return next;
    });
  };

  const handleToggleRegion = (regionId: string) => {
    setVisibleRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionId)) next.delete(regionId);
      else next.add(regionId);
      return next;
    });
  };

  const handleShowAllSubtypes = () => {
    setVisibleSubtypes(new Set(allSubtypes.keys()));
  };

  const handleHideAllSubtypes = () => {
    setVisibleSubtypes(new Set<string>());
  };

  const handleToggleBorders = () => {
    setShowBorders(!showBorders);
  }


  return (
    <GameDataContext.Provider value={{
      visibleSubtypes,
      setVisibleSubtypes,
      visibleRegions,
      setVisibleRegions,
      allSubtypes,
      setAllSubtypes,
      handleToggleSubtype,
      handleToggleRegion,
      handleShowAllSubtypes,
      handleHideAllSubtypes,
      showBorders,
      handleToggleBorders,
      lodEnabled,
      setLodEnabled,
    }}>
      {children}
    </GameDataContext.Provider>
  );
};

/**
 * 👇 Keep backward-compatible API
 * Replace old hook with this context-backed version
 */
export function useGameData(): GameDataContextValue {
  const ctx = useContext(GameDataContext);
  if (!ctx) {
    throw new Error("useGameData must be used inside <GameDataProvider>");
  }
  return ctx;
}
