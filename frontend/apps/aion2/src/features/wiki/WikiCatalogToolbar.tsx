import { useCallback, useMemo, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import MiniSearch, { type SearchResult } from "minisearch";

import { Input } from "@gamemap/ui";
import {
  defineMemoryRecord,
  isString,
  memoryPolicy,
  useMemoryState,
} from "@gamemap/state-memory";
import type { WikiIndexDoc } from "@/types/wiki";
import type { WikiType } from "@/features/wiki/wikiRecent";

export type WikiCatalogSource = {
  type: WikiType;
  docs: WikiIndexDoc[];
};

type SearchDoc = {
  id: string;
  entityId: number;
  type: WikiType;
  name: string;
  level: number;
};
type SearchHit = SearchResult & Omit<SearchDoc, "id">;

const queryRecord = defineMemoryRecord({
  id: "query",
  namespace: "aion2",
  surface: "wiki-catalog",
  ...memoryPolicy.sessionContext("clear-wiki-search"),
  schemaVersion: "1.0.0",
  defaultValue: () => "",
  validate: isString,
});

export default function WikiCatalogToolbar({
  title,
  count,
  sources,
  onSearchIntent,
  scope,
  showHeading = true,
}: {
  title: string;
  count: number;
  sources: WikiCatalogSource[];
  /**
   * Fired the first time the visitor shows intent to search, so a host can
   * defer fetching the index payloads until then.
   */
  onSearchIntent?: () => void;
  scope: string;
  showHeading?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const arm = () => {
    setArmed(true);
    onSearchIntent?.();
  };

  /*
   * Declared up front, deliberately, even though only the search results need
   * the per-type catalogues (en-US alone is 71 + 215 + 643 KB, and every
   * supported locale loads in parallel).
   *
   * react-i18next memoizes on this array and requires it to keep a constant
   * size between renders -- growing it when search is armed makes React warn
   * "the final argument passed to useMemo changed size" and the new namespaces
   * never load, so search silently returns nothing. Deferring these needs
   * `i18n.loadNamespaces` plus fully-qualified keys, not a bigger array.
   */
  const namespaces = useMemo(
    () => ["wiki", "wiki/taxonomy", ...sources.map(({ type }) => `wiki/${type}`)],
    [sources],
  );
  const { t } = useTranslation(namespaces);
  const [query, setQuery] = useMemoryState(queryRecord, {
    partition: scope,
    debounceMs: 200,
  });

  const buildSearch = useCallback(() => {
    const index = new MiniSearch<SearchDoc>({
      fields: ["name"],
      storeFields: ["entityId", "type", "name", "level"],
      searchOptions: { prefix: true, fuzzy: 0.2 },
      tokenize: (text) => [...text],
    });
    index.addAll(
      sources.flatMap(({ type, docs }) =>
        docs.map((doc) => ({
          id: `${type}:${doc.id}`,
          entityId: doc.id,
          type,
          name: t(`wiki/${type}:${doc.id}.name`),
          level: doc.level,
        })),
      ),
    );
    return index;
  }, [sources, t]);

  /*
   * Built once the visitor reaches for search, not on mount.
   *
   * On /wiki this index spans 18,850 docs and was rebuilt every time `t` changed
   * as namespaces resolved, all for a control most visits never touch. Armed
   * from the same handlers that report intent, so `useMemo` keeps its normal
   * invalidation -- `sources` or `t` moving still discards it.
   */
  const search = useMemo(() => (armed ? buildSearch() : null), [armed, buildSearch]);
  const trimmed = query.trim();
  const hits: SearchHit[] =
    search && trimmed ? (search.search(trimmed).slice(0, 20) as SearchHit[]) : [];

  return (
    <header className="border-b border-border pb-4">
      <div
        className={
          showHeading
            ? "grid gap-3 md:grid-cols-[minmax(13rem,auto)_minmax(22rem,1fr)] md:items-center"
            : "grid"
        }
      >
        {showHeading && (
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="min-w-0 truncate text-2xl font-bold text-[color:var(--arkive-nav-active)]">
              {title}
            </h1>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {t("wiki:workspace.entries", { count })}
            </span>
          </div>
        )}

        <div className="relative" role="search">
          <IconSearch
            className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            stroke={1.8}
            aria-hidden
          />
          <Input
            value={query}
            onFocus={arm}
            onChange={(event) => {
              arm();
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
            placeholder={t("wiki:hub.searchHint")}
            aria-label={t("wiki:list.search")}
            className="h-11 rounded-md border-border bg-background pl-10 pr-4 text-sm shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]"
            data-testid="wiki-search"
          />
          {query.trim() && (
            <div
              className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-[var(--arkive-layer-popover)] max-h-80 overflow-y-auto rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg"
              data-testid="wiki-search-results"
            >
              {hits.length > 0 ? (
                <ul>
                  {hits.map((hit) => (
                    <li key={`${hit.type}-${hit.entityId}`}>
                      <Link
                        to="/wiki/$type/$slug"
                        params={{ type: hit.type, slug: String(hit.entityId) }}
                        onClick={() => setQuery("")}
                        className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-md px-3 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]"
                      >
                        <span className="min-w-0 truncate font-medium">{hit.name}</span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          <span>{t(`wiki/taxonomy:types.${hit.type}.name`)}</span>
                          {hit.level > 0 && (
                            <span className="tabular-nums">
                              {t("wiki:common.level", { n: hit.level })}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  {t("wiki:list.empty")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
