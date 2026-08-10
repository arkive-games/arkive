import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react";
import type {MarkerInstance, RawMarkersFile, RawRegionsFile, RegionInstance} from "@gamemap/data-contract";
import type {MarkerWithTranslations} from "@/types/game";
import {loadGameData} from "@/lib/data";
import {useGameMap} from "@/context/GameMapContext";
import {useTranslation} from "react-i18next";
import { COMPLETED_MARKERS_V1_PREFIX, COMPLETED_MARKERS_V2_PREFIX } from "@/lib/constants";
import {
  browserMemory,
  defineMemoryRecord,
  isBoolean,
  memoryPolicy,
  parseJson,
  useMemoryState,
} from "@gamemap/state-memory";

type MarkersContextValue = {
  markers: MarkerWithTranslations[];
  markersById: Record<string, MarkerWithTranslations>;
  regions: RegionInstance[];
  loading: boolean;
  /**
   * Id of the map the loaded markers belong to, or null while none are
   * loaded. During a map switch the old markers stay mounted until the new
   * fetch lands, so this LAGS `selectedMap.id` — consumers that persist
   * per-map state key on it so one map's state never writes under another
   * map's key.
   */
  markersMapId: string | null;

  showLabels: boolean;
  setShowLabels: (value: boolean) => void;

  subtypeCounts: Record<string, number>;
  completedCounts: Record<string, number>;

  completedBySubtype: Record<string, Set<number>>;
  // completedSet: Record<string, number>;
  // buildCompletedKey: (marker: MarkerInstance) => string;

  toggleMarkerCompleted: (marker: MarkerInstance) => void;
  clearMarkerCompleted: () => void;
}

const MarkersContext = createContext<MarkersContextValue | null>(null);

type MarkersProviderProps = {
  children: React.ReactNode;
};

/**
 * ONE definition, used by both the read and the clear.
 *
 * There were two, and they disagreed: the read declared `legacyKeys` and capped the
 * array at 10,000 entries, the clear declared neither. So clearing removed the new
 * key while leaving the legacy one, and the next read migrated it straight back --
 * "clear completed markers" undone by the following page load. The differing cap
 * also meant the same stored value was valid to one and invalid to the other.
 *
 * `pnpm memory:keys` now fails on a key defined twice, which is how this surfaced.
 */
const completedV1Record = (map: string) => defineMemoryRecord({
  id: "completed-markers-v1",
  namespace: "aion2",
  surface: "map",
  ...memoryPolicy.durableProgress("clear-map-progress"),
  schemaVersion: "1.0.0",
  defaultValue: () => [] as string[],
  validate: (value: unknown): value is string[] =>
    Array.isArray(value) && value.length <= 10_000 && value.every((item) => typeof item === "string"),
  legacyKeys: [`${COMPLETED_MARKERS_V1_PREFIX}.${map}`],
  migrateLegacy: parseJson,
});

function loadV1(map: string): Set<string> {
  return new Set(browserMemory.read(completedV1Record(map), { partition: map }));
}

function clearV1(map: string): void {
  browserMemory.clear(completedV1Record(map), { partition: map });
}

const completedSubtypeRecord = (legacyKey: string) => defineMemoryRecord({
  id: "completed-markers",
  namespace: "aion2",
  surface: "map",
  ...memoryPolicy.durableProgress("clear-map-progress"),
  schemaVersion: "1.0.0",
  defaultValue: () => [] as number[],
  validate: (value: unknown): value is number[] =>
    Array.isArray(value) && value.length <= 10_000 && value.every((item) => typeof item === "number" && Number.isFinite(item)),
  legacyKeys: [legacyKey],
  migrateLegacy: parseJson,
});

function saveV2Subtype(map: string, subtype: string, set: Set<number>) {
  const key = `${COMPLETED_MARKERS_V2_PREFIX}.${map}.${subtype}`;
  browserMemory.write(completedSubtypeRecord(key), [...set], { partition: `${map}:${subtype}` });
}

function loadV2Subtype(map: string, subtype: string): Set<number> {
  const key = `${COMPLETED_MARKERS_V2_PREFIX}.${map}.${subtype}`;
  return new Set(browserMemory.read(completedSubtypeRecord(key), { partition: `${map}:${subtype}` }));
}

