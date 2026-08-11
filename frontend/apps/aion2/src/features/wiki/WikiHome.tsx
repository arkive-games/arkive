import { useEffect, useMemo, useState } from "react";
import {
  IconChecklist,
  IconChevronRight,
  IconPackage,
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

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const nextTaxonomy = await loadTaxonomy();
        if (!live) return;
        setTax(nextTaxonomy);

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
  }, []);

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
      <WikiCatalogToolbar
        title={t("wiki:home.title")}
        count={totalCount}
        sources={searchSources}
        scope="all"
        showHeading={false}
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
    </div>
  );
}
