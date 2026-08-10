import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";
import {
  GameMapView,
  type EngineMarker,
  type GameMapViewLabels,
  type MapRef,
} from "@gamemap/map-engine";
import type { GlMapRef } from "@gamemap/map-engine-gl";
import {
  ArkiveMobileMapControls,
  ShellLayout,
  SearchPanel,
  readMapView,
  useMapViewMemory,
  type MapViewStore,
  type SearchItem,
  canUseLodTiers,
} from "@gamemap/map-shell";
import { useIsMobile } from "@gamemap/ui";
import { ArkiveAccountControl } from "@gamemap/auth";
import { browserMemory, defineMemoryRecord, isString, memoryPolicy } from "@gamemap/state-memory";
import { useGameMap } from "@/context/GameMapContext";
import { useMarkers } from "@/context/MarkersContext";
import { defaultVisibleSubtypeKeys, useGameData } from "@/context/GameDataContext";
import { useSubzoneLookup } from "@/features/map/useSubzoneLookup";
import { aionAssets } from "@/features/map/aionAssets";
import { aionTheme } from "@/features/map/aionTheme";
import MarkerPopupContent from "@/features/map/popup/MarkerPopupContent";
import Sidebar from "@/features/map/sidebar/Sidebar";
import InfoSidebar from "@/features/map/sidebar/InfoSidebar";
import SelectMap from "@/features/map/sidebar/SelectMap";
import MarkerTypesSection from "@/features/map/sidebar/MarkerTypesSection";
import TopNavbar from "@/components/TopNavbar";
import { getQueryParam, parseIconUrl } from "@/lib/url";
import {
  resolveMapEngine,
  useStoredMapEngine,
} from "@/lib/mapEngineChoice";
import { ICP_RECORD, MAP_FLY_TO_DURATION } from "@/lib/constants";

// three.js + earcut are ~1.5 MB that only this route needs — see GlMapView.
const GlGameMapView = lazy(() => import("@/features/map/GlMapView"));

// Per-map view + selection persistence (center, zoom, selected marker), fed
// into useMapViewMemory. The storage-free shell hook gets storage through this
// adapter, same as the theme.
const MAP_VIEW_KEY = "aion2.map.view";
const mapViewRecord = defineMemoryRecord({
  id: "view",
  namespace: "aion2",
  surface: "map",
  ...memoryPolicy.recentActivity("clear-recent-map-view"),
  schemaVersion: "1.0.0",
  defaultValue: () => "",
  validate: isString,
  legacyKeys: [MAP_VIEW_KEY],
  migrateLegacy: (raw: string) => raw,
});
const mapViewStore: MapViewStore = {
  get: () => browserMemory.read(mapViewRecord) || null,
  set: (raw) => { browserMemory.write(mapViewRecord, raw); },
};

