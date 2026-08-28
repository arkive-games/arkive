import { useEffect, useMemo, useState } from "react";
import {
  IconChecklist,
  IconChevronRight,
  IconPackage,
  IconSparkles,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import WikiCatalogToolbar, {
  type WikiCatalogSource,
} from "@/features/wiki/WikiCatalogToolbar";
import { WikiLoading } from "@/features/wiki/ui";
import { WIKI_TYPES, type WikiType } from "@/features/wiki/wikiRecent";
import { loadTaxonomy, loadWikiIndex } from "@/lib/wiki";
import type { WikiIndexDoc, WikiTaxonomy } from "@/types/wiki";

const TYPE_ICONS: Record<WikiType, Icon> = {
  quest: IconChecklist,
  npc: IconUsers,
  item: IconPackage,
};

const TYPE_LIST_CLASS: Record<WikiType, string> = {
  quest: "sm:grid-cols-2 xl:grid-cols-3",
  npc: "sm:grid-cols-3",
  item: "sm:grid-cols-2 xl:grid-cols-4",
};

export default function WikiHome() {
  const { t } = useTranslation(["wiki", "wiki/taxonomy"]);
  const [tax, setTax] = useState<WikiTaxonomy | null>(null);
  const [indexes, setIndexes] = useState<Record<WikiType, WikiIndexDoc[]>>({
    quest: [],
    npc: [],
    item: [],
  });

  const [wantsSearch, setWantsSearch] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const nextTaxonomy = await loadTaxonomy();
        if (!live) return;
        setTax(nextTaxonomy);
      } catch (error) {
        console.error(error);
      }
    };

    void load();
    return () => {
      live = false;
    };
  }, []);

  /*
   * The three search indexes are fetched only once the visitor intends to
   * search: together they are ~2 MB (item 1,382,860 B, npc 523,464 B, quest
   * 129,983 B) against the 6 KB taxonomy this page actually renders from, and
   * every visit paid for them.
   */
  useEffect(() => {
    if (!wantsSearch) return;
    let live = true;
    const load = async () => {
      try {
        const [quest, npc, item] = await Promise.all(
          WIKI_TYPES.map((type) => loadWikiIndex(type)),
        );
        if (!live) return;
        setIndexes({ quest: quest.docs, npc: npc.docs, item: item.docs });
      } catch (error) {
        console.error(error);
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [wantsSearch]);

  useEffect(() => {
    document.title = t("wiki:home.title");
  }, [t]);

  const searchSources = useMemo<WikiCatalogSource[]>(
    () => WIKI_TYPES.map((type) => ({ type, docs: indexes[type] })),
    [indexes],
  );

  if (!tax) {
    return (
      <div data-testid="wiki-home">
        <WikiLoading />
      </div>
    );
  }

  const totalCount = tax.types.reduce((sum, type) => sum + type.count, 0);

  return (
    <div data-testid="wiki-home">
      {/* Visually suppressed, not absent. The redesign drops the big title, but
          a page whose first heading is the rail's "Recently viewed" h2 has no
          document outline, and screen-reader users navigate by heading. */}
      <h1 className="sr-only">{t("wiki:home.title")}</h1>
      <WikiCatalogToolbar
        title={t("wiki:home.title")}
        count={totalCount}
        sources={searchSources}
        scope="all"
        showHeading={false}
        onSearchIntent={() => setWantsSearch(true)}
      />

      <div className="divide-y divide-border">
        {tax.types.map((type) => {
          const wikiType = type.slug as WikiType;
          const TypeIcon = TYPE_ICONS[wikiType] ?? IconPackage;
          return (
            <section
              key={type.slug}
              className="grid gap-4 py-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6"
            >
              <div className="min-w-0">
                <Link
                  to="/wiki/$type"
                  params={{ type: type.slug }}
                  className="group inline-flex min-w-0 items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <TypeIcon
                    className="size-5 shrink-0 text-[color:var(--arkive-nav-accent)]"
                    stroke={1.8}
                    aria-hidden
                  />
                  <span className="truncate text-lg font-semibold text-[color:var(--arkive-nav-active)]">
                    {t(`wiki/taxonomy:types.${type.slug}.name`)}
                  </span>
                  <IconChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    stroke={1.8}
                    aria-hidden
                  />
                </Link>
                <span className="mt-2 block pl-8 text-xs tabular-nums text-muted-foreground">
                  {t("wiki:hub.groupEntries", { count: type.count })}
                </span>
              </div>
              <ul
                className={`grid grid-cols-1 border-l border-t border-border ${TYPE_LIST_CLASS[wikiType]}`}
              >
                {type.groups.map((g) => (
                  <li key={g.slug}>
                    <Link
                      to="/wiki/$type/$slug"
                      params={{ type: type.slug, slug: g.slug }}
                      className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-r border-border px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-[color:var(--arkive-nav-active)] focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      data-testid={`wiki-group-${g.slug}`}
                    >
                      <span className="min-w-0 truncate font-medium">
                        {t(`wiki/taxonomy:groups.${type.slug}.${g.slug}.name`)}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {g.count.toLocaleString()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <section className="border-t border-border py-5">
        <Link
          to="/wiki/utopian-theater"
          className="group grid gap-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6"
          data-testid="wiki-utopian-theater-entry"
        >
          <div className="flex min-w-0 items-start gap-3">
            <IconSparkles
              className="mt-0.5 size-5 shrink-0 text-[color:var(--arkive-nav-accent)]"
              stroke={1.8}
              aria-hidden
            />
            <div className="min-w-0">
              <span className="block truncate text-lg font-semibold text-[color:var(--arkive-nav-active)]">
                {t("wiki:utopianTheater.title")}
              </span>
              <span className="mt-2 block text-xs text-muted-foreground">
                {t("wiki:utopianTheater.homeSummary")}
              </span>
            </div>
            <IconChevronRight
              className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              stroke={1.8}
              aria-hidden
            />
          </div>
          <div className="flex min-h-12 items-center border-l border-t border-border px-3 py-2 text-sm text-muted-foreground lg:border-t-0">
            {t("wiki:utopianTheater.homeDescription")}
          </div>
        </Link>
      </section>
      <section className="border-t border-border py-5">
        <Link
          to="/wiki/traintrade"
          className="group grid gap-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6"
          data-testid="wiki-train-trade-entry"
        >
          <div className="flex min-w-0 items-start gap-3">
            <IconPackage
              className="mt-0.5 size-5 shrink-0 text-[color:var(--arkive-nav-accent)]"
              stroke={1.8}
              aria-hidden
            />
            <div className="min-w-0">
              <span className="block truncate text-lg font-semibold text-[color:var(--arkive-nav-active)]">
                {t("wiki:trainTrade.title")}
              </span>
              <span className="mt-2 block text-xs text-muted-foreground">
                {t("wiki:trainTrade.homeSummary")}
              </span>
            </div>
            <IconChevronRight
              className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              stroke={1.8}
              aria-hidden
            />
          </div>
          <div className="flex min-h-12 items-center border-l border-t border-border px-3 py-2 text-sm text-muted-foreground lg:border-t-0">
            {t("wiki:trainTrade.homeDescription")}
          </div>
        </Link>
      </section>
    </div>
  );
}
