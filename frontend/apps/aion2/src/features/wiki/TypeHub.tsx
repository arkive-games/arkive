import { useEffect, useMemo, useState } from "react";
import { IconChevronRight, IconSearch } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import MiniSearch, { type SearchResult } from "minisearch";

import { Input } from "@gamemap/ui";
import { defineMemoryRecord, isString, memoryPolicy, useMemoryState } from "@gamemap/state-memory";
import { loadTaxonomy, loadWikiIndex } from "@/lib/wiki";
import type { WikiGroup, WikiIndexDoc, WikiTaxonomy } from "@/types/wiki";

type SearchDoc = { id: number; name: string };
type SearchHit = SearchResult & Pick<SearchDoc, "id" | "name">;
type FactionBucket = "light" | "dark" | "both";
type SectionLink = { slug: string; count: number };
type SectionRaceCounts = Record<WikiIndexDoc["race"], number>;

const BUCKETS: FactionBucket[] = ["light", "dark", "both"];
const SECTION_LINK_CLASS =
  "group flex min-h-10 items-center justify-between gap-3 border-b border-border/70 px-1 py-2 text-sm transition-colors hover:border-[color:var(--arkive-nav-accent)] hover:text-[color:var(--arkive-nav-active)] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)] md:min-h-0 md:py-1.5";
const queryRecord = defineMemoryRecord({
  id: "query", namespace: "aion2", surface: "wiki-catalog",
  ...memoryPolicy.sessionContext("clear-wiki-search"),
  schemaVersion: "1.0.0", defaultValue: () => "", validate: isString,
});

function emptyBuckets(): Record<FactionBucket, SectionLink[]> {
  return { light: [], dark: [], both: [] };
}

function sectionBucket(counts: SectionRaceCounts): FactionBucket {
  if (counts.light > 0 && counts.dark === 0) return "light";
  if (counts.dark > 0 && counts.light === 0) return "dark";
  return "both";
}

function HubLoading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading wiki index">
      <div className="rounded-xl border border-border bg-card/70 p-6">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-full max-w-lg animate-pulse rounded bg-muted" />
        <div className="mt-6 h-12 w-full animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="hidden h-56 animate-pulse rounded-lg bg-muted lg:block" />
        <div className="space-y-5">
          <div className="h-36 animate-pulse rounded-lg bg-muted" />
          <div className="h-52 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}