export default function MapRoute() {
  const mapRef = useRef<MapRef>(null);
  // The one prop the two engines do not share: Leaflet hands back an L.Map,
  // the GL engine a small {getCenter,getZoom,flyTo,project,dispose} handle.
  const glMapRef = useRef<GlMapRef | null>(null);
  // A valid `?engine=` wins for this visit; otherwise the stored choice, which
  // itself defaults to GL. Precedence lives in the shell, not here.
  const engineParam = useSearch({ from: "/", select: (s) => s.engine });
  const storedEngine = useStoredMapEngine();
  const engine = resolveMapEngine(engineParam, storedEngine);
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
  const { t, i18n } = useTranslation();

  // Whether the user has actually changed the marker filter. Compared against the
  // map's DEFAULT set, not against every subtype: the default is a strict subset
  // (the "location" category), so an all-subtypes comparison reported "changed"
  // on a first visit with no interaction and could never read as unchanged.
  const filtersChangedFromDefault = useMemo(() => {
    if (!selectedMap || !visibleSubtypes || allSubtypes.size === 0) return false;
    const defaults = defaultVisibleSubtypeKeys(allSubtypes, selectedMap);
    if (defaults.size !== visibleSubtypes.size) return true;
    for (const key of defaults) if (!visibleSubtypes.has(key)) return true;
    return false;
  }, [selectedMap, visibleSubtypes, allSubtypes]);

  // Below md the 346px sidebar left the map ~44px wide, so the mobile branch
  // (at the end of this component, after every hook) renders the map full-screen
  // and moves the sidebar's contents into bottom sheets.
  const isMobile = useIsMobile();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);

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
  // The engine consumes `initialView` at mount only, and the hook memoizes it
  // per map id — so on the remount caused by a breakpoint switch (or by
  // swapping the renderer, which unmounts one engine and mounts the other) it
  // would replay the view from page load (or the whole-map default, if nothing
  // was stored yet) and throw away wherever the user had panned to. Re-read the
  // persisted value whenever either flips, so the remount lands where the user
  // actually was.
  const initialViewForMount = useMemo(
    () => readMapView(mapViewStore, mapId).view ?? initialView,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapId, isMobile, engine],
  );
  // Marker id restored from storage — passed to the engine so the restore does
  // NOT fly (the restored center wins); a later manual selection flies again.
  const [restoredMarkerId, setRestoredMarkerId] = useState<string | null>(null);

  // Ids of the current search results — forced onto the map so a hit shows even
  // when its subtype filter is off (the engine bypasses the filter for these).
  const [searchResultIds, setSearchResultIds] = useState<string[]>([]);
  const forceShowIds = useMemo(() => new Set(searchResultIds), [searchResultIds]);
  // Crossing the breakpoint swaps the two trees below, which remounts Leaflet
  // (a phone rotated to landscape is 844px wide, so this is a real path). Any
  // sheet that was open belongs to the tree being torn down, so reset it —
  // otherwise rotating back pops it open again unbidden.
  useEffect(() => {
    if (!isMobile) {
      setFilterSheetOpen(false);
      setSearchSheetOpen(false);
      setSearchResultIds([]);
    }
  }, [isMobile]);


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
      placeholder: t(
        "common:globalSearch.placeholder",
        "Search quests, NPCs, items, or map markers",
      ),
      resultsCount: (n: number) =>
        t("common:search.resultsCount", {
          count: n,
          defaultValue: "{{count}} results",
        }),
      unnamed: t("common:markerSearch.unnamed", "Unnamed marker"),
      noDescription: t("common:ui.noDescription", "No description"),
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

  // Every prop except `mapRef`, so the two engines cannot drift apart. The
  // engines' prop types are field-for-field identical bar that one ref.
  const sharedMapProps = {
    map: selectedMap,
    markers: engineMarkers,
    regions,
    visibleSubtypes,
    visibleRegions,
    showLabels,
    showBorders,
    // Data-gated: Abyss_Battlefield_A's 121 markers are all tier 2, so LOD would
    // draw nothing there at the mount zoom. The switch stays the user's.
    lodEnabled: lodEnabled && canUseLodTiers(engineMarkers),
    selectedMarkerId,
    forceShowIds,
    selectedPosition,
    initialView: initialViewForMount,
    onViewChange: saveView,
    suppressInitialFlyForId: restoredMarkerId,
    onToggleMarker: handleToggleMarker,
    subzoneAt,
    flyToDuration: MAP_FLY_TO_DURATION,
    assets: aionAssets,
    theme: aionTheme,
    labels,
    renderPopupContent,
    exposeTestHandle: import.meta.env.DEV,
  };

  // Defined once and rendered by both branches, so the phone and desktop paths
  // can never drift in what they pass to the engine or the search index.
  const mapView =
    engine === "gl" ? (
      // No fallback content: the chunk is small and `.gmgl-map-root`'s
      // background already fills the box, so a spinner would only flash.
      <Suspense fallback={null}>
        <GlGameMapView mapRef={glMapRef} {...sharedMapProps} />
      </Suspense>
    ) : (
      <GameMapView mapRef={mapRef} {...sharedMapProps} />
    );

  const searchPanel = (variant: "floating" | "inline") => (
    <SearchPanel
      items={searchItems}
      onSelect={setSelectedMarkerId}
      onFlyTo={setSelectedPosition}
      onResultsChange={setSearchResultIds}
      initialQuery={initialQuery}
      labels={searchLabels}
      searchFields={["name", "description"]}
      resultAside={(itm) => subzoneAt(itm.x, itm.y) || undefined}
      variant={variant}
      // The right sidebar's collapse tab hangs 32px into the map column at
      // y≈100px; clear it so it never lands on the results list.
      floatingPlacement="center"
    />
  );

  if (isMobile) {
    return (
      <div className="arkive-mobile-map aion2-mobile-map relative flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground">
        {/* Same flex chain as the desktop ShellLayout: the map root needs a
            definite height or Leaflet sizes to zero on mount. */}
        <main className="relative flex min-w-0 flex-1 overflow-hidden">
          {mapView}
        </main>

        <ArkiveMobileMapControls
          // The map route renders no header, so this is the only account surface
          // on aion2's landing page.
          account={<ArkiveAccountControl language={i18n.resolvedLanguage ?? i18n.language} variant="mobileHeader" />}
          search={{
            label: t("common:ui.search", "Search"),
            open: searchSheetOpen,
            onOpenChange: (open) => {
              setSearchSheetOpen(open);
              if (!open) setSearchResultIds([]);
            },
            content: searchPanel("inline"),
          }}
          filter={{
            label: t("common:menu.markerTypes", "Marker Types"),
            open: filterSheetOpen,
            onOpenChange: setFilterSheetOpen,
            active: filtersChangedFromDefault,
            header: <SelectMap />,
            content: <MarkerTypesSection />,
          }}
        />
      </div>
    );
  }

  return (
    <ShellLayout
      className="arkive-map-page aion2-map-page bg-background text-foreground"
      topBar={<TopNavbar />}
      sidebar={<Sidebar />}
      rightSidebar={<InfoSidebar />}
    >
      <div className="relative flex flex-1 overflow-hidden">
        {mapView}
        {searchPanel("floating")}
      </div>
    </ShellLayout>
  );
}
