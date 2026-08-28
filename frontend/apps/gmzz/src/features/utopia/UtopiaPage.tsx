import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconDatabase, IconInfoCircle, IconSearch } from "@tabler/icons-react";
import { Grid2X2, List } from "lucide-react";
import { Input } from "@gamemap/ui";
import { useTranslation } from "react-i18next";

import CatalogPagination from "@/features/traintrade/CatalogPagination";
import {
  loadUtopiaCards,
  tagsOf,
  utopiaIconUrl,
  type UtopiaCard,
} from "@/features/utopia/data";

const QUALITY_OPTIONS = ["all", "1", "2", "3"] as const;
type QualityFilter = (typeof QUALITY_OPTIONS)[number];
type ViewMode = "grid" | "list";
const PAGE_SIZE = 32;

const QUALITY_CLASS: Record<number, string> = {
  1: "text-muted-foreground",
  2: "text-sky-700 dark:text-sky-300",
  3: "text-amber-700 dark:text-amber-300",
};

const QUALITY_SURFACE_CLASS: Record<number, string> = {
  1: "border-border bg-card",
  2: "border-sky-400/60 bg-sky-50/35 dark:border-sky-700 dark:bg-sky-950/15",
  3: "border-amber-400/70 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-950/15",
};

export default function UtopianTheaterPage() {
  const { t } = useTranslation("wiki");
  const [entries, setEntries] = useState<UtopiaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tag, setTag] = useState<string>("");
  const [quality, setQuality] = useState<QualityFilter>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);
  const resultsAnchorRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let live = true;
    loadUtopiaCards()
      .then((data) => {
        if (live) setEntries(data);
      })
      .catch((cause) => {
        console.error(cause);
        if (live) setError(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    document.title = `${t("utopianTheater.title")} - ${t("utopianTheater.siteTitle")}`;
  }, [t]);

  // Groups come from the data rather than a fixed list: the client's Tag is the
  // only grouping it actually carries (see features/utopia/data.ts).
  const tags = useMemo(() => tagsOf(entries), [entries]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { "": entries.length };
    for (const value of tags) {
      result[value] = entries.filter((entry) => entry.tag === value).length;
    }
    return result;
  }, [entries, tags]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return entries.filter((entry) => {
      const matchesTag = tag === "" || entry.tag === tag;
      const matchesQuality = quality === "all" || entry.quality === Number(quality);
      const matchesQuery =
        !needle ||
        `${entry.name} ${entry.description} ${entry.tag}`.toLocaleLowerCase().includes(needle);
      return matchesTag && matchesQuality && matchesQuery;
    });
  }, [entries, tag, quality, query]);

  const qualityCounts = useMemo(() => {
    const result: Record<QualityFilter, number> = { all: entries.length, "1": 0, "2": 0, "3": 0 };
    for (const entry of entries) result[String(entry.quality) as QualityFilter] += 1;
    return result;
  }, [entries]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleEntries = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    window.requestAnimationFrame(() => resultsAnchorRef.current?.scrollIntoView({ block: "start" }));
  };

  if (loading) {
    return (
      <div className="space-y-5" role="status" aria-label={t("common.loading")} data-testid="utopian-theater-loading">
        <div className="h-28 animate-pulse rounded-md bg-muted" />
        <div className="h-11 animate-pulse rounded-md bg-muted" />
        <div className="h-96 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-muted-foreground">{t("utopianTheater.loadError")}</p>;
  }

  return (
    <div data-testid="utopian-theater-page" className="space-y-3">
      <header className="grid gap-4 border-b border-border pb-4 md:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] md:items-end">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-foreground">
            {t("utopianTheater.title")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {t("utopianTheater.description", { count: entries.length })}
          </p>
          <p className="mt-0.5 max-w-3xl text-xs leading-5 text-muted-foreground">
            {t("utopianTheater.dungeonNote")}
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t("utopianTheater.searchLabel")}</span>
          <span className="relative block">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" stroke={1.8} aria-hidden />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setQuery("");
                  setPage(1);
                }
              }}
              placeholder={t("utopianTheater.searchPlaceholder")}
              className="h-10 border-border bg-background pl-9 text-sm shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]"
              data-testid="utopian-search"
            />
          </span>
        </label>
      </header>

      <section
        aria-label={t("utopianTheater.tags")}
        className="grid gap-3 border-b border-border pb-3 lg:grid-cols-2 lg:gap-6"
      >
        <FilterGroup label={t("utopianTheater.tagLabel")} hint={t("utopianTheater.tagHint")}>
          {["", ...tags].map((value) => (
            <FilterChip
              key={value || "all"}
              active={tag === value}
              onClick={() => {
                setTag(value);
                setPage(1);
              }}
              testId={`utopia-tag-${value || "all"}`}
            >
              {value || t("utopianTheater.tagAll")}
              <span className="tabular-nums text-muted-foreground">{counts[value] ?? 0}</span>
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterGroup label={t("utopianTheater.quality")} hint={t("utopianTheater.qualityHint")}>
          {QUALITY_OPTIONS.map((value) => (
            <FilterChip
              key={value}
              active={quality === value}
              onClick={() => {
                setQuality(value);
                setPage(1);
              }}
              testId={`utopian-quality-${value}`}
            >
              {value === "all" ? t("utopianTheater.all") : t("utopianTheater.qualityValue", { value })}
              <span className="tabular-nums text-muted-foreground">{qualityCounts[value]}</span>
            </FilterChip>
          ))}
        </FilterGroup>
      </section>

      <section ref={resultsAnchorRef} data-pagination-anchor className="flex min-h-9 scroll-mt-4 items-center justify-between gap-3 border-b border-border pb-2">
        <span className="text-sm tabular-nums text-muted-foreground">
          {t("utopianTheater.resultCount", { count: filtered.length })}
        </span>
        <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border" role="group" aria-label={t("utopianTheater.view")}>
          <button
            type="button"
            aria-pressed={view === "grid"}
            onClick={() => {
              setView("grid");
              setPage(1);
            }}
            className={`inline-flex min-h-9 items-center gap-1.5 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)] ${view === "grid" ? "bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            data-testid="utopian-view-grid"
          >
            <Grid2X2 className="size-4" aria-hidden />
            {t("utopianTheater.viewGrid")}
          </button>
          <button
            type="button"
            aria-pressed={view === "list"}
            onClick={() => {
              setView("list");
              setPage(1);
            }}
            className={`inline-flex min-h-9 items-center gap-1.5 border-l border-border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)] ${view === "list" ? "bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            data-testid="utopian-view-list"
          >
            <List className="size-4" aria-hidden />
            {t("utopianTheater.viewList")}
          </button>
        </div>
      </section>

      {filtered.length === 0 ? (
        <p className="border-y border-border py-12 text-center text-sm text-muted-foreground">{t("utopianTheater.empty")}</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="utopian-memory-grid">
          {visibleEntries.map((entry) => (
            <article
              key={entry.cardId}
              className={`group min-w-0 rounded-md border p-2.5 transition-colors hover:border-[color:var(--arkive-nav-accent)] ${QUALITY_SURFACE_CLASS[entry.quality]}`}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <img
                    src={utopiaIconUrl(entry.icon)}
                    alt=""
                    loading="lazy"
                    className="size-8 shrink-0 rounded border border-border/70 bg-muted/30 object-contain"
                  />
                  <h2 className="min-w-0 truncate text-sm font-bold leading-5 text-foreground" title={entry.name}>{entry.name}</h2>
                </div>
                <span className={`shrink-0 pt-0.5 text-xs font-semibold ${QUALITY_CLASS[entry.quality]}`}>
                  {t("utopianTheater.qualityValue", { value: entry.quality })}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-5 text-foreground/85 md:min-h-[3.75rem] md:line-clamp-3" title={entry.description}>{entry.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/70 pt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/75">{entry.tag}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border" data-testid="utopian-memory-list">
          {visibleEntries.map((entry) => (
            <article key={entry.cardId} className="grid gap-2 py-3 md:grid-cols-[10rem_minmax(0,1fr)_auto] md:items-start md:gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <img
                  src={utopiaIconUrl(entry.icon)}
                  alt=""
                  loading="lazy"
                  className="size-9 shrink-0 rounded border border-border/70 bg-muted/30 object-contain"
                />
                <h2 className="min-w-0 text-base font-semibold text-[color:var(--arkive-nav-active)]">{entry.name}</h2>
              </div>
              <p className="text-sm leading-6 text-foreground/90">{entry.description}</p>
              <div className="flex flex-wrap items-start justify-start gap-x-3 gap-y-1 md:max-w-48 md:justify-end">
                <span className={`text-xs font-semibold ${QUALITY_CLASS[entry.quality]}`}>
                  {t("utopianTheater.qualityValue", { value: entry.quality })}
                </span>
                <span className="text-xs text-muted-foreground">{entry.tag}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      <CatalogPagination page={currentPage} pageCount={pageCount} onPageChange={changePage} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <p className="flex items-center gap-2">
          <IconDatabase className="size-4" stroke={1.8} aria-hidden />
          {t("utopianTheater.sourceNote")}
        </p>
        <p className="flex items-center gap-2">
          <IconInfoCircle className="size-4" stroke={1.8} aria-hidden />
          {t("utopianTheater.runtimeNote")}
        </p>
      </div>
    </div>
  );
}

function FilterGroup({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-sm font-bold text-foreground">{label}</h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)] ${
        active
          ? "border-[color:var(--arkive-nav-accent)] bg-[color:var(--arkive-filter-active)] text-foreground"
          : "border-border bg-background text-muted-foreground hover:border-[color:var(--arkive-nav-accent)]/60 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