const showLabelsRecord = defineMemoryRecord({
  id: "show-labels",
  namespace: "aion2",
  surface: "map",
  ...memoryPolicy.userPreference("reset-map-labels"),
  schemaVersion: "1.0.0",
  defaultValue: () => true,
  validate: isBoolean,
});


export const MarkersProvider = ({children}: MarkersProviderProps) => {
  const [baseMarkers, setBaseMarkers] = useState<MarkerInstance[]>([]);
  const [regions, setRegions] = useState<RegionInstance[]>([]);
  const [markersMapId, setMarkersMapId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLabels, setShowLabels] = useMemoryState(showLabelsRecord);

  const { selectedMap, types } = useGameMap();
  const markerNs = `markers/${selectedMap?.name}`;
  // react-i18next uses the ns list as a hook dependency array, so its LENGTH
  // must stay constant across renders — swinging []↔[markerNs] breaks namespace
  // loading outright (the marker locale is never fetched → every marker name is
  // blank). Keep it length-1: fall back to the already-loaded "common" ns until
  // a map is selected, which also avoids requesting the bogus "markers/undefined".
  const {t} = useTranslation(selectedMap ? [markerNs] : ["common"]);

  const subtypeToCategory = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cat of types) {
      for (const sub of cat.subtypes) {
        map[sub.name] = cat.name;
      }
    }
    return map;
  }, [types]);

  // Set of completed marker keys for the *current map*.
  // Keys are "categoryId::subtypeId::markerId".
  // const [completedSet, setCompletedSet] = useState<Set<string>>(
  //   () => new Set(),
  // );
  const [completedBySubtype, setCompletedBySubtype] = useState<
    Record<string, Set<number>>
  >({});


  // --- Helper: build a completion key (no mapId inside, since we store per-map) ---
  // const buildCompletedKey = useCallback(
  //   (marker: MarkerInstance) =>
  //     `${marker.subtype}::${marker.indexInSubtype}`,
  //   [],
  // );

  const markers: MarkerWithTranslations[] = useMemo(() => {
    if (!selectedMap) return [];

    // Short map name (no faction suffix), e.g. "斐尔特朗" / "Verteron" — emitted
    // by the tools into maps.json alongside the full `name`. Used to label
    // per-marker ids like hidden cubes. Falls back to the full name.
    const mapFullName = t(`maps:${selectedMap.name}.name`, selectedMap.name);
    const shortMapName = t(`maps:${selectedMap.name}.shortName`, mapFullName);

    return baseMarkers.map((m) => {
      let localizedName = t(`${markerNs}:${m.id}.name`, m.name ?? "");
      let localizedDescription = t(`${markerNs}:${m.id}.description`, "");

      if (m.subtype === "hiddenCube") {
        // Hidden-cube markers are generically named ("隐藏背包"); their real id
        // is the "#N" description. Show "<map> #N" (e.g. "斐尔特朗 #1") as the
        // name and drop the now-redundant description.
        const num = localizedDescription || `#${m.indexInSubtype + 1}`;
        localizedName = `${shortMapName} ${num}`;
        localizedDescription = "";
      } else if (localizedDescription && localizedDescription === localizedName) {
        // description just repeats the name → treat as empty so the UI shows
        // the "no description" placeholder instead of a duplicate line.
        localizedDescription = "";
      }

      const category = m.category || subtypeToCategory[m.subtype] || "unknown";
      return {
        ...m,
        category,
        localizedName,
        localizedDescription,
      };
    });
  }, [baseMarkers, selectedMap, markerNs, t, subtypeToCategory]);

  const markersById: Record<string, MarkerWithTranslations> = useMemo(() => {
    const dict: Record<string, MarkerWithTranslations> = {};
    for (const m of markers) {
      dict[m.id] = m;
    }
    return dict;
  }, [markers]);


  // --- Load markers for the selected map ---
  useEffect(() => {
    if (!selectedMap) {
      setBaseMarkers([]);
      setRegions([]);
      setMarkersMapId(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const raw = await loadGameData<RawMarkersFile>(
          `data/markers/${selectedMap?.name}.json`,
        );
        if (cancelled) return;
        const rawRegion = await loadGameData<RawRegionsFile>(
          `data/regions/${selectedMap?.name}.json`,
        )
        setBaseMarkers(raw.markers || []);
        setRegions(rawRegion.regions || []);
        setMarkersMapId(selectedMap?.id ?? null);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setBaseMarkers([]);
          setRegions([]);
          // Load failed: markers belong to no map. Leaving this null keeps
          // per-map persistence consumers read-only, so an error can't wipe
          // stored state.
          setMarkersMapId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedMap]);

  // --- Total unique indexInSubtype counts per subtype (N) ---
  const subtypeCounts = useMemo<Record<string, number>>(() => {
    const indexSets: Record<string, Set<number>> = {};

    for (const m of baseMarkers) {
      if (!indexSets[m.subtype]) indexSets[m.subtype] = new Set();
      indexSets[m.subtype].add(m.indexInSubtype);
    }

    const counts: Record<string, number> = {};
    for (const subtype of Object.keys(indexSets)) {
      counts[subtype] = indexSets[subtype].size;
    }

    return counts;
  }, [baseMarkers]);

  // --- Completed counts per subtype (X in X/N) ---
  const completedCounts = useMemo<Record<string, number>>(() => {
    const result: Record<string, number> = {};

    for (const [subtype, indexSet] of Object.entries(completedBySubtype)) {
      result[subtype] = indexSet.size;
    }

    return result;
  }, [completedBySubtype]);

  /* -----------------------------------------------
   * Load completion state (v2, fallback to v1)
   * -------------------------------------------- */
  useEffect(() => {
    if (!selectedMap) {
      setCompletedBySubtype({});
      return;
    }

    const mapName = selectedMap.name;

    // 1. Collect all subtypes in this map
    const subtypes = new Set(baseMarkers.map((m) => m.subtype));

    const loaded: Record<string, Set<number>> = {};

    let v2Found = false;

    for (const subtype of subtypes) {
      const v2 = loadV2Subtype(mapName, subtype);
      if (v2.size > 0) v2Found = true;
      loaded[subtype] = v2;
    }

    if (v2Found) {
      // normal load
      setCompletedBySubtype(loaded);
      return;
    }

    // 2. No v2 → migrate from v1
    const v1 = loadV1(mapName);
    if (v1.size === 0) {
      setCompletedBySubtype(loaded);
      return;
    }

    console.log("[Markers] Migrating V1 → V2");

    // Build subtype→Set(index) from v1 uuid keys
    const migrated: Record<string, Set<number>> = {};
    for (const m of baseMarkers) {
      const uuid = m.id;
      if (!v1.has(uuid)) continue;

      if (!migrated[m.subtype]) migrated[m.subtype] = new Set();
      migrated[m.subtype]!.add(m.indexInSubtype);
    }

    // Save as v2
    for (const subtype of Object.keys(migrated)) {
      saveV2Subtype(mapName, subtype, migrated[subtype]!);
    }

    // Merge into empty-loaded
    setCompletedBySubtype(() => ({ ...loaded, ...migrated }));
  }, [selectedMap, baseMarkers]);

  // --- Toggle a marker's completed state ---
  const toggleMarkerCompleted = useCallback(
    (marker: MarkerInstance) => {
      if (!selectedMap) return;
      const mapName = selectedMap.name;

      const { subtype, indexInSubtype } = marker;

      setCompletedBySubtype((prev) => {
        const next = { ...prev };
        const set = new Set(prev[subtype] ?? []);

        if (set.has(indexInSubtype)) set.delete(indexInSubtype);
        else set.add(indexInSubtype);

        next[subtype] = set;

        saveV2Subtype(mapName, subtype, set);
        return next;
      });
    },
    [selectedMap]
  );

  const clearMarkerCompleted = useCallback(() => {
    if (!selectedMap) return;
    const mapName = selectedMap.name;
    clearV1(mapName);
    setCompletedBySubtype((prev) => {
      const next: Record<string, Set<number>> = {};
      for (const subtype of Object.keys(prev)) {
        next[subtype] = new Set();
        saveV2Subtype(mapName, subtype, new Set());
      }
      return next;
    });
  }, [selectedMap]);


  return (
    <MarkersContext.Provider value={{
      markers,
      markersById,
      regions,
      loading,
      markersMapId,
      showLabels,
      setShowLabels,
      subtypeCounts,
      completedCounts,
      completedBySubtype,
      toggleMarkerCompleted,
      clearMarkerCompleted,
    }}>
      {children}
    </MarkersContext.Provider>
  );
}

export function useMarkers(): MarkersContextValue {
  const ctx = useContext(MarkersContext);
  if (!ctx) {
    throw new Error("useMarkers must be used inside <MarkersProvider>");
  }
  return ctx;
}