export default function TypeHub({ type }: { type: string }) {
  const { t } = useTranslation(["wiki", "wiki/taxonomy", `wiki/${type}`]);
  const [tax, setTax] = useState<WikiTaxonomy | null>(null);
  const [docs, setDocs] = useState<WikiIndexDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useMemoryState(queryRecord, { partition: type, debounceMs: 200 });

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([loadTaxonomy(), loadWikiIndex(type)])
      .then(([nextTax, index]) => {
        if (!live) return;
        setTax(nextTax);
        setDocs(index.docs);
      })
      .catch(console.error)
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [type]);

  const search = useMemo(() => {
    const index = new MiniSearch<SearchDoc>({
      fields: ["name"],
      storeFields: ["id", "name"],
      searchOptions: { prefix: true, fuzzy: 0.2 },
      tokenize: (text) => [...text],
    });
    index.addAll(
      docs.map((doc) => ({
        id: doc.id,
        name: t(`wiki/${type}:${doc.id}.name`),
      })),
    );
    return index;
  }, [docs, t, type]);

  const hits = q.trim()
    ? (search.search(q).slice(0, 20) as SearchHit[])
    : [];
  const node = tax?.types.find((entry) => entry.slug === type);
  const sectionCounts = useMemo(() => {
    const counts = new Map<string, SectionRaceCounts>();
    for (const doc of docs) {
      if (!doc.group) continue;
      const key = `${doc.group}\0${doc.section}`;
      const raceCounts =
        counts.get(key) ?? ({ light: 0, dark: 0, all: 0 } as SectionRaceCounts);
      raceCounts[doc.race] += 1;
      counts.set(key, raceCounts);
    }
    return counts;
  }, [docs]);

  useEffect(() => {
    if (!node) return;
    document.title = `${t(`wiki/taxonomy:types.${type}.name`)} - AION2 Wiki`;
  }, [node, t, type]);

  if (loading) return <HubLoading />;
  if (!node) {
    return <p className="text-muted-foreground">{t("wiki:list.empty")}</p>;
  }

  function getGroupBuckets(group: WikiGroup) {
    const buckets = emptyBuckets();
    for (const section of group.sections) {
      const counts = sectionCounts.get(`${group.slug}\0${section.slug}`);
      if (!counts) continue;
      const count = counts.light + counts.dark + counts.all;
      buckets[sectionBucket(counts)].push({ slug: section.slug, count });
    }
    return buckets;
  }

  function renderSectionLinks(
    groupSlug: string,
    bucket: FactionBucket,
    sections: SectionLink[],
  ) {
    return (
      <ul className="grid grid-cols-1 gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <li key={section.slug}>
            {bucket === "both" ? (
              <Link
                to="/wiki/$type/$slug"
                params={{ type, slug: groupSlug }}
                hash={section.slug}
                data-testid={`section-chip-${section.slug}`}
                className={SECTION_LINK_CLASS}
              >
                <span className="min-w-0 truncate">
                  {t(`wiki/taxonomy:sections.${section.slug}.name`)}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {section.count}
                </span>
              </Link>
            ) : (
              <Link
                to="/wiki/$type/$slug"
                params={{ type, slug: groupSlug }}
                search={{ faction: bucket }}
                hash={section.slug}
                data-testid={`section-chip-${section.slug}`}
                className={SECTION_LINK_CLASS}
              >
                <span className="min-w-0 truncate">
                  {t(`wiki/taxonomy:sections.${section.slug}.name`)}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {section.count}
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-8" data-testid="wiki-type-hub">
      <header className="rounded-xl border border-border bg-card/70 p-5 shadow-[0_0.75rem_2rem_rgba(15,76,73,0.06)] md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-[color:var(--arkive-nav-accent)]">
              {t("wiki:hub.archive")}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-[color:var(--arkive-nav-active)]">
              {t(`wiki/taxonomy:types.${type}.name`)}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
              {t(`wiki:hub.description.${type}`, t("wiki:home.subtitle"))}
            </p>
          </div>
          <div className="border-l-2 border-[color:var(--arkive-nav-accent)] pl-4 md:text-right">
            <strong className="block text-2xl font-bold tabular-nums text-[color:var(--arkive-nav-active)]">
              {node.count.toLocaleString()}
            </strong>
            <span className="text-xs text-muted-foreground">
              {t("wiki:hub.entries")}
            </span>
          </div>
        </div>

        <div className="relative mt-6">
          <IconSearch
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            stroke={1.8}
            aria-hidden
          />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={t("wiki:hub.searchHint")}
            aria-label={t("wiki:list.search")}
            className="h-12 rounded-lg border-border bg-background pl-11 pr-4 text-sm shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]"
            data-testid="wiki-search"
          />
          {q.trim() && (
            <div
              className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-[var(--arkive-layer-popover)] max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-[0_1rem_2.5rem_rgba(15,76,73,0.16)]"
              data-testid="wiki-search-results"
            >
              {hits.length > 0 ? (
                <ul>
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <Link
                        to="/wiki/$type/$slug"
                        params={{ type, slug: String(hit.id) }}
                        onClick={() => setQ("")}
                        className="flex min-h-10 items-center justify-between gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]"
                      >
                        <span className="min-w-0 truncate font-medium">{hit.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {t("wiki:hub.resultId", { id: hit.id })}
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
      </header>

      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <p className="text-xs font-semibold text-muted-foreground">
              {t("wiki:hub.categories")}
            </p>
            <nav
              className="relative mt-4 before:absolute before:bottom-2 before:left-1.5 before:top-2 before:w-px before:bg-[color:var(--arkive-nav-accent)] before:opacity-30"
              aria-label={t("wiki:hub.categories")}
            >
              <ul className="space-y-1">
                {node.groups.map((group) => (
                  <li key={group.slug}>
                    <a
                      href={`#group-${group.slug}`}
                      className="group relative flex items-center justify-between gap-3 py-2 pl-6 text-sm text-muted-foreground hover:text-[color:var(--arkive-nav-active)] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]"
                      data-testid={`wiki-hub-toc-${group.slug}`}
                    >
                      <span className="absolute left-0 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-[color:var(--arkive-nav-accent)] bg-background transition-colors group-hover:bg-[color:var(--arkive-nav-accent)]" />
                      <span className="min-w-0 truncate font-medium">
                        {t(`wiki/taxonomy:groups.${type}.${group.slug}.name`)}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums">{group.count}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-3">
            <div>
              <p className="text-xs font-semibold text-[color:var(--arkive-nav-accent)]">
                {t("wiki:hub.browse")}
              </p>
              <h2 className="mt-1 text-xl font-bold text-[color:var(--arkive-nav-active)]">
                {t("wiki:hub.categories")}
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {t("wiki:hub.groupCount", { count: node.groups.length })}
            </span>
          </div>

          <div className="space-y-7">
            {node.groups.map((group) => {
              const buckets = getGroupBuckets(group);
              const visibleBuckets = BUCKETS.filter(
                (bucket) => buckets[bucket].length > 0,
              );
              const showBucketLabels = visibleBuckets.length > 1 || type === "quest";
              return (
                <section
                  key={group.slug}
                  id={`group-${group.slug}`}
                  className="scroll-mt-8 border-b border-border pb-7 last:border-b-0"
                  data-testid={`wiki-hub-group-${group.slug}`}
                >
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <Link
                      to="/wiki/$type/$slug"
                      params={{ type, slug: group.slug }}
                      className="group inline-flex min-w-0 items-center gap-2 rounded-sm text-lg font-semibold text-[color:var(--arkive-nav-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]"
                    >
                      <span className="truncate">
                        {t(`wiki/taxonomy:groups.${type}.${group.slug}.name`)}
                      </span>
                      <IconChevronRight
                        className="size-4 shrink-0 text-[color:var(--arkive-nav-accent)] transition-transform group-hover:translate-x-0.5"
                        stroke={1.8}
                        aria-hidden
                      />
                    </Link>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {t("wiki:hub.groupEntries", { count: group.count })}
                    </span>
                  </div>

                  <div className="space-y-5">
                    {visibleBuckets.map((bucket) => (
                      <div key={bucket}>
                        {showBucketLabels && (
                          <h3
                            className="mb-1 text-xs font-semibold text-muted-foreground"
                            data-testid={`faction-col-${bucket}`}
                          >
                            {t(`wiki:list.${bucket}`)}
                          </h3>
                        )}
                        {renderSectionLinks(group.slug, bucket, buckets[bucket])}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
