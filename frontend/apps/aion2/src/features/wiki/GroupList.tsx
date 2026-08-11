import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { defineMemoryRecord, memoryPolicy, useMemoryState } from "@gamemap/state-memory";

import { loadTaxonomy, loadWikiIndex } from "@/lib/wiki";
import type { WikiIndexDoc, WikiTaxonomy } from "@/types/wiki";
import { WikiBackLink } from "@/features/wiki/ui";

const FACTIONS = ["all", "light", "dark"] as const;
type Faction = (typeof FACTIONS)[number];
const factionRecord = defineMemoryRecord({
  id: "faction", namespace: "aion2", surface: "wiki-catalog",
  ...memoryPolicy.sessionContext("clear-wiki-filters"),
  schemaVersion: "1.0.0", defaultValue: () => "all" as Faction,
  validate: (value: unknown): value is Faction => FACTIONS.includes(value as Faction),
});

export default function GroupList({
  type,
  group,
  initialFaction,
}: {
  type: string;
  group: string;
  initialFaction?: Extract<Faction, "light" | "dark">;
}) {
  const { t } = useTranslation(["wiki", "wiki/taxonomy", `wiki/${type}`]);
  const [tax, setTax] = useState<WikiTaxonomy | null>(null);
  const [docs, setDocs] = useState<WikiIndexDoc[]>([]);
  const [storedFaction, setStoredFaction] = useMemoryState(factionRecord, { partition: `${type}:${group}` });
  const [explicitFaction, setExplicitFaction] = useState<Faction | null>(initialFaction ?? null);
  const faction = explicitFaction ?? storedFaction;

  useEffect(() => {
    setExplicitFaction(initialFaction ?? null);
  }, [initialFaction]);

  const chooseFaction = (next: Faction) => {
    setExplicitFaction(null);
    setStoredFaction(next);
  };

  useEffect(() => {
    loadTaxonomy().then(setTax).catch(console.error);
    loadWikiIndex(type).then((r) => setDocs(r.docs)).catch(console.error);
  }, [type]);

  useEffect(() => {
    document.title = `${t(`wiki/taxonomy:groups.${type}.${group}.name`)} - AION2 Wiki`;
  }, [t, type, group]);

  const sections = useMemo(() => {
    const mine = docs.filter(
      (d) =>
        d.group === group &&
        (faction === "all" || d.race === "all" || d.race === faction),
    );
    const by: Record<string, WikiIndexDoc[]> = {};
    for (const d of mine) (by[d.section] ??= []).push(d);
    for (const arr of Object.values(by)) {
      arr.sort((a, b) => a.level - b.level || a.id - b.id);
    }
    return by;
  }, [docs, group, faction]);

  const node = tax?.types
    .find((x) => x.slug === type)
    ?.groups.find((g) => g.slug === group);
  const isFallbackOnly =
    node?.sections.length === 1 && node.sections[0]?.slug === "other";
  const groupDocs = docs.filter((doc) => doc.group === group);
  const hasFactionChoices =
    groupDocs.some((doc) => doc.race === "light") &&
    groupDocs.some((doc) => doc.race === "dark");
  if (!node) {
    return <p className="text-muted-foreground">{t("wiki:list.empty")}</p>;
  }

  return (
    <div
      className={
        isFallbackOnly
          ? "block"
          : "grid gap-8 md:grid-cols-[13rem_minmax(0,1fr)]"
      }
      data-testid="wiki-group-list"
    >
      {!isFallbackOnly && <nav className="sticky top-6 hidden h-fit md:block" data-testid="wiki-section-nav">
        <p className="mb-3 text-xs font-semibold text-muted-foreground">
          {t("wiki:hub.categories")}
        </p>
        <ul className="divide-y divide-border/70 border-y border-border text-sm">
          {node.sections.map((s) => (
            <li key={s.slug}>
              <a
                href={`#${s.slug}`}
                className="flex min-h-10 items-center justify-between gap-3 px-1 py-2 text-muted-foreground transition-colors hover:text-[color:var(--arkive-nav-active)] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 truncate">
                  {t(`wiki/taxonomy:sections.${s.slug}.name`)}
                </span>
                <span className="shrink-0 text-xs tabular-nums">{s.count}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>}
      <div className="min-w-0 flex-1">
        <header className="border-b border-border pb-5">
          <WikiBackLink
            to="/wiki/$type"
            params={{ type }}
            destination={t(`wiki/taxonomy:types.${type}.name`)}
            className="mb-2"
          />
          <h1 className="text-3xl font-bold text-[color:var(--arkive-nav-active)]">
            {t(`wiki/taxonomy:groups.${type}.${group}.name`)}
          </h1>
          {hasFactionChoices && <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-md border border-border text-sm">
            {FACTIONS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => chooseFaction(f)}
                data-testid={`faction-${f}`}
                data-state={faction === f ? "on" : "off"}
                className={`min-h-10 border-r border-border px-3 py-2 font-medium transition-colors last:border-r-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                  faction === f
                    ? "bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]"
                    : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {t(`wiki:list.${f}`)}
              </button>
            ))}
          </div>}
        </header>
        {node.sections.map((s) =>
          sections[s.slug]?.length ? (
            <section key={s.slug} id={s.slug} className="scroll-mt-6 border-b border-border py-6 last:border-b-0">
              {!isFallbackOnly && <div className="mb-3 flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-semibold text-[color:var(--arkive-nav-active)]">
                  {t(`wiki/taxonomy:sections.${s.slug}.name`)}
                </h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("wiki:workspace.entries", { count: sections[s.slug].length })}
                </span>
              </div>}
              <table className="w-full table-fixed text-sm">
                <tbody>
                  {sections[s.slug].map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-border/70 transition-colors last:border-b-0 hover:bg-accent/50"
                    >
                      <td className="w-20 px-2 py-2.5 text-xs tabular-nums text-muted-foreground">
                        {t("wiki:quest.level", { n: d.level })}
                      </td>
                      <td className="min-w-0 px-2 py-2.5">
                        <Link
                          to="/wiki/$type/$slug"
                          params={{ type, slug: String(d.id) }}
                          className="block truncate font-medium hover:text-[color:var(--arkive-nav-active)] hover:underline"
                          data-testid={`wiki-entry-${d.id}`}
                        >
                          {t(`wiki/${type}:${d.id}.name`)}
                        </Link>
                      </td>
                      <td className="w-28 truncate px-2 py-2.5 text-right text-xs text-muted-foreground">
                        {d.mapId ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null,
        )}
      </div>
    </div>
  );
}
