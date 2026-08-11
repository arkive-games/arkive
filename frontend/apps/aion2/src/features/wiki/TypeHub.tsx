import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import WikiCatalogToolbar, {
  type WikiCatalogSource,
} from "@/features/wiki/WikiCatalogToolbar";
import type { WikiType } from "@/features/wiki/wikiRecent";
import { loadTaxonomy, loadWikiIndex } from "@/lib/wiki";
import type { WikiGroup, WikiIndexDoc, WikiTaxonomy } from "@/types/wiki";

type FactionBucket = "light" | "dark" | "both";
type FactionFilter = "all" | FactionBucket;
type SectionLink = { slug: string; count: number };
type SectionRaceCounts = Record<WikiIndexDoc["race"], number>;

const BUCKETS: FactionBucket[] = ["light", "dark", "both"];
const SECTION_LINK_CLASS =
  "grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-r border-border px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-[color:var(--arkive-nav-active)] focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)]";

function emptyBuckets(): Record<FactionBucket, SectionLink[]> {
  return { light: [], dark: [], both: [] };
}

function sectionBucket(counts: SectionRaceCounts): FactionBucket {
  if (counts.light > 0 && counts.dark === 0) return "light";
  if (counts.dark > 0 && counts.light === 0) return "dark";
  return "both";
}

function buildGroupBuckets(
  group: WikiGroup,
  sectionCounts: Map<string, SectionRaceCounts>,
) {
  const buckets = emptyBuckets();
  for (const section of group.sections) {
    const counts = sectionCounts.get(`${group.slug}\0${section.slug}`);
    if (!counts) continue;
    const count = counts.light + counts.dark + counts.all;
    buckets[sectionBucket(counts)].push({ slug: section.slug, count });
  }
  return buckets;
}

