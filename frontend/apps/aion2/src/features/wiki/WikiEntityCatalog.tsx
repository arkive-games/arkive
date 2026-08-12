import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconChevronRight, IconSearch } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Input } from "@gamemap/ui";
import type { WikiIndexDoc } from "@/types/wiki";
import type { WikiType } from "@/features/wiki/wikiRecent";
import { WikiBackLink } from "@/features/wiki/ui";

/** Tailwind `2xl`. The sibling rail is `hidden 2xl:block`, so below this it is
 *  invisible -- and, before this hook, still mounted. */
const WIDE_QUERY = "(min-width: 96rem)";

/**
 * Whether the sibling rail is actually on screen.
 *
 * The rail renders one router Link per sibling, and the largest groups are
 * 2,697 / 1,133 / 783 docs, so `display: none` still cost a phone thousands of
 * mounted Links plus a full re-render on every keystroke in a search box it
 * could not see.
 */
function useWideViewport(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia(WIDE_QUERY).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return wide;
}

export default function WikiEntityCatalog({
  type,
  currentId,
  indexDoc,
  docs,
  children,
}: {
  type: WikiType;
  currentId: number;
  indexDoc: WikiIndexDoc | null;
  docs: WikiIndexDoc[];
  children: ReactNode;
}) {
  const { t } = useTranslation(["wiki", "wiki/taxonomy", `wiki/${type}`]);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.closest("main")?.scrollTo({ top: 0, left: 0 });
  }, [currentId]);

  const groupDocs = useMemo(() => {
    if (!indexDoc) return docs;
    const sameSection = docs.filter(
      (doc) => doc.group === indexDoc.group && doc.section === indexDoc.section,
    );
    if (sameSection.length > 1) return sameSection;
    return docs.filter((doc) => doc.group === indexDoc.group);
  }, [docs, indexDoc]);
  const wide = useWideViewport();
  const entries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return groupDocs
      .map((doc) => ({
        doc,
        name: t(`wiki/${type}:${doc.id}.name`, { defaultValue: `#${doc.id}` }),
      }))
      .filter((entry) => entry.name.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => a.doc.level - b.doc.level || a.doc.id - b.doc.id);
  }, [groupDocs, query, t, type]);
  const groupName = indexDoc?.group
    ? t(`wiki/taxonomy:groups.${type}.${indexDoc.group}.name`)
    : t(`wiki/taxonomy:types.${type}.name`);
  const sectionName = indexDoc?.section && indexDoc.section !== "other"
    ? t(`wiki/taxonomy:sections.${indexDoc.section}.name`, {
        defaultValue: indexDoc.section,
      })
    : null;

  return (
    <div
      ref={rootRef}
      className="min-w-0 2xl:grid 2xl:grid-cols-[19rem_minmax(0,1fr)] 2xl:gap-8"
    >
      {/* The element stays mounted and only its body is gated: it is the first
          child, and dropping it entirely would make React diff the content
          sibling against an <aside> and remount the whole entity page. */}
      <aside
        className="hidden border-r border-border pr-6 2xl:block"
        data-testid="wiki-entity-catalog"
      >
        {wide && (
        <div className="sticky top-0">
          <div className="border-b border-border pb-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("wiki:workspace.context")}
            </p>
            <h2 className="mt-1 text-lg font-semibold">{groupName}</h2>
            {sectionName && (
              <p className="mt-1 text-sm text-muted-foreground">{sectionName}</p>
            )}
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">
              {t("wiki:workspace.entries", { count: groupDocs.length })}
            </p>
          </div>

          <div className="relative my-4">
            <IconSearch
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              stroke={1.8}
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("wiki:workspace.search")}
              aria-label={t("wiki:workspace.search")}
              className="h-10 rounded-md border-border bg-background pl-9 text-sm shadow-none"
            />
          </div>

          <div className="max-h-[calc(100dvh-17rem)] overflow-y-auto pr-2">
            {entries.length > 0 ? (
              <ul>
                {entries.map(({ doc, name }) => {
                  const selected = doc.id === currentId;
                  return (
                    <li key={doc.id} className="border-b border-border/70 last:border-b-0">
                      <Link
                        to="/wiki/$type/$slug"
                        params={{ type, slug: String(doc.id) }}
                        data-current={selected ? "true" : "false"}
                        className={`group relative grid min-h-12 grid-cols-[3.5rem_minmax(0,1fr)_1rem] items-center gap-2 px-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                          selected
                            ? "bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--arkive-nav-active)]"
                            : "hover:bg-accent"
                        }`}
                      >
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {doc.level > 0
                            ? t("wiki:common.level", { n: doc.level })
                            : ""}
                        </span>
                        <span className={`min-w-0 truncate ${selected ? "font-semibold" : "font-medium"}`}>
                          {name}
                        </span>
                        <IconChevronRight
                          className={`size-4 transition-transform group-hover:translate-x-0.5 ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                          stroke={1.8}
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-6 text-sm text-muted-foreground">
                {t("wiki:list.empty")}
              </p>
            )}
          </div>
        </div>
        )}
      </aside>

      <div className="min-w-0">
        <div className="sticky top-0 z-[var(--arkive-layer-sticky)] mb-4 border-b border-border bg-background/98 py-2">
          <WikiBackLink
            to={indexDoc?.group ? "/wiki/$type/$slug" : "/wiki/$type"}
            params={
              indexDoc?.group
                ? { type, slug: indexDoc.group }
                : { type }
            }
            destination={groupName}
          />
        </div>
        {children}
      </div>
    </div>
  );
}
