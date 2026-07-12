import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import {
  GlobalSearch,
  type GlobalSearchEntry,
  type GlobalSearchSource,
} from "@gamemap/map-shell";
import i18n from "@/i18n";
import { loadGameData } from "@/lib/data";
import { loadWikiIndex } from "@/lib/wiki";

const WIKI_TYPES = ["quest", "npc", "item"] as const;
type WikiType = (typeof WIKI_TYPES)[number];

type NameBundle = Record<string, { name?: string; description?: string }>;

/** The current-language resource bundle of a data-repo namespace, loaded on demand. */
async function loadBundle(ns: string): Promise<NameBundle> {
  await i18n.loadNamespaces([ns]);
  const lng = i18n.resolvedLanguage ?? i18n.language;
  return (i18n.getResourceBundle(lng, ns) ?? {}) as NameBundle;
}

/**
 * Topbar global search: wiki entities (quest/NPC/item) + the markers of every
 * map. Wiki names and marker names both come from the data-repo locale
 * namespaces (marker locale files are keyed by marker id, so no raw marker
 * fetch is needed). Wiki picks route client-side; marker picks do a full-page
 * navigation because the map page reads its deep-link params once on mount.
 */
export default function GlobalSearchWidget() {
  const { t, i18n: i18next } = useTranslation("common");
  const lng = i18next.resolvedLanguage ?? i18next.language;
  const navigate = useNavigate();
  // markerId -> mapId, filled as a side effect of the markers source load.
  const markerNav = useRef(new Map<string, string>());

  const sources = useMemo<GlobalSearchSource[]>(() => {
    const wikiSource = (type: WikiType): GlobalSearchSource => ({
      key: `wiki-${type}`,
      label: t(`globalSearch.group.${type}`),
      load: async () => {
        const [{ docs }, names] = await Promise.all([
          loadWikiIndex(type),
          loadBundle(`wiki/${type}`),
        ]);
        return docs.map(
          (d): GlobalSearchEntry => ({
            id: String(d.id),
            name: names[String(d.id)]?.name ?? "",
            detail: d.level ? `Lv.${d.level}` : undefined,
          }),
        );
      },
    });

    const markersSource: GlobalSearchSource = {
      key: "markers",
      label: t("globalSearch.group.markers"),
      load: async () => {
        const { maps } = await loadGameData<{ maps: { name: string }[] }>(
          "data/maps.json",
        );
        await i18n.loadNamespaces(["maps"]);
        const entries: GlobalSearchEntry[] = [];
        for (const map of maps) {
          const bundle = await loadBundle(`markers/${map.name}`);
          const mapLabel = i18n.t(`maps:${map.name}.shortName`, {
            defaultValue: i18n.t(`maps:${map.name}.name`, {
              defaultValue: map.name,
            }),
          });
          for (const [markerId, v] of Object.entries(bundle)) {
            if (!v?.name) continue;
            markerNav.current.set(markerId, map.name);
            entries.push({
              id: markerId,
              name: v.name,
              detail: [v.description, mapLabel].filter(Boolean).join(" · "),
            });
          }
        }
        return entries;
      },
    };

    return [...WIKI_TYPES.map(wikiSource), markersSource];
    // `lng` re-creates the sources on language change so GlobalSearch reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, lng]);

  const handleSelect = (sourceKey: string, id: string) => {
    if (sourceKey === "markers") {
      const mapId = markerNav.current.get(id);
      if (!mapId) return;
      // Full-page navigation: MapRoute applies ?map/?marker once on mount.
      window.location.assign(
        `/?map=${encodeURIComponent(mapId)}&marker=${encodeURIComponent(id)}`,
      );
      return;
    }
    const type = sourceKey.replace(/^wiki-/, "");
    void navigate({ to: "/wiki/$type/$slug", params: { type, slug: id } });
  };

  return (
    <GlobalSearch
      sources={sources}
      onSelect={handleSelect}
      lang={lng}
      labels={{
        button: t("globalSearch.button"),
        placeholder: t("globalSearch.placeholder"),
        empty: t("globalSearch.empty"),
        loading: t("globalSearch.loading"),
      }}
    />
  );
}
