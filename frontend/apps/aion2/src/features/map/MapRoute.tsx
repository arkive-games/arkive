import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  GameMapView,
  type EngineMarker,
  type GameMapViewLabels,
  type MapRef,
} from "@gamemap/map-engine";
import {
  ShellLayout,
  SearchPanel,
  readMapView,
  useMapViewMemory,
  type MapViewStore,
  type SearchItem,
} from "@gamemap/map-shell";
import { useGameMap } from "@/context/GameMapContext";
import { useMarkers } from "@/context/MarkersContext";
import { useGameData } from "@/context/GameDataContext";
import { useSubzoneLookup } from "@/features/map/useSubzoneLookup";
import { aionAssets } from "@/features/map/aionAssets";
import { aionTheme } from "@/features/map/aionTheme";
import MarkerPopupContent from "@/features/map/popup/MarkerPopupContent";
import Sidebar from "@/features/map/sidebar/Sidebar";
import TopNavbar from "@/components/TopNavbar";
import { getQueryParam, parseIconUrl } from "@/lib/url";
import { ICP_RECORD, MAP_FLY_TO_DURATION } from "@/lib/constants";

// Per-map view + selection persistence (center, zoom, selected marker), fed
// into useMapViewMemory. The storage-free shell hook gets storage through this
// adapter, same as the theme.
const MAP_VIEW_KEY = "aion2.map.view";
const mapViewStore: MapViewStore = {
  get: () => {
    try {
      return localStorage.getItem(MAP_VIEW_KEY);
    } catch {
      return null;
    }
  },
  set: (raw) => {
    try {
      localStorage.setItem(MAP_VIEW_KEY, raw);
    } catch { /* no storage — feature degrades to non-persistent */ }
  },
};