function HubLoading() {
  const { t } = useTranslation(["wiki"]);
  return (
    <div className="space-y-5" role="status" aria-label={t("wiki:common.loading")}>
      <div className="grid gap-3 border-b border-border pb-4 md:grid-cols-[13rem_minmax(22rem,1fr)] md:items-center">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-10 w-full animate-pulse rounded bg-muted" />
      <div className="h-72 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

export default function TypeHub({ type }: { type: string }) {
  const { hash } = useLocation();
  const { t } = useTranslation(["wiki", "wiki/taxonomy", `wiki/${type}`]);
  const [tax, setTax] = useState<WikiTaxonomy | null>(null);
  const [docs, setDocs] = useState<WikiIndexDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [factionSelection, setFactionSelection] = useState<{
    group: string;
    faction: FactionFilter;
  }>({ group: "", faction: "all" });

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

  const node = tax?.types.find((entry) => entry.slug === type);
  const requestedGroup = (hash ?? "").replace(/^#?group-/, "");
  const activeGroup =
    node?.groups.find((group) => group.slug === requestedGroup) ?? node?.groups[0];
  const activeGroupSlug = activeGroup?.slug ?? "";
  const searchSources = useMemo<WikiCatalogSource[]>(
    () => [{ type: type as WikiType, docs }],
    [docs, type],
  );
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
  const buckets = activeGroup
    ? buildGroupBuckets(activeGroup, sectionCounts)
    : emptyBuckets();
  const visibleBuckets = BUCKETS.filter((bucket) => buckets[bucket].length > 0);
  const activeFaction =
    factionSelection.group === activeGroupSlug
      ? factionSelection.faction
      : "all";
  const shownBuckets =
    activeFaction === "all" || !visibleBuckets.includes(activeFaction)
      ? visibleBuckets
      : [activeFaction];

  useEffect(() => {
    if (!node) return;
    document.title = `${t(`wiki/taxonomy:types.${type}.name`)} - AION2 Wiki`;
  }, [node, t, type]);

  if (loading) return <HubLoading />;
  if (!node || !activeGroup) {
    return <p className="text-muted-foreground">{t("wiki:list.empty")}</p>;
  }

  function renderSectionLinks(bucket: FactionBucket, sections: SectionLink[]) {
    return (
      <ul className="grid grid-cols-1 border-l border-t border-border sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <li key={section.slug}>
            {bucket === "both" ? (
              <Link
                to="/wiki/$type/$slug"
                params={{ type, slug: activeGroupSlug }}
                hash={section.slug}
                data-testid={`section-chip-${section.slug}`}
                className={SECTION_LINK_CLASS}
              >
                <span className="min-w-0 truncate font-medium">
                  {t(`wiki/taxonomy:sections.${section.slug}.name`)}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {section.count.toLocaleString()}
                </span>
              </Link>
            ) : (
              <Link
                to="/wiki/$type/$slug"
                params={{ type, slug: activeGroupSlug }}
                search={{ faction: bucket }}
                hash={section.slug}
                data-testid={`section-chip-${section.slug}`}
                className={SECTION_LINK_CLASS}
              >
                <span className="min-w-0 truncate font-medium">
                  {t(`wiki/taxonomy:sections.${section.slug}.name`)}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {section.count.toLocaleString()}
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div data-testid="wiki-type-hub">
      <WikiCatalogToolbar
        title={t(`wiki/taxonomy:groups.${type}.${activeGroup.slug}.name`)}
        count={activeGroup.count}
        sources={searchSources}
        scope={type}
      />

      <nav
        className="overflow-x-auto border-b border-border lg:hidden"
        aria-label={t("wiki:hub.categories")}
      >
        <ul className="flex min-w-max">
          {node.groups.map((group) => {
            const active = group.slug === activeGroup.slug;
            const opensEntries =
              group.sections.length === 1 &&
              group.sections[0]?.slug === "other";
            return (
              <li key={group.slug}>
                <Link
                  to={opensEntries ? "/wiki/$type/$slug" : "/wiki/$type"}
                  params={
                    opensEntries
                      ? { type, slug: group.slug }
                      : { type }
                  }
                  hash={opensEntries ? undefined : `group-${group.slug}`}
                  className={`flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)] ${
                    active
                      ? "border-[color:var(--arkive-nav-accent)] text-[color:var(--arkive-nav-active)]"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  aria-current={active ? "page" : undefined}
                  data-testid={`wiki-hub-toc-${group.slug}`}
                >
                  <span>{t(`wiki/taxonomy:groups.${type}.${group.slug}.name`)}</span>
                  <span className="text-xs tabular-nums">{group.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {visibleBuckets.length > 1 && (
        <div className="flex items-center border-b border-border py-3">
          <div
            className="inline-flex rounded-md border border-border bg-muted/40 p-0.5"
            role="group"
            aria-label={t("wiki:list.faction")}
          >
            {(["all", ...visibleBuckets] as FactionFilter[]).map((faction) => {
              const active = activeFaction === faction;
              return (
                <button
                  key={faction}
                  type="button"
                  onClick={() =>
                    setFactionSelection({
                      group: activeGroupSlug,
                      faction,
                    })
                  }
                  className={`min-h-9 rounded px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)] ${
                    active
                      ? "bg-background text-[color:var(--arkive-nav-active)] shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={active}
                  data-testid={`hub-faction-${faction}`}
                >
                  {t(`wiki:list.${faction}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <section
        id={`group-${activeGroup.slug}`}
        className="space-y-6 pt-5"
        data-testid={`wiki-hub-group-${activeGroup.slug}`}
      >
        {shownBuckets.length > 0 ? (
          shownBuckets.map((bucket) => (
            <section key={bucket}>
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <h2
                  className="text-sm font-semibold text-[color:var(--arkive-nav-active)]"
                  data-testid={`faction-col-${bucket}`}
                >
                  {t(`wiki:list.${bucket}`)}
                </h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {buckets[bucket]
                    .reduce((sum, section) => sum + section.count, 0)
                    .toLocaleString()}
                </span>
              </div>
              {renderSectionLinks(bucket, buckets[bucket])}
            </section>
          ))
        ) : (
          <p className="py-8 text-sm text-muted-foreground">
            {t("wiki:list.empty")}
          </p>
        )}
      </section>
    </div>
  );
}
