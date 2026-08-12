import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  IconChecklist,
  IconChevronDown,
  IconHistory,
  IconLayoutDashboard,
  IconPackage,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { loadItem, loadNpc, loadQuest, loadTaxonomy, lt } from "@/lib/wiki";
import { getStaticUrl } from "@/lib/url";
import type { WikiTaxonomy } from "@/types/wiki";
import {
  WIKI_TYPES,
  type WikiRecentEntry,
  type WikiType,
  useWikiRecentEntries,
} from "@/features/wiki/wikiRecent";

const TYPE_ICONS: Record<WikiType, Icon> = {
  quest: IconChecklist,
  npc: IconUsers,
  item: IconPackage,
};

type RecentLabel = WikiRecentEntry & { label: string };

export default function WikiWorkspace({ children }: { children: ReactNode }) {
  const { hash, pathname } = useLocation();
  const { t, i18n } = useTranslation(["wiki", "wiki/taxonomy"]);
  const [taxonomy, setTaxonomy] = useState<WikiTaxonomy | null>(null);
  const [recentEntries] = useWikiRecentEntries();
  const [recentLabels, setRecentLabels] = useState<RecentLabel[]>([]);
  const activeType = pathname.match(/^\/wiki\/(quest|npc|item)(?:\/|$)/)?.[1] as
    | WikiType
    | undefined;
  const activeNode = taxonomy?.types.find((entry) => entry.slug === activeType);
  const pathGroup = activeNode?.groups.find(
    (group) => group.slug === pathname.split("/")[3],
  )?.slug;
  const hashGroup = (hash ?? "").replace(/^#?group-/, "");
  const activeGroup =
    pathGroup ??
    activeNode?.groups.find((group) => group.slug === hashGroup)?.slug ??
    (pathname === `/wiki/${activeType}` || pathname === `/wiki/${activeType}/`
      ? activeNode?.groups[0]?.slug
      : undefined);

  useEffect(() => {
    loadTaxonomy().then(setTaxonomy).catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadEntry = async (entry: WikiRecentEntry): Promise<RecentLabel> => {
      const entity = entry.type === "quest"
        ? await loadQuest(entry.id)
        : entry.type === "npc"
          ? await loadNpc(entry.id)
          : await loadItem(entry.id);
      return { ...entry, label: lt(entity.name, i18n.language) };
    };

    // allSettled, not all: a data update that removes one entity would otherwise
    // reject the whole batch and empty the entire list, then re-fire all five
    // fetches on every wiki navigation. The state-memory spec wants the one
    // unavailable destination dropped, not the history.
    Promise.allSettled(recentEntries.map(loadEntry))
      .then((results) => {
        if (cancelled) return;
        for (const result of results) {
          if (result.status === "rejected") console.error(result.reason);
        }
        setRecentLabels(
          results
            .filter(
              (result): result is PromiseFulfilledResult<RecentLabel> =>
                result.status === "fulfilled",
            )
            .map((result) => result.value),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [i18n.language, recentEntries]);

  const types = useMemo(
    () =>
      WIKI_TYPES.map((type) => ({
        type,
        count: taxonomy?.types.find((entry) => entry.slug === type)?.count,
        groups: taxonomy?.types.find((entry) => entry.slug === type)?.groups ?? [],
      })),
    [taxonomy],
  );

  return (
    <div className="min-h-full lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)]">
      <aside
        className="hidden border-r border-border bg-[color:var(--arkive-sidebar)] lg:block"
        data-testid="wiki-workspace-rail"
      >
        <div className="sticky top-0 flex max-h-[calc(100dvh-3.5rem)] flex-col overflow-y-auto">
          <div className="flex h-20 shrink-0 items-center gap-3 border-b border-border px-4">
            <img
              src={getStaticUrl("images/Logo.webp")}
              alt="AION2"
              className="size-11 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <strong className="block truncate text-sm font-semibold leading-tight text-[color:var(--arkive-nav-active)]">
                {t("wiki:workspace.title")}
              </strong>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("wiki:nav.wiki")}
              </span>
            </div>
          </div>

          <nav className="py-2" aria-label={t("wiki:nav.wiki")}>
            <RailLink
              to="/wiki"
              label={t("wiki:workspace.overview")}
              active={pathname === "/wiki" || pathname === "/wiki/"}
              icon={IconLayoutDashboard}
            />
            {types.map(({ type, count, groups }) => (
              <Fragment key={type}>
                <RailLink
                  to="/wiki/$type"
                  params={{ type }}
                  label={t(`wiki/taxonomy:types.${type}.name`)}
                  count={count}
                  active={activeType === type}
                  expanded={activeType === type && groups.length > 0}
                  icon={TYPE_ICONS[type]}
                />
                {activeType === type && groups.length > 0 && (
                  <ul className="pb-2" aria-label={t("wiki:hub.categories")}>
                    {groups.map((group) => {
                      const active = activeGroup === group.slug;
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
                            className={`relative grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-1.5 pl-12 pr-4 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                              active
                                ? "bg-[color:var(--arkive-filter-active)] font-semibold text-[color:var(--arkive-nav-active)] before:absolute before:inset-y-1.5 before:left-8 before:w-0.5 before:bg-[color:var(--arkive-nav-active)]"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            }`}
                            aria-current={active ? "page" : undefined}
                            data-testid={`wiki-rail-group-${group.slug}`}
                          >
                            <span className="truncate">
                              {t(
                                `wiki/taxonomy:groups.${type}.${group.slug}.name`,
                              )}
                            </span>
                            <span className="tabular-nums">
                              {group.count.toLocaleString()}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Fragment>
            ))}
          </nav>

          {recentLabels.length > 0 && (
            <section className="mx-4 border-t border-border pb-5 pt-5">
              <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <IconHistory className="size-4" stroke={1.8} aria-hidden />
                {t("wiki:workspace.recent")}
              </h2>
              <ul className="space-y-1">
                {recentLabels.map((entry) => (
                  <li key={`${entry.type}-${entry.id}`}>
                    <Link
                      to="/wiki/$type/$slug"
                      params={{ type: entry.type, slug: String(entry.id) }}
                      className="block min-h-9 truncate rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {entry.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>

      <div className="min-w-0 p-4 md:p-6 2xl:p-8">{children}</div>
    </div>
  );
}

function RailLink({
  to,
  params,
  label,
  count,
  active,
  expanded = false,
  icon: IconComponent,
}: {
  to: string;
  params?: Record<string, string>;
  label: string;
  count?: number;
  active: boolean;
  expanded?: boolean;
  icon: Icon;
}) {
  return (
    <Link
      to={to}
      params={params}
      aria-expanded={expanded || undefined}
      className={`relative flex min-h-11 items-center gap-3 px-5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
        active
          ? "bg-[color:var(--arkive-filter-active)] font-semibold text-[color:var(--arkive-nav-active)] before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[color:var(--arkive-nav-active)]"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <IconComponent className="size-5 shrink-0" stroke={1.8} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="shrink-0 text-xs tabular-nums">{count.toLocaleString()}</span>
      )}
      {expanded && (
        <IconChevronDown className="size-3.5 shrink-0" stroke={1.8} aria-hidden />
      )}
    </Link>
  );
}
