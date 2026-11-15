import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  IconChecklist,
  IconChevronRight,
  IconHistory,
  IconLayoutDashboard,
  IconPackage,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { loadItem, loadNpc, loadQuest, loadTaxonomy, lt } from "@/lib/wiki";
import { ArkiveEncyclopediaWorkspace, type EncyclopediaEntry } from "@gamemap/map-shell";
import { useMemoryState } from '@gamemap/state-memory';
import { hubGroupRecord, railCollapsedRecord } from './wikiMemory';
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
  const [collapsed, setCollapsed] = useMemoryState(railCollapsedRecord);
  const [taxonomy, setTaxonomy] = useState<WikiTaxonomy | null>(null);
  const [recentEntries] = useWikiRecentEntries();
  const [recentLabels, setRecentLabels] = useState<RecentLabel[]>([]);
  const activeType = pathname.match(/^\/wiki\/(quest|npc|item)(?:\/|$)/)?.[1] as
    | WikiType
    | undefined;
  const activeNode = taxonomy?.types.find((entry) => entry.slug === activeType);
  const [storedGroup] = useMemoryState(hubGroupRecord, { partition: activeType ?? 'all' });
  const pathGroup = activeNode?.groups.find(
    (group) => group.slug === pathname.split("/")[3],
  )?.slug;
  const hashGroup = (hash ?? "").replace(/^#?group-/, "");
  const activeGroup =
    pathGroup ??
    activeNode?.groups.find((group) => group.slug === hashGroup)?.slug ??
    (pathname === `/wiki/${activeType}` || pathname === `/wiki/${activeType}/`
      ? activeNode?.groups.find(group => group.slug === storedGroup)?.slug ?? activeNode?.groups[0]?.slug
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

  const entries: EncyclopediaEntry[] = [
    { key: "overview", label: t("wiki:workspace.overview"), icon: <IconLayoutDashboard className="size-6" aria-hidden /> },
    ...types.map(({ type, groups }) => {
      const TypeIcon = TYPE_ICONS[type];
      return {
        key: type, label: t(`wiki/taxonomy:types.${type}.name`), icon: <TypeIcon className="size-6" aria-hidden />,
        children: groups.map(group => ({
          key: `${type}:${group.slug}`, label: t(`wiki/taxonomy:groups.${type}.${group.slug}.name`),
          icon: <IconChevronRight className="size-4" aria-hidden />,
        })),
      };
    }),
  ];
  const active = activeType ? activeGroup ? `${activeType}:${activeGroup}` : activeType : "overview";

  return (
    <div className="min-h-full p-4 md:p-6 2xl:p-8">
      <ArkiveEncyclopediaWorkspace groups={[{ key: "wiki", label: t("wiki:nav.wiki"), entries }]}
        active={active} label={t("wiki:nav.wiki")} collapsed={collapsed} onCollapsedChange={setCollapsed}
        collapseLabel={t("wiki:workspace.collapse")} expandLabel={t("wiki:workspace.expand")}
        renderLink={(entry, className, content) => {
          const [type, slug] = entry.key.split(":");
          const group = types.find(node => node.type === type)?.groups.find(node => node.slug === slug);
          const opensEntries = group?.sections.length === 1 && group.sections[0]?.slug === "other";
          const count = group?.count ?? types.find(node => node.type === type)?.count;
          return <Link to={type === "overview" ? "/wiki" : opensEntries ? "/wiki/$type/$slug" : "/wiki/$type"}
            params={type === "overview" ? undefined : opensEntries ? { type, slug } : { type }}
            hash={slug && !opensEntries ? `group-${slug}` : undefined}
            activeOptions={{ exact: true, includeHash: true }}
            className={className} title={entry.label} aria-current={active === entry.key ? "page" : undefined}
            data-testid={slug ? `wiki-rail-group-${slug}` : undefined}>
            {content}
            {!collapsed && count !== undefined && <span className="ml-auto shrink-0 text-xs tabular-nums">{count.toLocaleString()}</span>}
          </Link>;
        }}
        railFooter={recentLabels.length > 0 && <section className="mx-2 border-t border-border pb-5 pt-5">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <IconHistory className="size-4" stroke={1.8} aria-hidden />{t("wiki:workspace.recent")}
          </h2>
          <ul className="space-y-1">{recentLabels.map(entry => <li key={`${entry.type}-${entry.id}`}>
            <Link to="/wiki/$type/$slug" params={{ type: entry.type, slug: String(entry.id) }}
              className="block min-h-9 truncate rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {entry.label}
            </Link>
          </li>)}</ul>
        </section>}
      >{children}</ArkiveEncyclopediaWorkspace>
    </div>
  );
}