export default function MapRoute() {
  const mapRef = useRef<MapRef>(null);
  const appliedDeepLink = useRef(false);
  // Whether the deep link actually navigated somewhere (marker or position) —
  // in that case the stored selection must NOT be restored on top of it.
  const deepLinkNavigated = useRef(false);

  // App contexts → engine props. MapRoute is the ADAPTER: the engine
  // components (@gamemap/map-engine) read no app context themselves;
  // everything they need is derived here and passed down.
  const { selectedMap, types } = useGameMap();
  const { markers, markersById, regions, showLabels, completedBySubtype, markersMapId } =
    useMarkers();
  const { visibleSubtypes, visibleRegions, showBorders, lodEnabled, allSubtypes } =
    useGameData();
  const subzoneAt = useSubzoneLookup();
  const { t } = useTranslation();

  // Engine chrome strings, resolved app-side (the engine itself is i18n-free).
  const labels = useMemo<GameMapViewLabels>(
    () => ({
      copyPosition: t("map.copyPosition"),
      noMapSelected: t("map.noMapSelected"),
      zoomIn: t("map.zoomIn"),
      zoomOut: t("map.zoomOut"),
      footerText: ICP_RECORD,
    }),
    [t],
  );

  // Stable render prop: popup content stays app code (router links, contexts).
  const renderPopupContent = useCallback(
    (m: EngineMarker) => <MarkerPopupContent marker={m} />,
    [],
  );

  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Per-map view (center/zoom) + selected marker, persisted across reloads.
  const mapId = selectedMap?.id ?? "";
  const { initialView, saveView, saveMarker } = useMapViewMemory(mapViewStore, mapId);
  // Marker id restored from storage — passed to the engine so the restore does
  // NOT fly (the restored center wins); a later manual selection flies again.
  const [restoredMarkerId, setRestoredMarkerId] = useState<string | null>(null);

  // Ids of the current search results — forced onto the map so a hit shows even
  // when its subtype filter is off (the engine bypasses the filter for these).
  const [searchResultIds, setSearchResultIds] = useState<string[]>([]);
  const forceShowIds = useMemo(() => new Set(searchResultIds), [searchResultIds]);

  // Prefill the search box from a `?q=` deep link (read once on mount, like the
  // marker/pos deep link below).
  const initialQuery = useMemo(() => getQueryParam("q") ?? undefined, []);

  /**
   * App markers (already translated) + subtype taxonomy + completion state →
   * the pre-resolved `EngineMarker[]` the engine components consume.
   *
   * Memoization matters: this feeds thousands of memoized `GameMarker`s, and
   * `GameMapView` keys its per-marker `LatLng` cache on this array. The array
   * (and every object in it) is reference-stable across pan/zoom re-renders —
   * it is rebuilt only when the marker set, taxonomy, translations or
   * completion state actually change (completion changes re-rendered every
   * marker under the old context wiring too).
   */
  const engineMarkers = useMemo<EngineMarker[]>(
    () =>
      markers.map((m) => {
        const sub = allSubtypes.get(m.subtype);
        let completed = false;
        if (sub?.name && completedBySubtype[sub.name]) {
          completed = completedBySubtype[sub.name].has(m.indexInSubtype);
        }
        return {
          ...m,
          subtypeMeta: sub,
          subtypeLabel: sub ? t(`types:subtypes.${sub.name}.name`) : "",
          completed,
        };
      }),
    [markers, allSubtypes, completedBySubtype, t],
  );

  // subtype name → { category id, game icon } for each result's icon + label.
  const subtypeMeta = useMemo(() => {
    const m: Record<string, { categoryId: string; iconName: string }> = {};
    for (const c of types) {
      for (const s of c.subtypes) {
        m[s.name] = {
          categoryId: s.category ?? c.name,
          iconName: s.icon || c.icon || "",
        };
      }
    }
    return m;
  }, [types]);

  // App markers → the context-free `SearchItem[]` the shared SearchPanel indexes.
  // i18n labels + icon URLs are resolved here (the panel is i18n-free); the
  // subzone is resolved lazily per shown result via `resultAside` below.
  const searchItems = useMemo<SearchItem[]>(
    () =>
      markers.map((m) => {
        const meta = subtypeMeta[m.subtype];
        const categoryId = meta?.categoryId ?? m.category;
        return {
          id: m.id,
          name: m.localizedName || "",
          description: m.localizedDescription,
          subtypeLabel: t(`types:subtypes.${m.subtype}.name`, m.subtype),
          categoryLabel: categoryId
            ? t(`types:categories.${categoryId}.name`, categoryId)
            : "",
          iconUrl:
            meta?.iconName && selectedMap
              ? parseIconUrl(meta.iconName, selectedMap)
              : undefined,
          x: m.x,
          y: m.y,
        };
      }),
    [markers, subtypeMeta, t, selectedMap],
  );

  const searchLabels = useMemo(
    () => ({
      search: t("common:ui.search", "Search"),
      resultsCount: (n: number) =>
        t("common:search.resultsCount", {
          count: n,
          defaultValue: "{{count}} results",
        }),
      unnamed: t("common:markerSearch.unnamed", "Unnamed marker"),
      noDescription: t("common:ui.noDescription", "No description"),
      scopeName: t("common:search.scopeName", "Name"),
      scopeAll: t("common:search.scopeBoth", "All"),
    }),
    [t],
  );

  // Marker-click selection is a TOGGLE: clicking the already-selected marker
  // (including the second click of a double-click) deselects it and closes the
  // popup. A functional update reads the latest committed selection, so it stays
  // correct even when a double-click's two clicks land in quick succession.
  // Passing `null` always deselects (`prev === null ? null : null`), so the
  // map-background-click and popup-unmount paths that call this with `null` keep
  // working. Search selects directly via `setSelectedMarkerId` (never toggles).
  const handleToggleMarker = useCallback((id: string | null) => {
    setSelectedMarkerId((prev) => (prev === id ? null : id));
  }, []);

  useEffect(() => {
    if (appliedDeepLink.current || Object.keys(markersById).length === 0) {
      return;
    }
    appliedDeepLink.current = true;

    const markerId = getQueryParam("marker");
    const pos = getQueryParam("pos");
    if (markerId && markersById[markerId]) {
      const marker = markersById[markerId];
      deepLinkNavigated.current = true;
      queueMicrotask(() => {
        setSelectedMarkerId(markerId);
        setSelectedPosition({
          x: marker.x,
          y: marker.y,
        });
      });
      return;
    }

    if (pos) {
      const [x, y] = pos.split(",").map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        deepLinkNavigated.current = true;
        queueMicrotask(() => setSelectedPosition({ x, y }));
      }
    }
  }, [markersById]);

  // Clear the selection when the map switches (it used to linger, id-orphaned,
  // across switches), so the new map starts from its own stored state.
  const prevMapIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedMap) return;
    if (prevMapIdRef.current === selectedMap.id) return;
    prevMapIdRef.current = selectedMap.id;
    setSelectedMarkerId(null);
    setSelectedPosition(null);
    setRestoredMarkerId(null);
  }, [selectedMap]);

  // Restore the stored selection once the map's own markers have arrived
  // (`markersMapId` lags `selectedMap.id` until then). Runs once per map load
  // — NOT on locale rebuilds of `markersById` — and never on top of a deep
  // link. Declared after the deep-link effect so the deep-link decision for
  // this markers arrival has already been made.
  const restoredForMapRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedMap || markersMapId !== selectedMap.id) return;
    if (restoredForMapRef.current === markersMapId) return;
    restoredForMapRef.current = markersMapId;
    if (deepLinkNavigated.current) return;
    const stored = readMapView(mapViewStore, mapId).marker;
    if (stored && markersById[stored]) {
      setRestoredMarkerId(stored);
      setSelectedMarkerId(stored);
    }
  }, [selectedMap, markersMapId, markersById, mapId]);

  // Persist the selection per map. Guarded on the loaded markers belonging to
  // the CURRENT map, so the transient window during a map switch can't write
  // one map's selection under the other map's key.
  useEffect(() => {
    if (!selectedMap || markersMapId !== selectedMap.id) return;
    saveMarker(selectedMarkerId);
  }, [selectedMarkerId, selectedMap, markersMapId, saveMarker]);

  return (
    <ShellLayout
      className="bg-background text-foreground"
      topBar={<TopNavbar />}
      sidebar={<Sidebar />}
    >
      <div className="relative flex flex-1 overflow-hidden">
        <GameMapView
          mapRef={mapRef}
          map={selectedMap}
          markers={engineMarkers}
          regions={regions}
          visibleSubtypes={visibleSubtypes}
          visibleRegions={visibleRegions}
          showLabels={showLabels}
          showBorders={showBorders}
          lodEnabled={lodEnabled}
          selectedMarkerId={selectedMarkerId}
          forceShowIds={forceShowIds}
          selectedPosition={selectedPosition}
          initialView={initialView}
          onViewChange={saveView}
          suppressInitialFlyForId={restoredMarkerId}
          onToggleMarker={handleToggleMarker}
          subzoneAt={subzoneAt}
          flyToDuration={MAP_FLY_TO_DURATION}
          assets={aionAssets}
          theme={aionTheme}
          labels={labels}
          renderPopupContent={renderPopupContent}
          exposeTestHandle={import.meta.env.DEV}
        />
        <SearchPanel
          items={searchItems}
          onSelect={setSelectedMarkerId}
          onFlyTo={setSelectedPosition}
          onResultsChange={setSearchResultIds}
          initialQuery={initialQuery}
          labels={searchLabels}
          searchFields={["name", "description"]}
          resultAside={(itm) => subzoneAt(itm.x, itm.y) || undefined}
        />
      </div>
    </ShellLayout>
  );
}
